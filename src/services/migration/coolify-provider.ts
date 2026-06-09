import "server-only";
import { randomBytes } from "node:crypto";
import { coolifyService } from "@/services/coolify/service";
import { CoolifyError } from "@/services/coolify/types";
import { hostCredentialsService } from "./host-credentials";
import * as ssh from "./ssh";
import type { PlatformProvider } from "./provider";
import { MigrationError } from "./types";
import type {
  CreateResourceSpec,
  HostCapacity,
  HostSummary,
  ResourceInfo,
  ResourceSummary,
  SwitchEndpointsInput,
  VolumeInfo,
} from "./types";
import type { ResourceType } from "@/lib/migration";

const DEPLOY_TIMEOUT_MS = 10 * 60 * 1000;
const DEPLOY_POLL_MS = 2_000;

function splitDomains(fqdn: string | null | undefined): string[] {
  if (!fqdn) return [];
  return fqdn.split(",").map((d) => d.trim()).filter(Boolean);
}

/**
 * Coolify stores public-repo apps as "owner/repo" but POST /applications/public
 * requires a full URL (must start with https://, http://, git://, or git@).
 * Short forms are assumed to be GitHub.com (matching Coolify's default public
 * source). Already-qualified URLs pass through unchanged.
 */
function toGitUrl(repo: string | null | undefined): string {
  const r = (repo ?? "").trim();
  if (!r) return r;
  if (/^(https?:\/\/|git:\/\/|git@)/i.test(r)) return r;
  return `https://github.com/${r}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function is404(err: unknown): boolean {
  return err instanceof CoolifyError && err.code === "HTTP_404";
}

/** Resolve an app's integer environment_id to its project uuid + environment name. */
async function resolveProjectEnv(
  environmentId: number | null | undefined,
): Promise<{ projectUuid: string; environmentName: string }> {
  if (environmentId == null) return { projectUuid: "", environmentName: "" };
  const projects = await coolifyService.listProjects();
  for (const p of projects) {
    const detail = await coolifyService.getProject(p.uuid);
    const env = detail.environments?.find((e) => e.id === environmentId);
    if (env) return { projectUuid: p.uuid, environmentName: env.name };
  }
  return { projectUuid: "", environmentName: "" };
}

/**
 * Resolve the resource type by probing the Coolify API: application first
 * (most common), then service, then database. Returns null when not found.
 */
async function resolveResourceType(id: string): Promise<ResourceType | null> {
  try {
    await coolifyService.getApplication(id);
    return "application";
  } catch (err) {
    if (!is404(err)) throw err;
  }
  try {
    await coolifyService.getService(id);
    return "service";
  } catch (err) {
    if (!is404(err)) throw err;
  }
  try {
    await coolifyService.getDatabase(id);
    return "database";
  } catch (err) {
    if (!is404(err)) throw err;
  }
  return null;
}

export const coolifyPlatformProvider: PlatformProvider = {
  async listHosts(): Promise<HostSummary[]> {
    const servers = await coolifyService.listServers();
    return servers.map((s) => ({ id: s.uuid, name: s.name, ip: s.ip ?? "" }));
  },

  async getHostCapacity(hostId: string): Promise<HostCapacity> {
    let reachable = false;
    try {
      const server = await coolifyService.getServer(hostId);
      reachable = server.settings?.is_reachable ?? false;
    } catch {
      reachable = false;
    }

    // If a host credential exists, measure real capacity over SSH.
    // Fall back to zeros + metricsAvailable: false on any failure.
    try {
      const cred = await hostCredentialsService.getByServerUuid(hostId);
      if (cred) {
        const target = {
          host: cred.ipAddress,
          port: cred.sshPort,
          username: cred.sshUsername,
          privateKey: cred.privateKey(),
        };
        const { freeMemoryMb, freeDiskMb } = await ssh.readCapacity(target);
        return { hostId, reachable, freeMemoryMb, freeDiskMb, metricsAvailable: true };
      }
    } catch {
      // SSH unavailable or credential missing; fall through to zero metrics.
    }

    return { hostId, reachable, freeMemoryMb: 0, freeDiskMb: 0, metricsAvailable: false };
  },

  async listResources(): Promise<ResourceSummary[]> {
    const [apps, services, databases] = await Promise.all([
      coolifyService.listApplications(),
      coolifyService.listServices(),
      coolifyService.listDatabases(),
    ]);

    const appSummaries: ResourceSummary[] = apps.map((a) => ({
      id: a.uuid,
      name: a.name,
      type: "application" as ResourceType,
      environment: "",
      hostId: a.destination?.server?.uuid ?? "",
      hostName: a.destination?.server?.name ?? "",
      domains: splitDomains(a.fqdn),
    }));

    const serviceSummaries: ResourceSummary[] = services.map((s) => ({
      id: s.uuid,
      name: s.name,
      type: "service" as ResourceType,
      environment: "",
      // Services expose server at the top level (no destination wrapper)
      hostId: s.server?.uuid ?? "",
      hostName: s.server?.name ?? "",
      domains: [],
    }));

    const dbSummaries: ResourceSummary[] = databases.map((d) => ({
      id: d.uuid,
      name: d.name,
      type: "database" as ResourceType,
      environment: "",
      hostId: d.destination?.server?.uuid ?? "",
      hostName: d.destination?.server?.name ?? "",
      domains: [],
    }));

    return [...appSummaries, ...serviceSummaries, ...dbSummaries];
  },

  async inspectResource(id: string): Promise<ResourceInfo> {
    const resourceType = await resolveResourceType(id);

    if (resourceType === "application") {
      return inspectApplication(id);
    }
    if (resourceType === "service") {
      return inspectService(id);
    }
    if (resourceType === "database") {
      return inspectDatabase(id);
    }
    throw new MigrationError(
      `Resource ${id} was not found as an application, service, or database.`,
      "NOT_FOUND",
    );
  },

  async resourceExistsOnHost(hostId: string, name: string): Promise<boolean> {
    const resources = await coolifyService.listServerResources(hostId);
    return resources.some((r) => r.name === name);
  },

  async createResource(spec: CreateResourceSpec): Promise<{ resourceId: string }> {
    const type = spec.snapshot.type;
    if (type === "application") {
      return createApplication(spec);
    }
    if (type === "service") {
      return createService(spec);
    }
    // Databases contain stateful data in volumes; migrating the config without
    // the data would leave the destination broken. Deferred to Phase F.
    throw new MigrationError(
      "Database migration requires volume transfer (Phase F); not yet supported.",
      "DB_MIGRATION_UNSUPPORTED",
    );
  },

  async deployResource(id: string): Promise<void> {
    const res = await coolifyService.deploy(id);
    const deploymentUuid = res.deployments?.[0]?.deployment_uuid;
    if (!deploymentUuid) {
      // Older Coolify returns only a message and cannot be polled; best effort.
      return;
    }
    const deadline = Date.now() + DEPLOY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      let status = "";
      try {
        const dep = await coolifyService.getDeployment(deploymentUuid);
        status = (dep.status ?? "").toLowerCase();
      } catch {
        // Coolify's API can briefly stall while it builds (CPU-bound), causing a
        // poll to time out. That is not a deployment failure; keep polling until
        // the deadline rather than aborting a deploy that is still running.
        await sleep(DEPLOY_POLL_MS);
        continue;
      }
      if (status.includes("finish") || status === "success") return;
      if (status.includes("fail") || status.includes("error") || status.includes("cancel")) {
        throw new MigrationError(`Coolify deployment ${status || "failed"}.`, "DEPLOY_FAILED");
      }
      await sleep(DEPLOY_POLL_MS);
    }
    throw new MigrationError("Coolify deployment timed out.", "DEPLOY_TIMEOUT");
  },

  async generateValidationUrl(id: string, hostIp: string): Promise<string> {
    const app = await coolifyService.getApplication(id);
    const existing = splitDomains(app.fqdn)[0];
    if (existing) return existing.startsWith("http") ? existing : `https://${existing}`;
    const url = `https://${randomBytes(4).toString("hex")}.${hostIp}.sslip.io`;
    await coolifyService.updateApplication(id, { domains: url });
    await this.deployResource(id);
    return url;
  },

  async stopResource(id: string): Promise<void> {
    const type = await resolveResourceType(id);
    if (type === "service") {
      await coolifyService.stopService(id);
    } else if (type === "database") {
      await coolifyService.stopDatabase(id);
    } else {
      await coolifyService.stopApplication(id);
    }
  },

  async startResource(id: string): Promise<void> {
    const type = await resolveResourceType(id);
    if (type === "service") {
      await coolifyService.startService(id);
    } else if (type === "database") {
      await coolifyService.startDatabase(id);
    } else {
      await coolifyService.startApplication(id);
    }
  },

  async switchEndpoints({ sourceResourceId, destinationResourceId, domains }: SwitchEndpointsInput): Promise<void> {
    if (domains.length === 0) return;
    // Release the domains from the source so the destination can claim them,
    // then assign them to the destination and redeploy so the proxy serves them.
    await coolifyService.updateApplication(sourceResourceId, { domains: "" });
    await coolifyService.updateApplication(destinationResourceId, { domains: domains.join(",") });
    await this.deployResource(destinationResourceId);
  },

  async deleteResource(id: string): Promise<void> {
    const type = await resolveResourceType(id);
    if (type === "service") {
      await coolifyService.deleteService(id);
    } else if (type === "database") {
      await coolifyService.deleteDatabase(id);
    } else {
      await coolifyService.deleteApplication(id);
    }
  },
};

