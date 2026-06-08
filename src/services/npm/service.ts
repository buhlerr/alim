import "server-only";
import { npmFetch } from "./client";
import { NpmError, type NpmConnectionResult } from "./types";
import { proxyHosts } from "./proxy-hosts";
import { redirectionHosts } from "./redirection-hosts";
import { streams } from "./streams";
import { deadHosts } from "./dead-hosts";
import { certificates } from "./certificates";
import { accessLists } from "./access-lists";

/**
 * High-level Nginx Proxy Manager operations. Every call goes through `npmFetch`
 * (which handles auth, retries, and error normalization), so the per-resource
 * modules are the single place that knows the API endpoint paths.
 */
export const npmService = {
  proxyHosts,
  redirectionHosts,
  streams,
  deadHosts,
  certificates,
  accessLists,

  async testConnection(): Promise<NpmConnectionResult> {
    try {
      const health = await npmFetch<{ version?: number[] }>({ path: "/" });
      const version = Array.isArray(health?.version)
        ? health.version.join(".")
        : undefined;
      return { ok: true, message: "Connection OK.", version };
    } catch (err) {
      const ne = err instanceof NpmError ? err : null;
      return {
        ok: false,
        message: ne?.message ?? "Could not reach Nginx Proxy Manager.",
      };
    }
  },
};
