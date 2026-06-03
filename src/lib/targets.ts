/**
 * Resolves the PostgreSQL admin connection string for each environment from
 * environment variables. This module is the single source of truth for which
 * server an environment maps to.
 *
 * Connection strings are NEVER returned to the client. Server code calls
 * `getAdminUrl()`; the UI only ever receives the masked/derived metadata from
 * `getTargetInfo()`.
 */
import "server-only";
import {
  ENVIRONMENTS,
  ENVIRONMENT_LABELS,
  isEnvironment,
  type Environment,
} from "./environments";

// Re-export the client-safe constants so existing server-side imports of
// `@/lib/targets` keep working.
export { ENVIRONMENTS, ENVIRONMENT_LABELS, isEnvironment };
export type { Environment };

const ENV_VAR_BY_ENVIRONMENT: Record<Environment, string> = {
  PRODUCTION: "POSTGRES_PROD_URL",
  STAGING: "POSTGRES_STAGING_URL",
  DEVELOPMENT: "POSTGRES_DEV_URL",
};

/**
 * Returns the raw admin connection string for an environment, or null if the
 * matching env var is unset/blank. Server-only — never send the result to the
 * client.
 */
export function getAdminUrl(environment: Environment): string | null {
  const raw = process.env[ENV_VAR_BY_ENVIRONMENT[environment]];
  if (!raw || raw.trim().length === 0) return null;
  return raw.trim();
}

export interface ParsedConnection {
  host: string;
  port: number;
  user: string;
  database: string;
}

/** Safely parse a connection string into its non-secret parts. */
export function parseConnection(url: string): ParsedConnection | null {
  try {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: u.port ? Number(u.port) : 5432,
      user: decodeURIComponent(u.username),
      database: u.pathname.replace(/^\//, "") || "postgres",
    };
  } catch {
    return null;
  }
}

/** Build a client-facing connection string with the password redacted. */
export function maskConnectionString(url: string): string {
  const parsed = parseConnection(url);
  if (!parsed) return "invalid connection string";
  return `postgresql://${parsed.user}:****@${parsed.host}:${parsed.port}/${parsed.database}`;
}

export interface TargetInfo {
  environment: Environment;
  label: string;
  envVar: string;
  configured: boolean;
  host: string | null;
  port: number | null;
  /** Masked string safe to render in the UI. */
  masked: string | null;
}

/** Non-secret, client-safe description of a single environment's target. */
export function getTargetInfo(environment: Environment): TargetInfo {
  const url = getAdminUrl(environment);
  const parsed = url ? parseConnection(url) : null;
  return {
    environment,
    label: ENVIRONMENT_LABELS[environment],
    envVar: ENV_VAR_BY_ENVIRONMENT[environment],
    configured: Boolean(url),
    host: parsed?.host ?? null,
    port: parsed?.port ?? null,
    masked: url ? maskConnectionString(url) : null,
  };
}

export function getAllTargetInfo(): TargetInfo[] {
  return ENVIRONMENTS.map(getTargetInfo);
}
