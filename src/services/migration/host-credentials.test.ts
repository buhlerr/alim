import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Prisma singleton.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    hostCredential: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

// Mock crypto so we assert wiring without a real key.
vi.mock("@/lib/crypto", () => ({
  encrypt: vi.fn((v: string) => `enc(${v})`),
  decrypt: vi.fn((v: string) => v.replace(/^enc\(/, "").replace(/\)$/, "")),
}));

import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/crypto";
import { hostCredentialsService } from "./host-credentials";

const db = prisma.hostCredential as unknown as {
  findMany: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const SAMPLE_ROW = {
  id: "cred1",
  name: "prod-server",
  hostname: "prod.example.com",
  ipAddress: "1.2.3.4",
  sshPort: 22,
  sshUsername: "root",
  providerType: "coolify",
  coolifyServerUuid: "uuid-abc",
  encryptedPrivateKey: "enc(-----BEGIN RSA PRIVATE KEY-----)",
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => vi.clearAllMocks());

describe("hostCredentialsService", () => {
  describe("list()", () => {
    it("orders by name and never selects the encrypted key", async () => {
      db.findMany.mockResolvedValue([]);
      await hostCredentialsService.list();
      const arg = db.findMany.mock.calls[0][0];
      expect(arg.orderBy).toEqual({ name: "asc" });
      expect(arg.select).toBeDefined();
      expect(arg.select.encryptedPrivateKey).toBeUndefined();
    });

    it("maps rows to summaries with hasKey: true, never returning the encrypted value", async () => {
      db.findMany.mockResolvedValue([SAMPLE_ROW]);
      const results = await hostCredentialsService.list();
      expect(results).toHaveLength(1);
      expect(results[0].hasKey).toBe(true);
      expect(results[0]).not.toHaveProperty("encryptedPrivateKey");
      expect(results[0]).not.toHaveProperty("privateKey");
    });
  });

  describe("upsertForServer()", () => {
    it("encrypts the private key before storing", async () => {
      db.findFirst.mockResolvedValue(null);
      db.create.mockImplementation(async ({ data }: { data: typeof SAMPLE_ROW }) => ({
        ...data,
        id: "new1",
        hostname: null,
        coolifyServerUuid: "uuid-abc",
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      await hostCredentialsService.upsertForServer({
        coolifyServerUuid: "uuid-abc",
        name: "prod-server",
        ipAddress: "1.2.3.4",
        privateKey: "-----BEGIN RSA PRIVATE KEY-----",
      });

      expect(encrypt).toHaveBeenCalledWith("-----BEGIN RSA PRIVATE KEY-----");
      const created = db.create.mock.calls[0][0].data;
      expect(created.encryptedPrivateKey).toBe("enc(-----BEGIN RSA PRIVATE KEY-----)");
    });

    it("creates a new row when no existing credential for the uuid", async () => {
      db.findFirst.mockResolvedValue(null);
      db.create.mockImplementation(async ({ data }: { data: typeof SAMPLE_ROW }) => ({
        ...data,
        id: "new1",
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      await hostCredentialsService.upsertForServer({
        coolifyServerUuid: "uuid-new",
        name: "server",
        ipAddress: "5.6.7.8",
        privateKey: "key",
      });

      expect(db.create).toHaveBeenCalledOnce();
      expect(db.update).not.toHaveBeenCalled();
    });

    it("updates when a credential already exists for the uuid", async () => {
      db.findFirst.mockResolvedValue({ id: "existing1" });
      db.update.mockImplementation(async ({ data }: { data: typeof SAMPLE_ROW }) => ({
        ...data,
        id: "existing1",
        hostname: null,
        coolifyServerUuid: "uuid-abc",
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      await hostCredentialsService.upsertForServer({
        coolifyServerUuid: "uuid-abc",
        name: "updated",
        ipAddress: "1.2.3.4",
        privateKey: "newkey",
      });

      expect(db.update).toHaveBeenCalledOnce();
      expect(db.create).not.toHaveBeenCalled();
      expect(db.update.mock.calls[0][0].where).toEqual({ id: "existing1" });
    });

    it("applies default port 22 and username root when not provided", async () => {
      db.findFirst.mockResolvedValue(null);
      db.create.mockImplementation(async ({ data }: { data: typeof SAMPLE_ROW }) => ({
        ...data,
        id: "new1",
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      await hostCredentialsService.upsertForServer({
        coolifyServerUuid: "uuid-x",
        name: "s",
        ipAddress: "1.1.1.1",
        privateKey: "k",
      });

      const data = db.create.mock.calls[0][0].data;
      expect(data.sshPort).toBe(22);
      expect(data.sshUsername).toBe("root");
    });
  });

  describe("getByServerUuid()", () => {
    it("returns null when no credential found", async () => {
      db.findFirst.mockResolvedValue(null);
      const result = await hostCredentialsService.getByServerUuid("missing");
      expect(result).toBeNull();
    });

    it("returns summary with privateKey accessor that decrypts on call", async () => {
      db.findFirst.mockResolvedValue(SAMPLE_ROW);
      const result = await hostCredentialsService.getByServerUuid("uuid-abc");
      expect(result).not.toBeNull();
      expect(result!.hasKey).toBe(true);
      // encryptedPrivateKey must not leak on the public surface
      expect((result as unknown as Record<string, unknown>).encryptedPrivateKey).toBeUndefined();
      // The key is only revealed when the accessor is called
      const key = result!.privateKey();
      expect(decrypt).toHaveBeenCalledWith(SAMPLE_ROW.encryptedPrivateKey);
      expect(key).toBe("-----BEGIN RSA PRIVATE KEY-----");
    });
  });

  describe("getByIp()", () => {
    it("returns null when no credential found", async () => {
      db.findFirst.mockResolvedValue(null);
      const result = await hostCredentialsService.getByIp("9.9.9.9");
      expect(result).toBeNull();
    });

    it("returns summary with privateKey accessor", async () => {
      db.findFirst.mockResolvedValue(SAMPLE_ROW);
      const result = await hostCredentialsService.getByIp("1.2.3.4");
      expect(result).not.toBeNull();
      expect(result!.hasKey).toBe(true);
      expect(typeof result!.privateKey).toBe("function");
    });
  });

  describe("remove()", () => {
    it("deletes by id", async () => {
      db.delete.mockResolvedValue({});
      await hostCredentialsService.remove("cred1");
      expect(db.delete).toHaveBeenCalledWith({ where: { id: "cred1" } });
    });
  });
});
