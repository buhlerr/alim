import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    provisionedDatabase: {
      groupBy: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { registryService } from "./registry";

const db = prisma.provisionedDatabase as unknown as {
  groupBy: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.PROVISIONED_BY;
});

describe("registryService.stats", () => {
  it("returns a total and a per-environment-key count map", async () => {
    db.groupBy.mockResolvedValue([
      { environment: "PRODUCTION", _count: { _all: 3 } },
      { environment: "QA", _count: { _all: 1 } },
    ]);
    const stats = await registryService.stats();
    expect(stats.total).toBe(4);
    expect(stats.byEnvironment).toEqual({ PRODUCTION: 3, QA: 1 });
  });

  it("returns zeros when there are no records", async () => {
    db.groupBy.mockResolvedValue([]);
    expect(await registryService.stats()).toEqual({ total: 0, byEnvironment: {} });
  });
});

describe("registryService.record", () => {
  it("upserts idempotently on (environment, host, databaseName)", async () => {
    db.upsert.mockResolvedValue({ id: "1" });
    await registryService.record({
      applicationName: "app",
      environment: "PRODUCTION",
      databaseName: "app_db",
      username: "app_user",
      host: "db.host",
    });
    const arg = db.upsert.mock.calls[0][0];
    expect(arg.where.env_host_db).toEqual({
      environment: "PRODUCTION",
      host: "db.host",
      databaseName: "app_db",
    });
    // Update path must not touch the unique-key columns.
    expect(arg.update).not.toHaveProperty("databaseName");
    expect(arg.update).not.toHaveProperty("host");
  });

  it("defaults createdBy to internal-admin, honoring PROVISIONED_BY", async () => {
    db.upsert.mockResolvedValue({});
    await registryService.record({
      applicationName: "a",
      environment: "PRODUCTION",
      databaseName: "d",
      username: "u",
      host: "h",
    });
    expect(db.upsert.mock.calls[0][0].create.createdBy).toBe("internal-admin");

    process.env.PROVISIONED_BY = "ci-bot";
    await registryService.record({
      applicationName: "a",
      environment: "PRODUCTION",
      databaseName: "d2",
      username: "u",
      host: "h",
    });
    expect(db.upsert.mock.calls[1][0].create.createdBy).toBe("ci-bot");
  });
});

describe("registryService.list", () => {
  it("searches across app/database/username when given a query", async () => {
    db.findMany.mockResolvedValue([]);
    await registryService.list("  shop  ");
    const where = db.findMany.mock.calls[0][0].where;
    expect(where.OR).toHaveLength(3);
    expect(where.OR[0]).toEqual({
      applicationName: { contains: "shop", mode: "insensitive" },
    });
  });

  it("omits the filter when no query is given", async () => {
    db.findMany.mockResolvedValue([]);
    await registryService.list();
    expect(db.findMany.mock.calls[0][0].where).toBeUndefined();
  });
});

describe("registryService.recent", () => {
  it("takes the latest N ordered by createdAt desc", async () => {
    db.findMany.mockResolvedValue([]);
    await registryService.recent(8);
    expect(db.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
      take: 8,
    });
  });
});
