import "server-only";
import type { NpmConfig } from "@/lib/npm-config";
import { NpmError, type NpmToken } from "./types";

/**
 * NPM JWT acquisition + caching. NPM tokens are short-lived, so we mint one via
 * `POST /api/tokens` and cache it in module memory keyed by base URL + identity,
 * refreshing shortly before expiry. The cache is process-local — fine for a
 * single-instance admin tool.
 */

interface CacheEntry {
  token: string;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const AUTH_TIMEOUT_MS = 15_000;
// Refresh a little before the real expiry to avoid racing a request against it.
const REFRESH_MARGIN_MS = 60_000;
// Used when NPM omits an expiry (it normally returns one).
const DEFAULT_TTL_MS = 60 * 60 * 1000;

function cacheKey(config: NpmConfig): string {
  return `${config.baseUrl}|${config.identity}`;
}

export function clearToken(config: NpmConfig): void {
  cache.delete(cacheKey(config));
}

export async function getToken(config: NpmConfig): Promise<string> {
  const key = cacheKey(config);
  const entry = cache.get(key);
  if (entry && entry.expiresAt - Date.now() > REFRESH_MARGIN_MS) {
    return entry.token;
  }

  let res: { ok: boolean; status: number; json: () => Promise<NpmToken> };
  try {
    res = await fetch(`${config.baseUrl}/api/tokens`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ identity: config.identity, secret: config.secret }),
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
  } catch {
    throw new NpmError("Could not reach the Nginx Proxy Manager server.", "NETWORK");
  }

  if (!res.ok) {
    if (res.status === 401) {
      throw new NpmError(
        "Nginx Proxy Manager rejected the email/password.",
        "INVALID_CREDENTIALS",
      );
    }
    throw new NpmError(
      `Nginx Proxy Manager auth failed (HTTP ${res.status}).`,
      `AUTH_HTTP_${res.status}`,
    );
  }

  const data = await res.json();
  if (!data?.token) {
    throw new NpmError("Nginx Proxy Manager did not return a token.", "AUTH_NO_TOKEN");
  }
  const expiresAt = data.expires
    ? new Date(data.expires).getTime()
    : Date.now() + DEFAULT_TTL_MS;
  cache.set(key, { token: data.token, expiresAt });
  return data.token;
}
