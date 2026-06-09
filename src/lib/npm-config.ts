import "server-only";
import { settingsService } from "@/services/settings";

export interface NpmConfig {
  baseUrl: string;
  identity: string;
  secret: string;
}

export const NPM_SETTING_KEYS = {
  baseUrl: "npm.baseUrl",
  identity: "npm.identity",
  secret: "npm.secret",
} as const;

/**
 * Resolve Nginx Proxy Manager credentials: encrypted settings first, then
 * env-var fallback (NPM_BASE_URL / NPM_IDENTITY / NPM_SECRET). Returns null
 * unless all three are present. Server-only; never returns the secret to the
 * client.
 */
export async function getNpmConfig(): Promise<NpmConfig | null> {
  const baseUrlRaw =
    (await settingsService.get(NPM_SETTING_KEYS.baseUrl)) ??
    process.env.NPM_BASE_URL ??
    null;
  const identity =
    (await settingsService.get(NPM_SETTING_KEYS.identity)) ??
    process.env.NPM_IDENTITY ??
    null;
  const secret =
    (await settingsService.get(NPM_SETTING_KEYS.secret)) ??
    process.env.NPM_SECRET ??
    null;

  if (
    !baseUrlRaw?.trim() ||
    !identity?.trim() ||
    !secret?.trim()
  ) {
    return null;
  }
  return {
    baseUrl: baseUrlRaw.trim().replace(/\/+$/, ""),
    identity: identity.trim(),
    secret: secret.trim(),
  };
}

export async function isNpmConfigured(): Promise<boolean> {
  return (await getNpmConfig()) !== null;
}