// ── Private per-type inspect helpers ──────────────────────────────────────────

async function inspectApplication(id: string): Promise<ResourceInfo> {
  const app = await coolifyService.getApplication(id);
  const [envs, storagesResp] = await Promise.all([
    coolifyService.listEnvVars(id),
    coolifyService.listStorages(id).catch(() => ({})),
  ]);
  const { projectUuid, environmentName } = await resolveProjectEnv(app.environment_id);
  const persistent = (storagesResp as { persistent_storages?: Array<{ name: string; mount_path?: string | null }> }).persistent_storages ?? [];
  const volumes: VolumeInfo[] = persistent.map((s) => ({ name: s.name, estimatedSizeMb: 0 }));
  return {
    id: app.uuid,
    name: app.name,
    type: "application",
    environment: environmentName,
    hostId: app.destination?.server?.uuid ?? "",
    hostName: app.destination?.server?.name ?? "",
    domains: splitDomains(app.fqdn),
    envVars: envs.map((e) => ({ key: e.key, value: e.value })),
    buildConfig: {
      git_repository: app.git_repository ?? "",
      git_branch: app.git_branch ?? "main",
      build_pack: app.build_pack ?? "nixpacks",
      ports_exposes: app.ports_exposes ?? "3000",
      project_uuid: projectUuid,
      environment_name: environmentName,
      source_id: app.source_id ?? null,
      source_type: app.source_type ?? "",
      install_command: app.install_command ?? null,
      build_command: app.build_command ?? null,
      start_command: app.start_command ?? null,
      base_directory: app.base_directory ?? null,
      publish_directory: app.publish_directory ?? null,
      health_check_enabled: app.health_check_enabled ?? null,
      health_check_path: app.health_check_path ?? null,
      ports_mappings: app.ports_mappings ?? null,
      limits_memory: app.limits_memory ?? null,
      limits_cpus: app.limits_cpus ?? null,
      pre_deployment_command: app.pre_deployment_command ?? null,
      post_deployment_command: app.post_deployment_command ?? null,
      custom_docker_run_options: app.custom_docker_run_options ?? null,
      static_image: app.static_image ?? null,
    },
    volumes,
  };
}

