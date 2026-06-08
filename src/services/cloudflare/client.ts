import "server-only";
import { getCloudflareConfig } from "@/lib/cloudflare-config";
import { CloudflareError, type CloudflareEnvelope } from "./types";

export interface CfRequestOptions {
  path: string; // begins with "/", relative to the v4 base
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  /**
   * Verify a specific token instead of the saved/env credentials — used to test
   * a token the user has typed but not yet saved. The token is never persisted.
   */
  tokenOverride?: string;
}

const API_BASE = "https://api.cloudflare.com/client/v4";
const API_TIMEOUT_MS = 15_000;

function networkError(err: unknown): CloudflareError {
  const e = err as { name?: string; code?: string };
  if (e?.name === "TimeoutError" || e?.code === "ETIMEDOUT") {
    return new CloudflareError("Timed out reaching Cloudflare.", "ETIMEDOUT");
  }
  if (e?.code === "ENOTFOUND") {
    return new CloudflareError("Could not resolve the Cloudflare API host.", "ENOTFOUND");
  }
  return new CloudflareError("Could not reach Cloudflare.", "NETWORK");
}

function httpError(status: number): CloudflareError {
  switch (status) {
    case 401:
      return new CloudflareError("The Cloudflare API token was rejected.", "INVALID_TOKEN");
    case 403:
      return new CloudflareError("The Cloudflare API token lacks permission for this action.", "FORBIDDEN");
    case 404:
      return new CloudflareError("The requested Cloudflare resource was not found.", "HTTP_404");
    case 429:
      return new CloudflareError("Cloudflare rate limit hit. Try again shortly.", "RATE_LIMITED");
    default:
      return new CloudflareError(`Cloudflare returned an unexpected error (HTTP ${status}).`, `HTTP_${status}`);
  }
}

/**
 * Single entry point for all Cloudflare API calls. Adds bearer auth, base URL,
 * a timeout, unwraps the `{ success, errors, result }` envelope, and normalizes
 * failures into `CloudflareError` (never leaking the token or raw bodies).
 */
export async function cfFetch<T>(opts: CfRequestOptions): Promise<T> {
  let apiToken: string;
  if (opts.tokenOverride !== undefined) {
    apiToken = opts.tokenOverride.trim();
    if (!apiToken) {
      throw new CloudflareError(
        "No API token provided to verify.",
        "NOT_CONFIGURED",
      );
    }
  } else {
    const config = await getCloudflareConfig();
    if (!config) {
      throw new CloudflareError(
        "Cloudflare is not configured. Add an API token in Settings.",
        "NOT_CONFIGURED",
      );
    }
    apiToken = config.apiToken;
  }

  const url = new URL(`${API_BASE}${opts.path}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }

  let res: { ok: boolean; status: number; text: () => Promise<string> };
  try {
    res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
  } catch (err) {
    throw networkError(err);
  }

  if (!res.ok) {
    throw httpError(res.status);
  }

  const text = await res.text();
  if (!text) return undefined as T;

  let envelope: CloudflareEnvelope<T>;
  try {
    envelope = JSON.parse(text) as CloudflareEnvelope<T>;
  } catch {
    throw new CloudflareError("Cloudflare returned an unreadable response.", "BAD_RESPONSE");
  }

  if (!envelope.success) {
    const message = envelope.errors?.[0]?.message ?? "Cloudflare rejected the request.";
    const code = envelope.errors?.[0]?.code;
    throw new CloudflareError(message, code ? `CF_${code}` : "CF_ERROR");
  }
  return envelope.result;
}
