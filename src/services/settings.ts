import "server-only";
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/crypto";

/**
 * Encrypted key/value settings store over the `Setting` table. Values are
 * encrypted at rest with AES-256-GCM (`src/lib/crypto.ts`). Used to hold
 * external API credentials (Coolify token, future NPM/Cloudflare tokens).
 *
 * Keys are namespaced by convention, e.g. "coolify.apiToken".
 */
export const settingsService = {
  /** Upsert an encrypted value by key. */
  async set(key: string, value: string): Promise<void> {
    const encryptedValue = encrypt(value);
    await prisma.setting.upsert({
      where: { key },
      create: { key, encryptedValue },
      update: { encryptedValue },
    });
  },

  /** Return the decrypted value, or null if missing or undecryptable. */
  async get(key: string): Promise<string | null> {
    const row = await prisma.setting.findUnique({ where: { key } });
    if (!row) return null;
    try {
      return decrypt(row.encryptedValue);
    } catch {
      // Stale value encrypted under a rotated/absent key — treat as unset.
      return null;
    }
  },

  /** Whether a value exists for the key (without decrypting). */
  async has(key: string): Promise<boolean> {
    const row = await prisma.setting.findUnique({ where: { key } });
    return Boolean(row);
  },

  /** Remove a key. No-op if absent. */
  async delete(key: string): Promise<void> {
    await prisma.setting.deleteMany({ where: { key } });
  },
};
