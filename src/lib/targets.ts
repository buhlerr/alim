/**
 * Resolves the PostgreSQL admin connection string for each environment.
 *
 * Resolution order: the encrypted in-app Settings store first, then the
 * legacy POSTGRES_*_URL environment variable as a fallback (only the original
 * three environments ever had documented env vars). Connection strings are
 * NEVER returned to the client; the UI only receives masked metadata.
 */
import "server-only";
import { type Environment } from "./environments";
import { settingsService } from "@/services/settings";
import { environmentsService } from "@/services/environments";

// Re-export client-safe type so existing server-side imports keep working.
export type { Environment };

/** Settings key holding an environment's admin connection string. */
export function POSTGRES_SETTING_KEYS(environment: Environment): string {
  return `postgres.${environment}.url`;
}

/** Legacy env-var fallback name (only the original three were documented). */
function legacyEnvVar(environment: Environment): string {
  const legacy: Record<string, string> = {
    PRODUCTION: "POSTGRES_PROD_URL",
    STAGING: "POSTGRES_STAGING_URL",
    DEVELOPMENT: "POSTGRES_DEV_URL",
  };
  return legacy[environment] ?? `POSTGRES_${environment}_URL`;
}

export type TargetSource = "settings" | "env";

/**
 * Returns the raw admin connection string for an environment: encrypted
 * settings first, then the legacy env var. Null if neither is set/blank.
 * Server-only; never send the result to the client.
 */
export async function getAdminUrl(environment: Environment): Promise<string | null> {
  const fromSettings = await settingsService.get(POSTGRES_SETTING_KEYS(environment));
  if (fromSettings && fromSettings.trim().length > 0) return fromSettings.trim();
  const raw = process.env[legacyEnvVar(environment)];
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
  color: string;
  /** Legacy fallback env var name for this environment. */
  envVar: string;
  configured: boolean;
  source: TargetSource | null;
  host: string | null;
  port: number | null;
  masked: string | null;
}

/** Non-secret, client-safe description of a single environment's target. */
export async function getTargetInfo(environment: Environment): Promise<TargetInfo> {
  const env = await environmentsService.get(environment);
  const fromSettings =
    (await settingsService.get(POSTGRES_SETTING_KEYS(environment)))?.trim() || null;
  const fromEnv = process.env[legacyEnvVar(environment)]?.trim() || null;
  const url = fromSettings ?? fromEnv;
  const source: TargetSource | null = fromSettings ? "settings" : fromEnv ? "env" : null;
  const parsed = url ? parseConnection(url) : null;
  return {
    environment,
    label: env?.name ?? environment,
    color: env?.color ?? "slate",
    envVar: legacyEnvVar(environment),
    configured: Boolean(url),
    source,
    host: parsed?.host ?? null,
    port: parsed?.port ?? null,
    masked: url ? maskConnectionString(url) : null,
  };
}

export async function getAllTargetInfo(): Promise<TargetInfo[]> {
  const envs = await environmentsService.list();
  return Promise.all(envs.map((e) => getTargetInfo(e.key)));
}
