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
  port?: number | null;
  user?: string | null;
  private_key_id?: number | null;
}

export interface CoolifySecurityKey {
  id: number;
  uuid: string;
  name: string;
  private_key?: string;
  is_git_related?: boolean;
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
  /** Health-check settings (live-verified: PATCH accepts and persists all). */
  health_check_enabled?: boolean | null;
  health_check_path?: string | null;
  /** Container port/host mapped as "host:container" pairs. */
  ports_mappings?: string | null;
  /** Memory limit string, e.g. "256m" or "1g". */
  limits_memory?: string | null;
  /** CPU quota as a decimal string, e.g. "0.5". */
  limits_cpus?: string | null;
  pre_deployment_command?: string | null;
  post_deployment_command?: string | null;
  custom_docker_run_options?: string | null;
  /** Pin a specific Docker image instead of building from source. */
  static_image?: string | null;
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
  /** Live-verified: PATCH accepts and persists these additional fields. */
  health_check_enabled?: boolean;
  health_check_path?: string;
  ports_mappings?: string;
  limits_memory?: string;
  limits_cpus?: string;
  pre_deployment_command?: string;
  post_deployment_command?: string;
  custom_docker_run_options?: string;
  static_image?: string;
}

export interface CoolifyConnectionResult {
  ok: boolean;
  message: string;
  version?: string;
}

/**
 * A Coolify docker-compose service (GET /services).
 * Note: server lives at the top-level `server` field, not in a `destination`
 * wrapper (unlike applications). `docker_compose_raw` is plain YAML when
 * reading; POST /services requires it base64-encoded.
 */
export interface CoolifyService {
  uuid: string;
  name: string;
  status?: string;
  environment_id?: number | null;
  /** Plain YAML compose content when reading. */
  docker_compose_raw?: string | null;
  /** Top-level server object (no destination wrapper). */
  server?: CoolifyServer | null;
  description?: string | null;
  service_type?: string | null;
}

export interface CoolifyDatabase {
  uuid: string;
  name: string;
  /** e.g. "standalone-postgresql", "standalone-mysql", "standalone-redis" */
  database_type?: string | null;
  status?: string;
  environment_id?: number | null;
  /** Server lives inside destination, matching the application pattern. */
  destination?: CoolifyDestination | null;
  description?: string | null;
}

/** POST /services request. docker_compose_raw must be base64-encoded. */
export interface CreateServiceRequest {
  project_uuid: string;
  server_uuid: string;
  environment_name: string;
  name: string;
  /** Must be base64-encoded YAML. */
  docker_compose_raw: string;
}

/** POST /services response -- minimal shape confirmed live. */
export interface CreateServiceResponse {
  uuid: string;
  domains?: string[];
}
