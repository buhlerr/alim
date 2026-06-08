import "server-only";
import { cfFetch } from "./client";
import { CloudflareError, type CloudflareConnectionResult } from "./types";
import { zones } from "./zones";
import { tunnels } from "./tunnels";
import { dns } from "./dns";
import { tls } from "./tls";

/**
 * High-level Cloudflare operations. Every call goes through `cfFetch` (auth,
 * envelope unwrap, error normalization), so the per-resource modules are the
 * single place that knows the API endpoint paths.
 */
export const cloudflareService = {
  zones,
  tunnels,
  dns,
  tls,

  async testConnection(): Promise<CloudflareConnectionResult> {
    try {
      await cfFetch<{ status?: string }>({ path: "/user/tokens/verify" });
      return { ok: true, message: "Connection OK." };
    } catch (err) {
      const ce = err instanceof CloudflareError ? err : null;
      return { ok: false, message: ce?.message ?? "Could not reach Cloudflare." };
    }
  },
};
