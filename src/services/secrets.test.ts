import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Prisma singleton.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    secret: {
      findMany: vi.fn(),
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
import { secretsService } from "./secrets";

const secret = prisma.secret as unknown as {
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

beforeEach(() => vi.clearAllMocks());

describe("secretsService", () => {
  it("list() orders by name and never selects the encrypted value", async () => {
    secret.findMany.mockResolvedValue([]);
    await secretsService.list();
    const arg = secret.findMany.mock.calls[0][0];
    expect(arg.orderBy).toEqual({ name: "asc" });
    expect(arg.select).toBeDefined();
    expect(arg.select.encryptedValue).toBeUndefined();
  });

  it("create() encrypts the value and trims fields", async () => {
    secret.create.mockImplementation(async ({ data }: { data: unknown }) => data);
    await secretsService.create({
      name: "  Stripe  ",
      value: "sk_live_1",
      category: " API Token ",
      description: "  pay  ",
    });
    expect(encrypt).toHaveBeenCalledWith("sk_live_1");
    const data = secret.create.mock.calls[0][0].data;
    expect(data.name).toBe("Stripe");
    expect(data.category).toBe("API Token");
    expect(data.description).toBe("pay");
    expect(data.encryptedValue).toBe("enc(sk_live_1)");
  });

  it("create() stores null description when blank", async () => {
    secret.create.mockImplementation(async ({ data }: { data: unknown }) => data);
    await secretsService.create({ name: "X", value: "v", category: "Other" });
    expect(secret.create.mock.calls[0][0].data.description).toBeNull();
  });

  it("update() re-encrypts when a new value is given", async () => {
    secret.update.mockResolvedValue({});
    await secretsService.update("id1", {
      name: "X",
      value: "new",
      category: "Other",
    });
    expect(encrypt).toHaveBeenCalledWith("new");
    expect(secret.update.mock.calls[0][0].data.encryptedValue).toBe("enc(new)");
  });

  it("update() leaves the value untouched when none is given", async () => {
    secret.update.mockResolvedValue({});
    await secretsService.update("id1", { name: "X", category: "Other" });
    expect(encrypt).not.toHaveBeenCalled();
    expect(secret.update.mock.calls[0][0].data).not.toHaveProperty("encryptedValue");
  });

  it("update() treats an empty value as unchanged", async () => {
    secret.update.mockResolvedValue({});
    await secretsService.update("id1", { name: "X", value: "", category: "Other" });
    expect(encrypt).not.toHaveBeenCalled();
    expect(secret.update.mock.calls[0][0].data).not.toHaveProperty("encryptedValue");
  });

  it("remove() deletes by id", async () => {
    secret.delete.mockResolvedValue({});
    await secretsService.remove("id1");
    expect(secret.delete).toHaveBeenCalledWith({ where: { id: "id1" } });
  });

  it("reveal() decrypts, stamps lastRevealedAt, and returns plaintext", async () => {
    secret.findUnique.mockResolvedValue({ id: "id1", encryptedValue: "enc(top)" });
    secret.update.mockResolvedValue({});
    const value = await secretsService.reveal("id1");
    expect(decrypt).toHaveBeenCalledWith("enc(top)");
    expect(value).toBe("top");
    const data = secret.update.mock.calls[0][0].data;
    expect(data.lastRevealedAt).toBeInstanceOf(Date);
  });

  it("reveal() returns null for a missing secret without stamping", async () => {
    secret.findUnique.mockResolvedValue(null);
    expect(await secretsService.reveal("missing")).toBeNull();
    expect(secret.update).not.toHaveBeenCalled();
  });

  it("reveal() returns null (not throw) when decryption fails", async () => {
    secret.findUnique.mockResolvedValue({ id: "id1", encryptedValue: "garbage" });
    (decrypt as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error("bad key");
    });
    expect(await secretsService.reveal("id1")).toBeNull();
    expect(secret.update).not.toHaveBeenCalled();
  });
});
