/**
 * Constant-time verification of the shared gate password.
 */

const encoder = new TextEncoder();

/**
 * Compare a submitted password against the configured one in constant time.
 * Returns false when no password is configured (proxy-only deployments) or on
 * any length/content mismatch. The comparison time depends only on the
 * configured password length, never on where the first differing byte is.
 */
export function verifyPassword(submitted: string, configured: string | null): boolean {
  if (!configured) return false;
  const a = encoder.encode(submitted);
  const b = encoder.encode(configured);
  // XOR the length difference into the accumulator so mismatched lengths still
  // run a full pass over `b` and always return false.
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) {
    diff |= b[i] ^ (a[i] ?? 0);
  }
  return diff === 0;
}
