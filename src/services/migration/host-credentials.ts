import "server-only";
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/crypto";

/**
 * CRUD service for host SSH credentials. Private keys are encrypted at rest
 * (AES-256-GCM). The `list()` method returns metadata only; never the key.
 * The decrypt accessor is kept server-side and used only by the SSH module.
 */

/** Safe, client-sendable view of a host credential. */
export interface HostCredentialSummary {
  id: string;
  name: string;
  hostname: string | null;
  ipAddress: string;
  sshPort: number;
  sshUsername: string;
  providerType: string;
  coolifyServerUuid: string | null;
  /** Always true when a row exists -- signals a key is stored. */
  hasKey: true;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertHostCredentialInput {
  coolifyServerUuid: string;
  name: string;
  ipAddress: string;
  sshPort?: number;
  sshUsername?: string;
  hostname?: string | null;
  /** Plaintext PEM or OpenSSH private key; will be encrypted before storing. */
  privateKey: string;
  providerType?: string;
}

const SUMMARY_SELECT = {
  id: true,
  name: true,
  hostname: true,
  ipAddress: true,
  sshPort: true,
  sshUsername: true,
  providerType: true,
  coolifyServerUuid: true,
  createdAt: true,
  updatedAt: true,
} as const;

function toSummary(row: {
  id: string;
  name: string;
  hostname: string | null;
  ipAddress: string;
  sshPort: number;
  sshUsername: string;
  providerType: string;
  coolifyServerUuid: string | null;
  createdAt: Date;
  updatedAt: Date;
  // encryptedPrivateKey is intentionally excluded here
  [key: string]: unknown;
}): HostCredentialSummary {
  return {
    id: row.id,
    name: row.name,
    hostname: row.hostname,
    ipAddress: row.ipAddress,
    sshPort: row.sshPort,
    sshUsername: row.sshUsername,
    providerType: row.providerType,
    coolifyServerUuid: row.coolifyServerUuid,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    hasKey: true,
  };
}

export const hostCredentialsService = {
  async list(): Promise<HostCredentialSummary[]> {
    const rows = await prisma.hostCredential.findMany({
      orderBy: { name: "asc" },
      select: SUMMARY_SELECT,
    });
    return rows.map(toSummary);
  },

  async upsertForServer(input: UpsertHostCredentialInput): Promise<HostCredentialSummary> {
    const encrypted = encrypt(input.privateKey);
    const data = {
      name: input.name.trim(),
      ipAddress: input.ipAddress.trim(),
      sshPort: input.sshPort ?? 22,
      sshUsername: input.sshUsername?.trim() ?? "root",
      hostname: input.hostname?.trim() || null,
      encryptedPrivateKey: encrypted,
      providerType: input.providerType ?? "coolify",
    };

    const existing = input.coolifyServerUuid
      ? await prisma.hostCredential.findFirst({
          where: { coolifyServerUuid: input.coolifyServerUuid },
          select: { id: true },
        })
      : null;

    if (existing) {
      const row = await prisma.hostCredential.update({
        where: { id: existing.id },
        data,
        select: SUMMARY_SELECT,
      });
      return toSummary(row);
    }

    const row = await prisma.hostCredential.create({
      data: { ...data, coolifyServerUuid: input.coolifyServerUuid },
      select: SUMMARY_SELECT,
    });
    return toSummary(row);
  },

  /**
   * Returns the full row including a `privateKey()` accessor that decrypts
   * on demand. Server-only; never expose this object to the client.
   */
  async getByServerUuid(
    uuid: string,
  ): Promise<(HostCredentialSummary & { privateKey: () => string }) | null> {
    const row = await prisma.hostCredential.findFirst({
      where: { coolifyServerUuid: uuid },
    });
    if (!row) return null;
    return {
      ...toSummary(row),
      privateKey: () => decrypt(row.encryptedPrivateKey),
    };
  },

  async getByIp(
    ip: string,
  ): Promise<(HostCredentialSummary & { privateKey: () => string }) | null> {
    const row = await prisma.hostCredential.findFirst({
      where: { ipAddress: ip },
    });
    if (!row) return null;
    return {
      ...toSummary(row),
      privateKey: () => decrypt(row.encryptedPrivateKey),
    };
  },

  async remove(id: string): Promise<void> {
    await prisma.hostCredential.delete({ where: { id } });
  },
};
