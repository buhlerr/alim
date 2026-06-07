import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { provisionedDatabase: { groupBy: vi.fn(), findMany: vi.fn() } },
}));

import { prisma } from "@/lib/prisma";
import { registryService } from "./registry";

const db = prisma.provisionedDatabase as unknown as {
  groupBy: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
};

beforeEach(() => vi.clearAllMocks());

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
});
