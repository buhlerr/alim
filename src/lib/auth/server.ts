/**
 * Server-side identity access for server components and server actions.
 *
 * The middleware has already resolved and verified the caller and forwarded the
 * username via the IDENTITY_HEADER request header. This helper reads it back so
 * downstream code (notably the audit log) can attribute actions to the real
 * user without re-verifying anything.
 */
import "server-only";
import { headers } from "next/headers";
import { IDENTITY_HEADER } from "./identity";

/**
 * The authenticated username for the current request, or null when there is no
 * request context (e.g. unit tests, scripts) — callers fall back to env config.
 */
export async function getCurrentActor(): Promise<string | null> {
  try {
    const h = await headers();
    return h.get(IDENTITY_HEADER)?.trim() || null;
  } catch {
    return null;
  }
}
