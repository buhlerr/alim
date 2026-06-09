import "server-only";
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/crypto";

/**
 * Encrypted vault over the `Secret` table. Values are encrypted at rest with
 * AES-256-GCM (`src/lib/crypto.ts`). The plaintext value is only ever returned
 * through `reveal()`; `list()` returns metadata only.
 */

/** Metadata view of a secret; never includes the value or ciphertext. */
export interface SecretSummary {
  id: string;
  name: string;
  description: string | null;
  category: string;
  lastRevealedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSecretData {
  name: string;
  value: string;
  category: string;
  description?: string | null;
}

export interface UpdateSecretData {
  name: string;
  /** When omitted or empty, the stored encrypted value is kept unchanged. */
  value?: string;
  category: string;
  description?: string | null;
}

const SUMMARY_SELECT = {
  id: true,
  name: true,
  description: true,
  category: true,
  lastRevealedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const secretsService = {
  async list(): Promise<SecretSummary[]> {
    return prisma.secret.findMany({
      orderBy: { name: "asc" },
      select: SUMMARY_SELECT,
    });
  },

  async create(input: CreateSecretData): Promise<SecretSummary> {
    return prisma.secret.create({
      data: {
        name: input.name.trim(),
        description: input.description?.trim() || null,
        category: input.category.trim(),
        encryptedValue: encrypt(input.value),
      },
      select: SUMMARY_SELECT,
    });
  },

  async update(id: string, input: UpdateSecretData): Promise<SecretSummary> {
    return prisma.secret.update({
      where: { id },
      data: {
        name: input.name.trim(),
        description: input.description?.trim() || null,
        category: input.category.trim(),
        ...(input.value ? { encryptedValue: encrypt(input.value) } : {}),
      },
      select: SUMMARY_SELECT,
    });
  },

  async remove(id: string): Promise<void> {
    await prisma.secret.delete({ where: { id } });
  },

  /**
   * Decrypt and return the plaintext value, stamping `lastRevealedAt`. Returns
   * null if the secret is missing or its value can't be decrypted (e.g. a
   * rotated/absent ENCRYPTION_KEY); never throws for those cases.
   */
  async reveal(id: string): Promise<string | null> {
    const row = await prisma.secret.findUnique({ where: { id } });
    if (!row) return null;
    let value: string;
    try {
      value = decrypt(row.encryptedValue);
    } catch {
      return null;
    }
    await prisma.secret.update({
      where: { id },
      data: { lastRevealedAt: new Date() },
    });
    return value;
  },
};
