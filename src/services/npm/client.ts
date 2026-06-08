import "server-only";
import { getNpmConfig, type NpmConfig } from "@/lib/npm-config";
import { getToken, clearToken } from "./auth";
import { NpmError } from "./types";

export interface NpmRequestOptions {
  path: string; // begins with "/", relative to /api
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

const API_TIMEOUT_MS = 15_000;

function networkError(err: unknown): NpmError {
  const e = err as { name?: string; code?: string };
  if (e?.name === "TimeoutError" || e?.code === "ETIMEDOUT") {
    return new NpmError("Timed out reaching the Nginx Proxy Manager server.", "ETIMEDOUT");
  }
  if (e?.code === "ENOTFOUND") {
    return new NpmError("The Nginx Proxy Manager hostname could not be resolved.", "ENOTFOUND");
  }
  if (e?.code === "ECONNREFUSED") {
    return new NpmError("Could not reach Nginx Proxy Manager (connection refused).", "ECONNREFUSED");
  }
  return new NpmError("Could not reach the Nginx Proxy Manager server.", "NETWORK");
}

function httpError(status: number): NpmError {
  switch (status) {
    case 401:
      return new NpmError("The Nginx Proxy Manager session was rejected.", "UNAUTHORIZED");
    case 403:
      return new NpmError("This account lacks permission for that action.", "FORBIDDEN");
    case 404:
      return new NpmError("The requested Nginx Proxy Manager resource was not found.", "HTTP_404");
    case 400:
      return new NpmError("Nginx Proxy Manager rejected the request as invalid.", "HTTP_400");
    default:
      return new NpmError(`Nginx Proxy Manager returned an unexpected error (HTTP ${status}).`, `HTTP_${status}`);
  }
}

/**
 * Single entry point for all NPM API calls. Resolves config, attaches a freshly
 * minted (or cached) JWT, and normalizes failures into `NpmError`. On a 401 it
 * drops the cached token and retries once, so a token that expired mid-session
 * is refreshed transparently.
 */
export async function npmFetch<T>(opts: NpmRequestOptions): Promise<T> {
  const config = await getNpmConfig();
  if (!config) {
    throw new NpmError(
      "Nginx Proxy Manager is not configured. Add a base URL, email, and password in Settings.",
      "NOT_CONFIGURED",
    );
  }
  return doFetch<T>(config, opts, true);
}

async function doFetch<T>(
  config: NpmConfig,
  opts: NpmRequestOptions,
  allowRetry: boolean,
): Promise<T> {
  const token = await getToken(config);

  const url = new URL(`${config.baseUrl}/api${opts.path}`);
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
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
  } catch (err) {
    throw networkError(err);
  }

  if (res.status === 401 && allowRetry) {
    clearToken(config);
    return doFetch<T>(config, opts, false);
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
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}
