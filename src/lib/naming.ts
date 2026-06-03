/**
 * Naming rules for derived database and user names.
 *
 * A "full environment set" for application `appname` produces:
 *
 *   Production   -> db: appname            user: appname_user
 *   Staging      -> db: appname_staging    user: appname_staging_user
 *   Development  -> db: appname_dev         user: appname_dev_user
 *
 * The single-create form pre-fills these but allows the user to override the
 * database name and username before submitting.
 */
import type { Environment } from "./environments";

/**
 * Normalize an arbitrary application name into a safe PostgreSQL identifier
 * stem: lowercase, non [a-z0-9_] replaced with `_`, leading digits/underscores
 * trimmed, collapsed underscores. May return "" for hopeless input — callers
 * validate the final identifier separately.
 */
export function sanitizeIdentifier(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_") // anything illegal -> underscore
    .replace(/_+/g, "_") // collapse runs
    .replace(/^[^a-z]+/, "") // identifiers must start with a letter
    .replace(/_+$/, "") // trim trailing underscores
    .slice(0, 50); // leave headroom under Postgres' 63-char limit for suffixes
}

const ENV_SUFFIX: Record<Environment, string> = {
  PRODUCTION: "",
  STAGING: "_staging",
  DEVELOPMENT: "_dev",
};

/** Derive the database name for an app + environment. */
export function deriveDatabaseName(
  appName: string,
  environment: Environment,
): string {
  const stem = sanitizeIdentifier(appName);
  return `${stem}${ENV_SUFFIX[environment]}`;
}

/** Derive the database username for an app + environment. */
export function deriveUsername(
  appName: string,
  environment: Environment,
): string {
  const stem = sanitizeIdentifier(appName);
  return `${stem}${ENV_SUFFIX[environment]}_user`;
}
