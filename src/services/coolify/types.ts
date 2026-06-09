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

export interface CoolifyServerSettings {
  is_reachable?: boolean;
  is_usable?: boolean;
}

export interface CoolifyServer {
  uuid: string;
  name: string;
  ip?: string | null;
  description?: string | null;
  settings?: CoolifyServerSettings;
}

export interface CoolifyDestination {
  uuid?: string;
  name?: string;
  network?: string;
  server?: CoolifyServer;
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
  ports_exposes?: string | null;
  description?: string | null;
  /** Build configuration that the create endpoints do not accept and must be
   * replicated via PATCH after creation. */
  install_command?: string | null;
  build_command?: string | null;
  start_command?: string | null;
  base_directory?: string | null;
  publish_directory?: string | null;
  /** Integer environment id; resolve to project+environment via /projects. */
  environment_id?: number | null;
  /** Git source binding. source_type "App\\Models\\GithubApp" uses a GitHub App
   * (source_id -> GET /github-apps) which carries repo auth; a private repo
   * must be recreated via that app, not the public-repo endpoint. */
  source_id?: number | null;
  source_type?: string | null;
  /** Server lives here: destination.server.uuid (no flat server_uuid exists). */
  destination?: CoolifyDestination | null;
}

export interface CoolifyGithubApp {
  id: number;
  uuid: string;
  name: string;
  is_public: boolean;
}

export interface CreatePrivateGithubAppRequest {
  project_uuid: string;
  server_uuid: string;
  environment_name: string;
  github_app_uuid: string;
  git_repository: string; // "owner/repo" (not a URL)
  git_branch: string;
  build_pack: string;
  ports_exposes: string;
  name?: string;
}

export interface CoolifyEnvVar {
  uuid?: string;
  key: string;
  value: string;
  is_build_time?: boolean;
}

export interface CoolifyEnvironment {
  id: number;
  uuid: string;
  name: string;
}

export interface CoolifyProject {
  uuid: string;
  name: string;
  /** Present on GET /projects/{uuid}; absent on the GET /projects list. */
  environments?: CoolifyEnvironment[];
}

export interface CoolifyServerResource {
  uuid: string;
  name: string;
  type?: string;
  status?: string;
}

export interface CoolifyStorage {
  uuid?: string;
  name: string;
  mount_path?: string | null;
  host_path?: string | null;
}

/** GET /applications/{uuid}/storages returns this wrapper, not a flat array. */
export interface CoolifyStoragesResponse {
  persistent_storages?: CoolifyStorage[];
  file_storages?: CoolifyStorage[];
}

export interface CoolifyDeployment {
  uuid?: string;
  deployment_uuid?: string;
  /** queued | in_progress | finished | failed | cancelled (per OpenAPI; confirm live). */
  status?: string;
  application_uuid?: string;
}

export interface CoolifyDeployResponse {
  deployments?: Array<{ deployment_uuid?: string; resource_uuid?: string; message?: string }>;
  message?: string;
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
  install_command?: string;
  build_command?: string;
  start_command?: string;
  base_directory?: string;
  publish_directory?: string;
  name?: string;
  description?: string;
}

export interface CoolifyConnectionResult {
  ok: boolean;
  message: string;
  version?: string;
}
