import "server-only";
import { getCoolifyConfig } from "@/lib/coolify-config";
import { CoolifyError } from "./types";

export interface CoolifyRequestOptions {
  path: string; // begins with "/", relative to /api/v1
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

const API_TIMEOUT_MS = 15_000;

function networkError(err: unknown): CoolifyError {
  const e = err as { name?: string; code?: string };
  if (e?.name === "TimeoutError" || e?.code === "ETIMEDOUT") {
    return new CoolifyError("Timed out reaching the Coolify server.", "ETIMEDOUT");
  }
  if (e?.code === "ENOTFOUND") {
    return new CoolifyError("The Coolify hostname could not be resolved.", "ENOTFOUND");
  }
  if (e?.code === "ECONNREFUSED") {
    return new CoolifyError("Could not reach the Coolify server (connection refused).", "ECONNREFUSED");
  }
  return new CoolifyError("Could not reach the Coolify server.", "NETWORK");
}

function httpError(status: number): CoolifyError {
  switch (status) {
    case 401:
      return new CoolifyError("The Coolify API token was rejected.", "INVALID_TOKEN");
    case 403:
      return new CoolifyError("The Coolify API token lacks permission for this action.", "FORBIDDEN");
    case 404:
      return new CoolifyError("The requested Coolify resource was not found.", "HTTP_404");
    case 422:
      return new CoolifyError("Coolify rejected the request as invalid. Check the inputs.", "HTTP_422");
    default:
      return new CoolifyError(`Coolify returned an unexpected error (HTTP ${status}).`, `HTTP_${status}`);
  }
}

/**
 * Single entry point for all Coolify API calls. Adds bearer auth, base URL, a
 * timeout, and normalizes failures into `CoolifyError` (never leaking the token
 * or raw upstream bodies).
 */
export async function coolifyFetch<T>(opts: CoolifyRequestOptions): Promise<T> {
  const config = await getCoolifyConfig();
  if (!config) {
    throw new CoolifyError(
      "Coolify is not configured. Add a base URL and API token in Settings.",
      "NOT_CONFIGURED",
    );
  }

  const url = new URL(`${config.baseUrl}/api/v1${opts.path}`);
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
        Authorization: `Bearer ${config.apiToken}`,
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
  if (res.status === 204) {
    return undefined as T;
  }
  const text = await res.text();
  if (!text) {
    return undefined as T;
  }
  // Most endpoints return JSON, but some (e.g. /version) return a bare string
  // with a non-JSON content type. Parse as JSON when possible, otherwise fall
  // back to the raw text so a plain-text body doesn't crash the request.
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}
