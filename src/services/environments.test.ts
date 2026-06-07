import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    environment: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      aggregate: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import { environmentsService } from "./environments";

const env = prisma.environment as unknown as {
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  aggregate: ReturnType<typeof vi.fn>;
};
const tx = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("environmentsService", () => {
  it("list() orders by sortOrder", async () => {
    env.findMany.mockResolvedValue([]);
    await environmentsService.list();
    expect(env.findMany).toHaveBeenCalledWith({ orderBy: { sortOrder: "asc" } });
  });

  it("create() slugifies the name into a unique uppercase key and appends to the end", async () => {
    env.findUnique.mockResolvedValue(null);
    env.aggregate.mockResolvedValue({ _max: { sortOrder: 2 } });
    env.create.mockImplementation(async ({ data }: { data: unknown }) => data);
    const created = await environmentsService.create({ name: "QA EU", color: "blue" });
    expect(created.key).toBe("QA_EU");
    expect(created.sortOrder).toBe(3);
    expect(created.abbreviation).toBe("qa_eu");
  });

  it("create() de-duplicates a colliding key with a numeric suffix", async () => {
    env.findUnique
      .mockResolvedValueOnce({ key: "QA" })
      .mockResolvedValueOnce(null);
    env.aggregate.mockResolvedValue({ _max: { sortOrder: 0 } });
    env.create.mockImplementation(async ({ data }: { data: { key: string } }) => data);
    const created = await environmentsService.create({ name: "QA", color: "red" });
    expect(created.key).toBe("QA_2");
  });

  it("update() never changes the key", async () => {
    env.update.mockResolvedValue({});
    await environmentsService.update("PRODUCTION", { name: "Prod", color: "red" });
    const arg = env.update.mock.calls[0][0];
    expect(arg.where).toEqual({ key: "PRODUCTION" });
    expect(arg.data).not.toHaveProperty("key");
  });

  it("delete() returns a friendly error when the environment is in use (P2003)", async () => {
    env.delete.mockRejectedValue({ code: "P2003" });
    const res = await environmentsService.remove("PRODUCTION");
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/in use/i);
  });

  it("delete() returns ok on success", async () => {
    env.delete.mockResolvedValue({});
    expect(await environmentsService.remove("OLD")).toEqual({ ok: true });
  });

  it("reorder() writes sortOrder for each key in order", async () => {
    tx.mockResolvedValue([]);
    await environmentsService.reorder(["DEVELOPMENT", "STAGING", "PRODUCTION"]);
    expect(tx).toHaveBeenCalledTimes(1);
    const ops = tx.mock.calls[0][0];
    expect(ops).toHaveLength(3);
  });
});
