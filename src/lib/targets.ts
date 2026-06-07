/**
 * Resolves the PostgreSQL admin connection string for each environment.
 *
 * Resolution order: the encrypted in-app Settings store first, then the
 * POSTGRES_*_URL environment variable as a fallback. This module is the single
 * source of truth for which server an environment maps to.
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
import { settingsService } from "@/services/settings";

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
 * Encrypted-settings keys holding each environment's admin connection string.
 * These are the preferred source; the POSTGRES_*_URL env vars are a fallback.
 */
export const POSTGRES_SETTING_KEYS: Record<Environment, string> = {
  PRODUCTION: "postgres.PRODUCTION.url",
  STAGING: "postgres.STAGING.url",
  DEVELOPMENT: "postgres.DEVELOPMENT.url",
};

export type TargetSource = "settings" | "env";

/**
 * Returns the raw admin connection string for an environment: encrypted
 * settings first, then the matching env var. Null if neither is set/blank.
 * Server-only — never send the result to the client.
 */
export async function getAdminUrl(
  environment: Environment,
): Promise<string | null> {
  const fromSettings = await settingsService.get(
    POSTGRES_SETTING_KEYS[environment],
  );
  if (fromSettings && fromSettings.trim().length > 0) return fromSettings.trim();
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
  /** Fallback env var name for this environment. */
  envVar: string;
  configured: boolean;
  /** Where the configured value came from, or null when unset. */
  source: TargetSource | null;
  host: string | null;
  port: number | null;
  /** Masked string safe to render in the UI. */
  masked: string | null;
}

/** Non-secret, client-safe description of a single environment's target. */
export async function getTargetInfo(
  environment: Environment,
): Promise<TargetInfo> {
  const fromSettings =
    (await settingsService.get(POSTGRES_SETTING_KEYS[environment]))?.trim() ||
    null;
  const fromEnv =
    process.env[ENV_VAR_BY_ENVIRONMENT[environment]]?.trim() || null;
  const url = fromSettings ?? fromEnv;
  const source: TargetSource | null = fromSettings
    ? "settings"
    : fromEnv
      ? "env"
      : null;
  const parsed = url ? parseConnection(url) : null;
  return {
    environment,
    label: ENVIRONMENT_LABELS[environment],
    envVar: ENV_VAR_BY_ENVIRONMENT[environment],
    configured: Boolean(url),
    source,
    host: parsed?.host ?? null,
    port: parsed?.port ?? null,
    masked: url ? maskConnectionString(url) : null,
  };
}

export async function getAllTargetInfo(): Promise<TargetInfo[]> {
  return Promise.all(ENVIRONMENTS.map((env) => getTargetInfo(env)));
}

/**
 * Whether write operations are hard-disabled on Production. Controlled by the
 * POSTGRES_PROD_READONLY env var (truthy values: "1", "true", "yes", "on").
 * Used by the SQL Console policy to block writes against Production entirely.
 */
export function isProdWritesDisabled(): boolean {
  const raw = process.env.POSTGRES_PROD_READONLY?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}
