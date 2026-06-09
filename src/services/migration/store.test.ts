import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    migrationJob: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), deleteMany: vi.fn(), delete: vi.fn() },
    migrationStep: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    migrationLog: { create: vi.fn() },
    migrationArtifact: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { migrationStore } from "./store";

const job = prisma.migrationJob as unknown as Record<string, ReturnType<typeof vi.fn>>;
const step = prisma.migrationStep as unknown as Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("migrationStore.createJob", () => {
  it("seeds the steps from the planner for the migration type", async () => {
    job.create.mockResolvedValue({ id: "job-1" });
    await migrationStore.createJob({
      migrationType: "migrate",
      sourceResourceId: "app-n8n",
      sourceResourceName: "n8n",
      destinationResourceName: "n8n",
      sourceHost: "server-2",
      sourceHostName: "Server 2",
      destinationHost: "server-3",
      destinationHostName: "Server 3",
      exposure: "internal",
      npmEnabled: false,
      cloudflareEnabled: false,
      sourceResourceSnapshot: { volumes: [] },
    });
    const arg = job.create.mock.calls[0][0];
    expect(arg.data.steps.create.map((s: { key: string }) => s.key)).toEqual([
      "validate",
      "stop_source",
      "archive_volumes",
      "transfer_volumes",
      "restore_volumes",
      "provision",
      "deploy",
      "validation_url",
      "await_approval",
      "switch_endpoints",
      "delete_source",
      "complete",
    ]);
  });
});

describe("migrationStore.deleteTerminalJobs", () => {
  it("deletes only completed/failed/rolled_back jobs and returns the count", async () => {
    job.deleteMany.mockResolvedValue({ count: 3 });
    const n = await migrationStore.deleteTerminalJobs();
    expect(n).toBe(3);
    expect(job.deleteMany).toHaveBeenCalledWith({
      where: { status: { in: ["completed", "failed", "rolled_back"] } },
    });
  });
});

describe("migrationStore.resetFailedStep", () => {
  it("returns false when no step has status failed", async () => {
    step.findMany.mockResolvedValue([
      { key: "validate", status: "success", order: 0 },
      { key: "provision", status: "running", order: 1 },
    ]);
    const result = await migrationStore.resetFailedStep("job-1");
    expect(result).toBe(false);
    expect(step.update).not.toHaveBeenCalled();
    expect(job.update).not.toHaveBeenCalled();
  });

  it("resets the failed step to pending and restores job status/error", async () => {
    step.findMany.mockResolvedValue([
      { key: "validate", status: "success", order: 0 },
      { key: "provision", status: "failed", order: 1 },
    ]);
    step.update.mockResolvedValue({ key: "provision", status: "pending" });
    job.update.mockResolvedValue({ id: "job-1", status: "provisioning", errorMessage: null });

    const result = await migrationStore.resetFailedStep("job-1");
    expect(result).toBe(true);

    expect(step.update).toHaveBeenCalledWith({
      where: { jobId_key: { jobId: "job-1", key: "provision" } },
      data: { status: "pending", detail: null, finishedAt: null },
    });
    expect(job.update).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: { status: "provisioning", errorMessage: null },
    });
  });
});

describe("migrationStore.deleteJob", () => {
  it("calls prisma delete with the given job id", async () => {
    job.delete.mockResolvedValue({ id: "job-1" });
    await migrationStore.deleteJob("job-1");
    expect(job.delete).toHaveBeenCalledWith({ where: { id: "job-1" } });
  });
});
