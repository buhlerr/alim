/**
 * Deployment orchestrator types. A deployment runs up to three optional steps
 * (database, Coolify app, Cloudflare DNS) and reports the outcome of each.
 */

export type StepStatus = "success" | "failed" | "skipped";

export interface DeploymentStepResult {
  key: "database" | "coolify" | "dns";
  label: string;
  status: StepStatus;
  /** Human-readable success detail (e.g. an app UUID or DNS name). */
  detail?: string;
  /** Connection string for the database step — shown once, never persisted. */
  secret?: string;
  /** Safe error message when status is "failed". */
  error?: string;
}

export interface DeploymentResult {
  /** True when no enabled step failed. */
  ok: boolean;
  steps: DeploymentStepResult[];
}

/** A Coolify application create request (subset of the Coolify module's shape). */
export interface DeploymentCoolifyStep {
  project_uuid: string;
  server_uuid: string;
  environment_name: string;
  git_repository: string;
  git_branch: string;
  build_pack: string;
  ports_exposes: string;
  name?: string;
  domains?: string;
}

export interface DeploymentDnsStep {
  zoneId: string;
  type: string;
  name: string;
  content: string;
  proxied: boolean;
}

export interface DeploymentPlan {
  applicationName: string;
  /** Provision a database in this environment key, or null to skip. */
  database: { environment: string } | null;
  /** Create + deploy a Coolify app, or null to skip. */
  coolify: DeploymentCoolifyStep | null;
  /** Create a Cloudflare DNS record, or null to skip. */
  dns: DeploymentDnsStep | null;
}
