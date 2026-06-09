import "server-only";
import { coolifyFetch } from "./client";
import {
  CoolifyError,
  type CoolifyApplication,
  type CoolifyConnectionResult,
  type CoolifyDatabase,
  type CoolifyDeployment,
  type CoolifyDeployResponse,
  type CoolifyEnvVar,
  type CoolifyGithubApp,
  type CoolifyProject,
  type CoolifyServer,
  type CoolifyServerResource,
  type CoolifyService,
  type CoolifyStoragesResponse,
  type CreatePrivateGithubAppRequest,
  type CreateApplicationRequest,
  type CreateServiceRequest,
  type CreateServiceResponse,
  type UpdateApplicationRequest,
} from "./types";

/**
 * High-level Coolify operations. All HTTP goes through `coolifyFetch`, so the
 * endpoint paths below are the single place to adjust if your Coolify version
 * differs. Mirrors the provisioning service's "singleton object of async
 * methods" shape.
 */
export const coolifyService = {
  async testConnection(): Promise<CoolifyConnectionResult> {
    try {
      const version = await coolifyFetch<string>({ path: "/version" });
      return {
        ok: true,
        message: "Connection OK.",
        version: typeof version === "string" ? version : undefined,
      };
    } catch (err) {
      const ce = err instanceof CoolifyError ? err : null;
      return {
        ok: false,
        message: ce?.message ?? "Could not reach Coolify.",
      };
    }
  },

  async listApplications(): Promise<CoolifyApplication[]> {
    return coolifyFetch<CoolifyApplication[]>({ path: "/applications" });
  },

  async getApplication(uuid: string): Promise<CoolifyApplication> {
    return coolifyFetch<CoolifyApplication>({ path: `/applications/${uuid}` });
  },

  async createApplication(
    req: CreateApplicationRequest,
  ): Promise<{ uuid: string }> {
    return coolifyFetch<{ uuid: string }>({
      path: "/applications/public",
      method: "POST",
      body: req,
    });
  },

  async updateApplication(
    uuid: string,
    patch: UpdateApplicationRequest,
  ): Promise<void> {
    await coolifyFetch<void>({
      path: `/applications/${uuid}`,
      method: "PATCH",
      body: patch,
    });
  },

  async deploy(uuid: string): Promise<CoolifyDeployResponse> {
    return coolifyFetch<CoolifyDeployResponse>({ path: "/deploy", query: { uuid } });
  },

  async listEnvVars(uuid: string): Promise<CoolifyEnvVar[]> {
    return coolifyFetch<CoolifyEnvVar[]>({ path: `/applications/${uuid}/envs` });
  },

  async setEnvVar(uuid: string, key: string, value: string): Promise<void> {
    await coolifyFetch<void>({
      path: `/applications/${uuid}/envs`,
      method: "POST",
      body: { key, value },
    });
  },

  /**
   * Upsert many env vars in one call. POST /envs 409s when a key already exists
   * (Coolify auto-creates some on new apps), so replication uses bulk PATCH.
   */
  async setEnvVarsBulk(
    uuid: string,
    vars: Array<{ key: string; value: string }>,
  ): Promise<void> {
    await coolifyFetch<void>({
      path: `/applications/${uuid}/envs/bulk`,
      method: "PATCH",
      body: { data: vars },
    });
  },

  async listProjects(): Promise<CoolifyProject[]> {
    return coolifyFetch<CoolifyProject[]>({ path: "/projects" });
  },

  async listServers(): Promise<CoolifyServer[]> {
    return coolifyFetch<CoolifyServer[]>({ path: "/servers" });
  },

  async listGithubApps(): Promise<CoolifyGithubApp[]> {
    return coolifyFetch<CoolifyGithubApp[]>({ path: "/github-apps" });
  },

  /** Create an app from a private repo via a Coolify GitHub App (carries auth). */
  async createApplicationPrivateGithubApp(
    req: CreatePrivateGithubAppRequest,
  ): Promise<{ uuid: string }> {
    return coolifyFetch<{ uuid: string }>({
      path: "/applications/private-github-app",
      method: "POST",
      body: req,
    });
  },

  async getServer(uuid: string): Promise<CoolifyServer> {
    return coolifyFetch<CoolifyServer>({ path: `/servers/${uuid}` });
  },

  async getProject(uuid: string): Promise<CoolifyProject> {
    return coolifyFetch<CoolifyProject>({ path: `/projects/${uuid}` });
  },

  async listServerResources(uuid: string): Promise<CoolifyServerResource[]> {
    return coolifyFetch<CoolifyServerResource[]>({ path: `/servers/${uuid}/resources` });
  },

  async listStorages(uuid: string): Promise<CoolifyStoragesResponse> {
    return coolifyFetch<CoolifyStoragesResponse>({ path: `/applications/${uuid}/storages` });
  },

  async getDeployment(uuid: string): Promise<CoolifyDeployment> {
    return coolifyFetch<CoolifyDeployment>({ path: `/deployments/${uuid}` });
  },

  async startApplication(uuid: string): Promise<void> {
    await coolifyFetch<void>({ path: `/applications/${uuid}/start` });
  },

  async stopApplication(uuid: string): Promise<void> {
    await coolifyFetch<void>({ path: `/applications/${uuid}/stop` });
  },

  async deleteApplication(uuid: string): Promise<void> {
    await coolifyFetch<void>({
      path: `/applications/${uuid}`,
      method: "DELETE",
      query: { delete_configurations: true, delete_volumes: false, docker_cleanup: true },
    });
  },

  // ── Services (docker-compose) ───────────────────────────────────────────────

  async listServices(): Promise<CoolifyService[]> {
    return coolifyFetch<CoolifyService[]>({ path: "/services" });
  },

  async getService(uuid: string): Promise<CoolifyService> {
    return coolifyFetch<CoolifyService>({ path: `/services/${uuid}` });
  },

  async listServiceEnvs(uuid: string): Promise<CoolifyEnvVar[]> {
    return coolifyFetch<CoolifyEnvVar[]>({ path: `/services/${uuid}/envs` });
  },

  async listServiceStorages(uuid: string): Promise<CoolifyStoragesResponse> {
    return coolifyFetch<CoolifyStoragesResponse>({ path: `/services/${uuid}/storages` });
  },

  /**
   * Create a new docker-compose service. `docker_compose_raw` in the request
   * must be base64-encoded (confirmed live).
   */
  async createService(req: CreateServiceRequest): Promise<CreateServiceResponse> {
    return coolifyFetch<CreateServiceResponse>({
      path: "/services",
      method: "POST",
      body: req,
    });
  },

  async startService(uuid: string): Promise<void> {
    await coolifyFetch<void>({ path: `/services/${uuid}/start` });
  },

  async stopService(uuid: string): Promise<void> {
    await coolifyFetch<void>({ path: `/services/${uuid}/stop` });
  },

  async deleteService(uuid: string): Promise<void> {
    await coolifyFetch<void>({
      path: `/services/${uuid}`,
      method: "DELETE",
      query: { delete_configurations: true, delete_volumes: false },
    });
  },

  // ── Databases ───────────────────────────────────────────────────────────────

  async listDatabases(): Promise<CoolifyDatabase[]> {
    return coolifyFetch<CoolifyDatabase[]>({ path: "/databases" });
  },

  async getDatabase(uuid: string): Promise<CoolifyDatabase> {
    return coolifyFetch<CoolifyDatabase>({ path: `/databases/${uuid}` });
  },

  async startDatabase(uuid: string): Promise<void> {
    await coolifyFetch<void>({ path: `/databases/${uuid}/start` });
  },

  async stopDatabase(uuid: string): Promise<void> {
    await coolifyFetch<void>({ path: `/databases/${uuid}/stop` });
  },

  async deleteDatabase(uuid: string): Promise<void> {
    await coolifyFetch<void>({
      path: `/databases/${uuid}`,
      method: "DELETE",
      query: { delete_configurations: true, delete_volumes: false },
    });
  },
};