async function inspectService(id: string): Promise<ResourceInfo> {
  const svc = await coolifyService.getService(id);
  const [envs, storagesResp] = await Promise.all([
    coolifyService.listServiceEnvs(id).catch(() => [] as Array<{ key: string; value: string }>),
    coolifyService.listServiceStorages(id).catch(() => ({})),
  ]);
  const { projectUuid, environmentName } = await resolveProjectEnv(svc.environment_id);
  const persistent = (storagesResp as { persistent_storages?: Array<{ name: string; mount_path?: string | null }> }).persistent_storages ?? [];
  const volumes: VolumeInfo[] = persistent.map((s) => ({ name: s.name, estimatedSizeMb: 0 }));
  return {
    id: svc.uuid,
    name: svc.name,
    type: "service",
    environment: environmentName,
    // Services expose server at top level, not in a destination wrapper
    hostId: svc.server?.uuid ?? "",
    hostName: svc.server?.name ?? "",
    domains: [],
    envVars: envs.map((e) => ({ key: e.key, value: e.value })),
    buildConfig: {
      docker_compose_raw: svc.docker_compose_raw ?? "",
      project_uuid: projectUuid,
      environment_name: environmentName,
    },
    volumes,
  };
}

async function inspectDatabase(id: string): Promise<ResourceInfo> {
  const db = await coolifyService.getDatabase(id);
  const { environmentName } = await resolveProjectEnv(db.environment_id);
  return {
    id: db.uuid,
    name: db.name,
    type: "database",
    environment: environmentName,
    hostId: db.destination?.server?.uuid ?? "",
    hostName: db.destination?.server?.name ?? "",
    domains: [],
    envVars: [],
    buildConfig: {
      database_type: db.database_type ?? "",
    },
    volumes: [],
  };
}

