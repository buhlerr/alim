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
const DEPLOY_POLL_MS = 5_000;

function splitDomains(fqdn: string | null | undefined): string[] {
  if (!fqdn) return [];
  return fqdn.split(",").map((d) => d.trim()).filter(Boolean);
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

  // Action methods implemented in Task 6.
  async createResource(_spec: CreateResourceSpec): Promise<{ resourceId: string }> {
    throw new MigrationError("createResource not implemented yet.", "NOT_IMPLEMENTED");
  },
  async deployResource(_id: string): Promise<void> {
    throw new MigrationError("deployResource not implemented yet.", "NOT_IMPLEMENTED");
  },
  async generateValidationUrl(_id: string, _hostIp: string): Promise<string> {
    throw new MigrationError("generateValidationUrl not implemented yet.", "NOT_IMPLEMENTED");
  },
  async stopResource(_id: string): Promise<void> {
    throw new MigrationError("stopResource not implemented yet.", "NOT_IMPLEMENTED");
  },
  async startResource(_id: string): Promise<void> {
    throw new MigrationError("startResource not implemented yet.", "NOT_IMPLEMENTED");
  },
  async switchEndpoints(_job: MigrationJobLike): Promise<void> {
    // Endpoint switching is deferred (roadmap). No-op this phase.
  },
  async deleteResource(_id: string): Promise<void> {
    throw new MigrationError("deleteResource not implemented yet.", "NOT_IMPLEMENTED");
  },
};

// Used by Task 6; remove this export when the action methods are implemented.
export const __t6 = { DEPLOY_TIMEOUT_MS, DEPLOY_POLL_MS, sleep, splitDomains, randomBytes };
