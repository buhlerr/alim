import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Prisma singleton.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    setting: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
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
import { settingsService } from "./settings";

const settingMock = prisma.setting as unknown as {
  upsert: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("settingsService", () => {
  it("encrypts on set and upserts by key", async () => {
    settingMock.upsert.mockResolvedValue({});
    await settingsService.set("coolify.apiToken", "secret-123");
    expect(encrypt).toHaveBeenCalledWith("secret-123");
    expect(settingMock.upsert).toHaveBeenCalledWith({
      where: { key: "coolify.apiToken" },
      create: { key: "coolify.apiToken", encryptedValue: "enc(secret-123)" },
      update: { encryptedValue: "enc(secret-123)" },
    });
  });

  it("decrypts on get", async () => {
    settingMock.findUnique.mockResolvedValue({
      key: "coolify.apiToken",
      encryptedValue: "enc(secret-123)",
    });
    const value = await settingsService.get("coolify.apiToken");
    expect(decrypt).toHaveBeenCalledWith("enc(secret-123)");
    expect(value).toBe("secret-123");
  });

  it("returns null when a key is missing", async () => {
    settingMock.findUnique.mockResolvedValue(null);
    expect(await settingsService.get("missing")).toBeNull();
  });

  it("returns null (not throw) when decryption fails", async () => {
    settingMock.findUnique.mockResolvedValue({
      key: "k",
      encryptedValue: "garbage",
    });
    (decrypt as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error("bad key");
    });
    expect(await settingsService.get("k")).toBeNull();
  });

  it("has() reflects row existence", async () => {
    settingMock.findUnique.mockResolvedValue({ key: "k", encryptedValue: "x" });
    expect(await settingsService.has("k")).toBe(true);
    settingMock.findUnique.mockResolvedValue(null);
    expect(await settingsService.has("k")).toBe(false);
  });

  it("delete removes by key", async () => {
    settingMock.deleteMany.mockResolvedValue({ count: 1 });
    await settingsService.delete("k");
    expect(settingMock.deleteMany).toHaveBeenCalledWith({ where: { key: "k" } });
  });
});
