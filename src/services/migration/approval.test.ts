import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./store", () => ({
  migrationStore: {
    getJob: vi.fn(),
    getSteps: vi.fn(),
    updateStep: vi.fn(),
    updateJob: vi.fn(),
    appendLog: vi.fn(),
    getArtifact: vi.fn(),
  },
}));
vi.mock("./provider", () => ({
  platformProvider: { deleteResource: vi.fn(), startResource: vi.fn() },
}));

import { migrationStore } from "./store";
import { platformProvider } from "./provider";
import { approvalService } from "./approval";
import { MigrationError } from "./types";

const store = migrationStore as unknown as Record<string, ReturnType<typeof vi.fn>>;
const provider = platformProvider as unknown as Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  vi.clearAllMocks();
  store.updateStep.mockResolvedValue({});
  store.updateJob.mockResolvedValue({});
  store.appendLog.mockResolvedValue(undefined);
  store.getArtifact.mockResolvedValue({ reference: "dest-1" });
  store.getSteps.mockResolvedValue([
    { key: "await_approval", status: "success" },
    { key: "switch_endpoints", status: "pending" },
    { key: "delete_source", status: "pending" },
  ]);
});

describe("approvalService.approve", () => {
  it("transitions awaiting_approval -> cutting_over and stamps approvedAt", async () => {
    store.getJob.mockResolvedValueOnce({ id: "job-1", status: "awaiting_approval", sourceResourceId: "src" });
    store.getJob.mockResolvedValueOnce({ id: "job-1", status: "cutting_over" });
    await approvalService.approve("job-1");
    expect(store.updateStep).toHaveBeenCalledWith("job-1", "await_approval", expect.objectContaining({ status: "success" }));
    expect(store.updateJob).toHaveBeenCalledWith("job-1", expect.objectContaining({ status: "cutting_over" }));
  });

  it("rejects approval when not awaiting approval", async () => {
    store.getJob.mockResolvedValue({ id: "job-1", status: "deploying" });
    await expect(approvalService.approve("job-1")).rejects.toBeInstanceOf(MigrationError);
  });
});

describe("approvalService.rollback", () => {
  it("deletes destination, restarts source, skips remaining steps, sets rolled_back", async () => {
    store.getJob.mockResolvedValueOnce({ id: "job-1", status: "awaiting_approval", sourceResourceId: "src" });
    store.getJob.mockResolvedValueOnce({ id: "job-1", status: "rolled_back" });
    await approvalService.rollback("job-1");
    expect(provider.deleteResource).toHaveBeenCalledWith("dest-1");
    expect(provider.startResource).toHaveBeenCalledWith("src");
    expect(store.updateStep).toHaveBeenCalledWith("job-1", "switch_endpoints", expect.objectContaining({ status: "skipped" }));
    expect(store.updateStep).toHaveBeenCalledWith("job-1", "delete_source", expect.objectContaining({ status: "skipped" }));
    expect(store.updateJob).toHaveBeenCalledWith("job-1", expect.objectContaining({ status: "rolled_back" }));
  });

  it("rejects rollback once cutover has started", async () => {
    store.getJob.mockResolvedValue({ id: "job-1", status: "cutting_over", sourceResourceId: "src" });
    await expect(approvalService.rollback("job-1")).rejects.toBeInstanceOf(MigrationError);
  });
});
