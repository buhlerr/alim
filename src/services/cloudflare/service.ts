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

  /**
   * Verify a Cloudflare API token via /user/tokens/verify. With no argument it
   * tests the saved credentials; pass a token to test one before saving. Returns
   * an actionable message that distinguishes a bad token (401), a token missing
   * permissions (403), and a valid-but-inactive token.
   */
  async testConnection(token?: string): Promise<CloudflareConnectionResult> {
    try {
      const result = await cfFetch<{ status?: string }>(
        token !== undefined
          ? { path: "/user/tokens/verify", tokenOverride: token }
          : { path: "/user/tokens/verify" },
      );
      const status = result?.status;
      if (status && status !== "active") {
        return {
          ok: false,
          message: `Token authenticated but is ${status}. Re-activate or recreate it in Cloudflare.`,
        };
      }
      return { ok: true, message: "Token valid and active." };
    } catch (err) {
      return { ok: false, message: connectionGuidance(err) };
    }
  },
};

/** Turn a Cloudflare failure into an actionable hint for the settings form. */
function connectionGuidance(err: unknown): string {
  const code = err instanceof CloudflareError ? err.code : undefined;
  switch (code) {
    case "HTTP_400":
      return "Token not recognized (400): it looks malformed. Use an API Token (My Profile → API Tokens → Create Token), not your Global API Key or a token ID, and paste it in full.";
    case "INVALID_TOKEN":
      return "Token rejected (401). Make sure you used an API Token (My Profile → API Tokens → Create Token), not your Global API Key, and copied it in full.";
    case "FORBIDDEN":
      return "Token authenticated but lacks permission (403). Add the required Zone/Account permissions to this token.";
    case "ETIMEDOUT":
    case "ENOTFOUND":
    case "NETWORK":
      return "Could not reach Cloudflare. Check your network connection and try again.";
    case "NOT_CONFIGURED":
      return "Enter an API token to test.";
    default:
      return err instanceof CloudflareError
        ? err.message
        : "Could not reach Cloudflare.";
  }
}
