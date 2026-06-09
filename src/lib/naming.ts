/**
 * Naming rules for derived database and user names.
 *
 * A "full environment set" for application `appname` produces one database +
 * user per environment, suffixed by that environment's abbreviation. An empty
 * (or null) abbreviation produces no suffix, e.g.:
 *
 *   abbreviation ""        -> db: appname            user: appname_user
 *   abbreviation "staging" -> db: appname_staging    user: appname_staging_user
 *
 * The single-create form pre-fills these but allows the user to override the
 * database name and username before submitting.
 */

/**
 * Normalize an arbitrary application name into a safe PostgreSQL identifier
 * stem: lowercase, non [a-z0-9_] replaced with `_`, leading digits/underscores
 * trimmed, collapsed underscores. May return "" for hopeless input; callers
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

/** Derive the database name for an app + environment abbreviation. */
export function deriveDatabaseName(appName: string, abbreviation: string | null): string {
  const stem = sanitizeIdentifier(appName);
  const suffix = abbreviation ? `_${abbreviation}` : "";
  return `${stem}${suffix}`;
}

/** Derive the database username for an app + environment abbreviation. */
export function deriveUsername(appName: string, abbreviation: string | null): string {
  const stem = sanitizeIdentifier(appName);
  const suffix = abbreviation ? `_${abbreviation}` : "";
  return `${stem}${suffix}_user`;
}
