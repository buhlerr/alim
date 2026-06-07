/**
 * Coolify domain types and error class. Mirrors the provisioning module's
 * `ProvisioningError` pattern: a typed error carrying a stable code and a
 * user-presentable, credential-free message.
 */

export class CoolifyError extends Error {
  constructor(
    message: string,
    public readonly code: string = "COOLIFY_ERROR",
  ) {
    super(message);
    this.name = "CoolifyError";
  }
}

export interface CoolifyApplication {
  uuid: string;
  name: string;
  /** Coolify lifecycle status string, e.g. "running:healthy". */
  status?: string;
  fqdn?: string | null;
  git_repository?: string | null;
  git_branch?: string | null;
  build_pack?: string | null;
  description?: string | null;
}

export interface CoolifyEnvVar {
  uuid?: string;
  key: string;
  value: string;
  is_build_time?: boolean;
}

export interface CoolifyProject {
  uuid: string;
  name: string;
}

export interface CoolifyServer {
  uuid: string;
  name: string;
}

export interface CreateApplicationRequest {
  project_uuid: string;
  server_uuid: string;
  environment_name: string;
  git_repository: string;
  git_branch: string;
  build_pack: string; // e.g. "nixpacks" | "dockerfile" | "static"
  ports_exposes: string; // e.g. "3000"
  name?: string;
  domains?: string;
}

export interface UpdateApplicationRequest {
  domains?: string;
  build_command?: string;
  start_command?: string;
  name?: string;
  description?: string;
}

export interface CoolifyConnectionResult {
  ok: boolean;
  message: string;
  version?: string;
}
