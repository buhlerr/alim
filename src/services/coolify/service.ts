import "server-only";
import { coolifyFetch } from "./client";
import {
  CoolifyError,
  type CoolifyApplication,
  type CoolifyConnectionResult,
  type CoolifyEnvVar,
  type CoolifyProject,
  type CoolifyServer,
  type CreateApplicationRequest,
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

  async deploy(uuid: string): Promise<{ message?: string }> {
    return coolifyFetch<{ message?: string }>({
      path: "/deploy",
      query: { uuid },
    });
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

  async listProjects(): Promise<CoolifyProject[]> {
    return coolifyFetch<CoolifyProject[]>({ path: "/projects" });
  },

  async listServers(): Promise<CoolifyServer[]> {
    return coolifyFetch<CoolifyServer[]>({ path: "/servers" });
  },
};
