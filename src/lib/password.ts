import { randomBytes } from "node:crypto";

// URL-safe alphabet only. Every character here can appear in a connection
// string's password component without percent-encoding, which keeps the
// generated DATABASE_URL clean and copy-paste friendly.
const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

const DEFAULT_LENGTH = 32;

/**
 * Generate a cryptographically strong password using Node's crypto.
 * Uses rejection sampling so every character is uniformly distributed (no
 * modulo bias).
 */
export function generatePassword(length: number = DEFAULT_LENGTH): string {
  if (length < 16) length = 16;
  const max = 256 - (256 % ALPHABET.length);
  let out = "";
  while (out.length < length) {
    const bytes = randomBytes(length * 2);
    for (let i = 0; i < bytes.length && out.length < length; i++) {
      const b = bytes[i];
      if (b >= max) continue; // reject to avoid modulo bias
      out += ALPHABET[b % ALPHABET.length];
    }
  }
  return out;
}
