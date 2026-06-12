/**
 * The gate's core resolution logic: given the inbound request's headers and
 * session cookie, decide WHO (if anyone) is authenticated.
 *
 * `resolveIdentity` is a pure-ish function (its only side effect is the async
 * HMAC verification of the session cookie) so the middleware that calls it stays
 * a thin adapter and the branching is fully unit-tested.
 */
import type { AuthConfig } from "./config";
import { verifySession } from "./session";

export interface Identity {
  username: string;
  mode: "proxy" | "password";
}

/** Header the reverse proxy must send when AUTH_PROXY_SHARED_SECRET is set. */
export const PROXY_SECRET_HEADER = "x-alim-proxy-secret";

/** Request header the middleware uses to forward the resolved identity. */
export const IDENTITY_HEADER = "x-alim-user";

type HeaderGetter = (name: string) => string | null;

function proxyEnabled(mode: AuthConfig["mode"]): boolean {
  return mode === "proxy" || mode === "both";
}

function passwordEnabled(mode: AuthConfig["mode"]): boolean {
  return mode === "password" || mode === "both";
}

/**
 * Resolve the authenticated identity, or null if the request is unauthenticated.
 *
 * For "both" mode the precedence is proxy-first, password-fallback (OR
 * semantics): a present, valid proxy identity wins, but if the proxy header is
 * missing or its shared secret fails to match, a valid password session is
 * still accepted as the break-glass path.
 */
export async function resolveIdentity(
  getHeader: HeaderGetter,
  cookieToken: string | null,
  config: AuthConfig,
  now?: number,
): Promise<Identity | null> {
  if (proxyEnabled(config.mode)) {
    const user = getHeader(config.proxyHeader)?.trim();
    if (user) {
      const secretOk =
        !config.proxySharedSecret ||
        getHeader(PROXY_SECRET_HEADER) === config.proxySharedSecret;
      if (secretOk) {
        return { username: user, mode: "proxy" };
      }
    }
  }

  if (passwordEnabled(config.mode) && cookieToken) {
    const payload = await verifySession(cookieToken, config.secret, now);
    if (payload) {
      return { username: payload.sub, mode: "password" };
    }
  }

  return null;
}
