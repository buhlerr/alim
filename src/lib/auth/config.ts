/**
 * Authentication configuration for ALIM.
 *
 * Two enforcement mechanisms are supported, selected by AUTH_MODE:
 *   - "password": a single shared password gate with a signed session cookie.
 *   - "proxy":    trust an identity header set by a reverse proxy that has
 *                 already authenticated the user (Cloudflare Access, Authelia,
 *                 Authentik, oauth2-proxy, ...).
 *   - "both":     accept EITHER (OR semantics) — SSO via the proxy normally,
 *                 with the shared password as a break-glass fallback when the
 *                 proxy is misconfigured or bypassed.
 *
 * There is intentionally NO "none" mode: ALIM is secure-by-default. If a
 * password-bearing mode is configured without the inputs it needs, loading the
 * config throws and the gate fails closed (denies everything) rather than
 * opening up.
 */

export type AuthMode = "password" | "proxy" | "both";

export interface AuthConfig {
  mode: AuthMode;
  /** Shared password (modes including "password"); null in proxy-only mode. */
  password: string | null;
  /** Default actor label for password sessions and audit attribution. */
  adminUsername: string;
  /** Lifetime of an issued session, in seconds. */
  sessionTtlSeconds: number;
  /** Lower-cased request header carrying the proxy-authenticated identity. */
  proxyHeader: string;
  /** Optional anti-spoof secret the proxy must also send; null to disable. */
  proxySharedSecret: string | null;
  /** HMAC key used to sign/verify session tokens. Empty in proxy-only mode. */
  secret: string;
}

export class AuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthConfigError";
  }
}

const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60; // 7d
const DEFAULT_PROXY_HEADER = "x-forwarded-user";
const DEFAULT_ADMIN_USERNAME = "admin";

const UNIT_SECONDS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 60 * 60,
  d: 24 * 60 * 60,
};

/**
 * Parse a duration like "3600", "30m", "12h", or "7d" into seconds.
 * Returns null for anything unparseable.
 */
export function parseDuration(value: string): number | null {
  const raw = value.trim();
  if (!raw) return null;
  const match = /^(\d+)([smhd])?$/.exec(raw);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2] ?? "s";
  return amount * UNIT_SECONDS[unit];
}

type Env = Record<string, string | undefined>;

function modeIncludesPassword(mode: AuthMode): boolean {
  return mode === "password" || mode === "both";
}

/**
 * Load and validate the auth configuration from an environment map (defaults to
 * process.env). Throws AuthConfigError on any invalid or fail-closed condition.
 */
export function loadAuthConfig(env: Env = process.env): AuthConfig {
  const rawMode = (env.AUTH_MODE ?? "password").trim().toLowerCase();
  if (rawMode === "none") {
    throw new AuthConfigError(
      'AUTH_MODE=none is not supported. Use "password", "proxy", or "both".',
    );
  }
  if (rawMode !== "password" && rawMode !== "proxy" && rawMode !== "both") {
    throw new AuthConfigError(
      `Invalid AUTH_MODE "${env.AUTH_MODE}". Expected "password", "proxy", or "both".`,
    );
  }
  const mode = rawMode as AuthMode;

  const password = env.AUTH_PASSWORD?.length ? env.AUTH_PASSWORD : null;
  const secret = (env.AUTH_SECRET ?? env.ENCRYPTION_KEY ?? "").trim();

  if (modeIncludesPassword(mode)) {
    if (!password) {
      throw new AuthConfigError(
        `AUTH_MODE="${mode}" requires AUTH_PASSWORD to be set.`,
      );
    }
    if (!secret) {
      throw new AuthConfigError(
        `AUTH_MODE="${mode}" requires AUTH_SECRET (or ENCRYPTION_KEY) to sign session cookies.`,
      );
    }
  }

  const ttl = env.AUTH_SESSION_TTL
    ? parseDuration(env.AUTH_SESSION_TTL)
    : DEFAULT_TTL_SECONDS;
  if (ttl == null || ttl <= 0) {
    throw new AuthConfigError(
      `Invalid AUTH_SESSION_TTL "${env.AUTH_SESSION_TTL}". Use seconds or a suffixed value like "12h" or "7d".`,
    );
  }

  return {
    mode,
    password,
    adminUsername: env.AUTH_ADMIN_USERNAME?.trim() || DEFAULT_ADMIN_USERNAME,
    sessionTtlSeconds: ttl,
    proxyHeader:
      env.AUTH_PROXY_HEADER?.trim().toLowerCase() || DEFAULT_PROXY_HEADER,
    proxySharedSecret: env.AUTH_PROXY_SHARED_SECRET?.length
      ? env.AUTH_PROXY_SHARED_SECRET
      : null,
    secret,
  };
}
