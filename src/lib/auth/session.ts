/**
 * Stateless signed session tokens for the password gate.
 *
 * Format: `base64url(payloadJSON).base64url(HMAC-SHA256(payloadJSON))`.
 *
 * Signing/verification use the Web Crypto API (globalThis.crypto.subtle) rather
 * than Node's `crypto`, so the exact same code runs in Next.js middleware (edge
 * runtime) and in Node server actions. No state is stored server-side: the
 * cookie itself is the session.
 */

/** Name of the cookie carrying the signed session token. */
export const SESSION_COOKIE = "alim_session";

export interface SessionPayload {
  /** Subject — the actor recorded in the audit log. */
  sub: string;
  /** Only password sessions are minted; proxy identities never get a cookie. */
  mode: "password";
  /** Issued-at, unix seconds. */
  iat: number;
  /** Expiry, unix seconds. */
  exp: number;
}

const encoder = new TextEncoder();

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmac(payloadB64: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadB64));
  return toBase64Url(new Uint8Array(sig));
}

/** Constant-time string comparison (avoids signature-timing leaks). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Sign a new session token valid for `ttlSeconds`. */
export async function signSession(
  claims: { sub: string; mode: "password" },
  secret: string,
  ttlSeconds: number,
  now: number = nowSeconds(),
): Promise<string> {
  const payload: SessionPayload = {
    sub: claims.sub,
    mode: claims.mode,
    iat: now,
    exp: now + ttlSeconds,
  };
  const payloadB64 = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const sig = await hmac(payloadB64, secret);
  return `${payloadB64}.${sig}`;
}

/**
 * Verify a token's signature and expiry. Returns the payload when valid, or
 * null for any malformed, tampered, mis-signed, or expired token.
 */
export async function verifySession(
  token: string,
  secret: string,
  now: number = nowSeconds(),
): Promise<SessionPayload | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  if (!payloadB64 || !sig) return null;

  const expected = await hmac(payloadB64, secret);
  if (!timingSafeEqual(sig, expected)) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadB64)));
  } catch {
    return null;
  }
  if (typeof payload.exp !== "number" || payload.exp <= now) return null;
  if (typeof payload.sub !== "string" || payload.mode !== "password") return null;
  return payload;
}