// ── Private per-type create helpers ───────────────────────────────────────────

async function createApplication(spec: CreateResourceSpec): Promise<{ resourceId: string }> {
  const cfg = spec.snapshot.buildConfig as Record<string, unknown>;
  const projectUuid = String(cfg.project_uuid ?? "");
  if (!projectUuid) {
    throw new MigrationError(
      "Cannot infer the destination project for this resource. (Explicit targeting arrives in Phase C.)",
      "INFER_FAILED",
    );
  }
  const gitRepo = String(cfg.git_repository ?? "");
  const sourceId = typeof cfg.source_id === "number" ? cfg.source_id : null;
  const sourceType = String(cfg.source_type ?? "");
  const common = {
    project_uuid: projectUuid,
    server_uuid: spec.destinationHostId,
    environment_name: String(cfg.environment_name || "production"),
    git_branch: String(cfg.git_branch || "main"),
    build_pack: String(cfg.build_pack || "nixpacks"),
    ports_exposes: String(cfg.ports_exposes || "3000"),
    name: spec.name,
  };

  let created: { uuid: string } | null = null;
  if (/GithubApp/i.test(sourceType) && sourceId != null) {
    const apps = await coolifyService.listGithubApps();
    const ghApp = apps.find((a) => a.id === sourceId);
    if (ghApp && !ghApp.is_public) {
      created = await coolifyService.createApplicationPrivateGithubApp({
        ...common,
        github_app_uuid: ghApp.uuid,
        git_repository: gitRepo,
      });
    }
  }
  if (!created) {
    created = await coolifyService.createApplication({
      ...common,
      git_repository: toGitUrl(gitRepo),
    });
  }

  const buildPatch: Record<string, string | boolean> = {};
  for (const field of [
    "install_command",
    "build_command",
    "start_command",
    "base_directory",
    "publish_directory",
    "health_check_path",
    "ports_mappings",
    "limits_memory",
    "limits_cpus",
    "pre_deployment_command",
    "post_deployment_command",
    "custom_docker_run_options",
    "static_image",
  ] as const) {
    const value = cfg[field];
    if (typeof value === "string" && value.length > 0) buildPatch[field] = value;
  }
  const hce = cfg["health_check_enabled"];
  if (typeof hce === "boolean") buildPatch["health_check_enabled"] = hce;

  if (Object.keys(buildPatch).length > 0) {
    await coolifyService.updateApplication(created.uuid, buildPatch);
  }

  if (spec.snapshot.envVars.length > 0) {
    await coolifyService.setEnvVarsBulk(created.uuid, spec.snapshot.envVars);
  }
  return { resourceId: created.uuid };
}

async function createService(spec: CreateResourceSpec): Promise<{ resourceId: string }> {
  const cfg = spec.snapshot.buildConfig as Record<string, unknown>;
  const projectUuid = String(cfg.project_uuid ?? "");
  if (!projectUuid) {
    throw new MigrationError(
      "Cannot infer the destination project for this service. (Explicit targeting arrives in Phase C.)",
      "INFER_FAILED",
    );
  }
  const composeRaw = String(cfg.docker_compose_raw ?? "");
  if (!composeRaw) {
    throw new MigrationError(
      "Service snapshot is missing docker_compose_raw; cannot recreate.",
      "MISSING_COMPOSE",
    );
  }

  const created = await coolifyService.createService({
    project_uuid: projectUuid,
    server_uuid: spec.destinationHostId,
    environment_name: String(cfg.environment_name || "production"),
    name: spec.name,
    // POST /services requires docker_compose_raw to be base64-encoded (confirmed live)
    docker_compose_raw: Buffer.from(composeRaw).toString("base64"),
  });

  // Replicate env vars via bulk-upsert on the new service
  if (spec.snapshot.envVars.length > 0) {
    await coolifyService.setEnvVarsBulk(created.uuid, spec.snapshot.envVars);
  }
  return { resourceId: created.uuid };
}
