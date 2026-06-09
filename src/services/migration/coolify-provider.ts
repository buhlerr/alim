import "server-only";
import { randomBytes } from "node:crypto";
import { coolifyService } from "@/services/coolify/service";
import type { PlatformProvider } from "./provider";
import { MigrationError } from "./types";
import type {
  CreateResourceSpec,
  HostCapacity,
  HostSummary,
  MigrationJobLike,
  ResourceInfo,
  ResourceSummary,
  VolumeInfo,
} from "./types";

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
    return { hostId, reachable, freeMemoryMb: 0, freeDiskMb: 0, metricsAvailable: false };
  },

  async listResources(): Promise<ResourceSummary[]> {
    const apps = await coolifyService.listApplications();
    return apps.map((a) => ({
      id: a.uuid,
      name: a.name,
      environment: "",
      hostId: a.destination?.server?.uuid ?? "",
      hostName: a.destination?.server?.name ?? "",
      domains: splitDomains(a.fqdn),
    }));
  },

  async inspectResource(id: string): Promise<ResourceInfo> {
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
      environment: environmentName,
      hostId: app.destination?.server?.uuid ?? "",
      hostName: app.destination?.server?.name ?? "",
      domains: splitDomains(app.fqdn),
      type: "application",
      envVars: envs.map((e) => ({ key: e.key, value: e.value })),
      buildConfig: {
        git_repository: app.git_repository ?? "",
        git_branch: app.git_branch ?? "main",
        build_pack: app.build_pack ?? "nixpacks",
        ports_exposes: app.ports_exposes ?? "3000",
        project_uuid: projectUuid,
        environment_name: environmentName,
      },
      volumes,
    };
  },

  async resourceExistsOnHost(hostId: string, name: string): Promise<boolean> {
    const resources = await coolifyService.listServerResources(hostId);
    return resources.some((r) => r.name === name);
  },

  async createResource(spec: CreateResourceSpec): Promise<{ resourceId: string }> {
    const cfg = spec.snapshot.buildConfig as Record<string, string>;
    if (!cfg.project_uuid) {
      throw new MigrationError(
        "Cannot infer the destination project for this resource. (Explicit targeting arrives in Phase C.)",
        "INFER_FAILED",
      );
    }
    const created = await coolifyService.createApplication({
      project_uuid: cfg.project_uuid,
      server_uuid: spec.destinationHostId,
      environment_name: cfg.environment_name || "production",
      git_repository: toGitUrl(cfg.git_repository),
      git_branch: cfg.git_branch || "main",
      build_pack: cfg.build_pack || "nixpacks",
      ports_exposes: cfg.ports_exposes || "3000",
      name: spec.name,
    });
    if (spec.snapshot.envVars.length > 0) {
      // Bulk upsert: POST /envs 409s on keys Coolify auto-creates on the new app.
      await coolifyService.setEnvVarsBulk(created.uuid, spec.snapshot.envVars);
    }
    return { resourceId: created.uuid };
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
      const dep = await coolifyService.getDeployment(deploymentUuid);
      const status = (dep.status ?? "").toLowerCase();
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
    await coolifyService.stopApplication(id);
  },

  async startResource(id: string): Promise<void> {
    await coolifyService.startApplication(id);
  },

  async switchEndpoints(_job: MigrationJobLike): Promise<void> {
    // Endpoint switching is deferred (roadmap). No-op this phase.
  },

  async deleteResource(id: string): Promise<void> {
    await coolifyService.deleteApplication(id);
  },
};
