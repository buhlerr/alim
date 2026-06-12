import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth/server", () => ({
  getCurrentActor: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { getCurrentActor } from "@/lib/auth/server";
import { auditService, getActor } from "./audit";

const auditLog = prisma.auditLog as unknown as {
  create: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
};
const currentActor = getCurrentActor as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.PROVISIONED_BY;
  currentActor.mockResolvedValue(null); // no request context by default
});

describe("getActor", () => {
  it("prefers the authenticated user from the request", async () => {
    currentActor.mockResolvedValue("alice@example.com");
    process.env.PROVISIONED_BY = "ignored";
    expect(await getActor()).toBe("alice@example.com");
  });

  it("falls back to PROVISIONED_BY when there is no authenticated user", async () => {
    process.env.PROVISIONED_BY = "aasim";
    expect(await getActor()).toBe("aasim");
  });

  it("falls back to internal-admin when nothing is configured", async () => {
    expect(await getActor()).toBe("internal-admin");
  });
});

describe("auditService.record", () => {
  it("persists the event with sensible defaults", async () => {
    auditLog.create.mockResolvedValue({});
    await auditService.record({
      action: "secret.create",
      summary: "Created secret X",
      targetType: "secret",
      targetId: "id1",
    });
    const data = auditLog.create.mock.calls[0][0].data;
    expect(data.action).toBe("secret.create");
    expect(data.summary).toBe("Created secret X");
    expect(data.targetType).toBe("secret");
    expect(data.targetId).toBe("id1");
    expect(data.actor).toBe("internal-admin");
    expect(data.success).toBe(true);
  });

  it("records the given actor and success=false when provided", async () => {
    auditLog.create.mockResolvedValue({});
    await auditService.record({
      action: "database.provision",
      summary: "failed",
      actor: "ci",
      success: false,
    });
    const data = auditLog.create.mock.calls[0][0].data;
    expect(data.actor).toBe("ci");
    expect(data.success).toBe(false);
  });

  it("never throws when the write fails (best-effort)", async () => {
    auditLog.create.mockRejectedValue(new Error("db down"));
    await expect(
      auditService.record({ action: "x", summary: "y" }),
    ).resolves.toBeUndefined();
  });
});

describe("auditService.list", () => {
  it("orders by createdAt desc with a default limit", async () => {
    auditLog.findMany.mockResolvedValue([]);
    await auditService.list();
    const arg = auditLog.findMany.mock.calls[0][0];
    expect(arg.orderBy).toEqual({ createdAt: "desc" });
    expect(arg.take).toBeGreaterThan(0);
  });

  it("filters by action, actor, and targetType", async () => {
    auditLog.findMany.mockResolvedValue([]);
    await auditService.list({
      action: "secret.reveal",
      actor: "aasim",
      targetType: "secret",
    });
    const where = auditLog.findMany.mock.calls[0][0].where;
    expect(where.action).toBe("secret.reveal");
    expect(where.actor).toBe("aasim");
    expect(where.targetType).toBe("secret");
  });

  it("filters by date range", async () => {
    auditLog.findMany.mockResolvedValue([]);
    const from = new Date("2026-01-01");
    const to = new Date("2026-02-01");
    await auditService.list({ from, to });
    const where = auditLog.findMany.mock.calls[0][0].where;
    expect(where.createdAt).toEqual({ gte: from, lte: to });
  });

  it("omits the where clause keys when no filters are given", async () => {
    auditLog.findMany.mockResolvedValue([]);
    await auditService.list();
    const where = auditLog.findMany.mock.calls[0][0].where;
    expect(where.action).toBeUndefined();
    expect(where.createdAt).toBeUndefined();
  });
});
