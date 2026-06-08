import "server-only";
import { settingsService } from "@/services/settings";

export interface CloudflareConfig {
  apiToken: string;
  /** Optional — required only for tunnel (account-scoped) endpoints. */
  accountId: string;
}

export const CLOUDFLARE_SETTING_KEYS = {
  apiToken: "cloudflare.apiToken",
  accountId: "cloudflare.accountId",
} as const;

/**
 * Resolve Cloudflare credentials: encrypted settings first, then env-var
 * fallback (CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID). Only the token is
 * required; the account ID may be blank (tunnel features need it). Returns null
 * when no token is configured. Server-only — never returns the token to the
 * client.
 */
export async function getCloudflareConfig(): Promise<CloudflareConfig | null> {
  const apiToken =
    (await settingsService.get(CLOUDFLARE_SETTING_KEYS.apiToken)) ??
    process.env.CLOUDFLARE_API_TOKEN ??
    null;
  if (!apiToken?.trim()) return null;

  const accountId =
    (await settingsService.get(CLOUDFLARE_SETTING_KEYS.accountId)) ??
    process.env.CLOUDFLARE_ACCOUNT_ID ??
    "";

  return { apiToken: apiToken.trim(), accountId: accountId.trim() };
}

export async function isCloudflareConfigured(): Promise<boolean> {
  return (await getCloudflareConfig()) !== null;
}
