import "server-only";
import { settingsService } from "@/services/settings";

export interface CoolifyConfig {
  baseUrl: string;
  apiToken: string;
}

export const COOLIFY_SETTING_KEYS = {
  baseUrl: "coolify.baseUrl",
  apiToken: "coolify.apiToken",
} as const;

/**
 * Resolve Coolify credentials: encrypted settings first, then env-var fallback
 * (COOLIFY_BASE_URL / COOLIFY_API_TOKEN). Returns null unless BOTH are present.
 * Server-only; never returns the token to the client.
 */
export async function getCoolifyConfig(): Promise<CoolifyConfig | null> {
  const baseUrlRaw =
    (await settingsService.get(COOLIFY_SETTING_KEYS.baseUrl)) ??
    process.env.COOLIFY_BASE_URL ??
    null;
  const apiToken =
    (await settingsService.get(COOLIFY_SETTING_KEYS.apiToken)) ??
    process.env.COOLIFY_API_TOKEN ??
    null;

  if (!baseUrlRaw || !baseUrlRaw.trim() || !apiToken || !apiToken.trim()) {
    return null;
  }
  return {
    baseUrl: baseUrlRaw.trim().replace(/\/+$/, ""),
    apiToken: apiToken.trim(),
  };
}

export async function isCoolifyConfigured(): Promise<boolean> {
  return (await getCoolifyConfig()) !== null;
}
