import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./store", () => ({
  migrationStore: {
    getJob: vi.fn(),
    getSteps: vi.fn(),
    updateStep: vi.fn(),
    updateJob: vi.fn(),
    appendLog: vi.fn(),
    addArtifact: vi.fn(),
    getArtifact: vi.fn(),
  },
}));
vi.mock("./provider", () => ({
  platformProvider: {
    listHosts: vi.fn(),
    createResource: vi.fn(),
    deployResource: vi.fn(),
    generateValidationUrl: vi.fn(),
    stopResource: vi.fn(),
    startResource: vi.fn(),
    deleteResource: vi.fn(),
    switchEndpoints: vi.fn(),
  },
}));
vi.mock("./volume-transfer", () => ({
  volumeTransfer: { archive: vi.fn(), transfer: vi.fn(), restore: vi.fn() },
}));
vi.mock("./validation", () => ({
  validationService: { validate: vi.fn() },
}));

import { migrationStore } from "./store";
import { platformProvider } from "./provider";
import { volumeTransfer } from "./volume-transfer";
import { validationService } from "./validation";
import { migrationOrchestrator } from "./orchestrator";

const store = migrationStore as unknown as Record<string, ReturnType<typeof vi.fn>>;
const provider = platformProvider as unknown as Record<string, ReturnType<typeof vi.fn>>;
const vol = volumeTransfer as unknown as Record<string, ReturnType<typeof vi.fn>>;
const validate = validationService.validate as unknown as ReturnType<typeof vi.fn>;

const SNAPSHOT_NO_VOL = { volumes: [] };
const SNAPSHOT_WITH_VOL = { volumes: [{ name: "n8n_data", estimatedSizeMb: 512 }] };

function jobRow(over: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    status: "pending",
    migrationType: "migrate",
    sourceResourceId: "app-n8n",
    destinationResourceName: "n8n",
    sourceHost: "server-2",
    destinationHost: "server-3",
    npmEnabled: false,
    cloudflareEnabled: false,
    exposure: "internal",
    sourceResourceSnapshot: SNAPSHOT_WITH_VOL,
    ...over,
  };
}

function step(key: string, status = "pending", attemptNumber = 1) {
  return { key, label: key, order: 0, status, attemptNumber };
}

beforeEach(() => {
  vi.clearAllMocks();
  store.updateStep.mockResolvedValue({});
  store.updateJob.mockResolvedValue({});
  store.appendLog.mockResolvedValue(undefined);
  store.addArtifact.mockResolvedValue(undefined);
  store.getArtifact.mockResolvedValue({ reference: "dest-1" });
  provider.listHosts.mockResolvedValue([{ id: "server-3", name: "Server 3", ip: "192.168.100.11" }]);
  provider.createResource.mockResolvedValue({ resourceId: "dest-1" });
  provider.generateValidationUrl.mockResolvedValue("https://abc.192.168.100.11.sslip.io");
  vol.archive.mockResolvedValue("/tmp/a.tar.gz");
  vol.transfer.mockResolvedValue("server-3:/tmp/a.tar.gz");
  vol.restore.mockResolvedValue("server-3:volume/n8n_data");
  validate.mockResolvedValue({ ok: true, checks: [], volumes: [], exposure: "internal", defaults: {}, source: SNAPSHOT_WITH_VOL });
});

describe("migrationOrchestrator.advance - one step at a time", () => {
  it("runs validate, marks it success, and captures the snapshot", async () => {
    store.getJob.mockResolvedValue(jobRow());
    store.getSteps.mockResolvedValue([step("validate"), step("stop_source")]);
    await migrationOrchestrator.advance("job-1");
    expect(validate).toHaveBeenCalledOnce();
    expect(store.updateStep).toHaveBeenCalledWith(
      "job-1",
      "validate",
      expect.objectContaining({ status: "success" }),
    );
  });

  it("fails the job when validation fails", async () => {
    validate.mockResolvedValue({ ok: false, checks: [{ key: "disk", label: "d", pass: false, detail: "low" }], volumes: [], exposure: "internal", defaults: {}, source: SNAPSHOT_WITH_VOL });
    store.getJob.mockResolvedValue(jobRow());
    store.getSteps.mockResolvedValue([step("validate")]);
    await migrationOrchestrator.advance("job-1");
    expect(store.updateStep).toHaveBeenCalledWith("job-1", "validate", expect.objectContaining({ status: "failed" }));
    expect(store.updateJob).toHaveBeenCalledWith("job-1", expect.objectContaining({ status: "failed" }));
  });

  it("restarts the source when a migrate fails after stop_source succeeded", async () => {
    provider.createResource.mockRejectedValue(new Error("Coolify 409"));
    store.getArtifact.mockResolvedValue(null); // provision failed: nothing to delete
    store.getJob.mockResolvedValue(jobRow({ status: "transferring" }));
    store.getSteps.mockResolvedValue([
      step("stop_source", "success"),
      step("provision", "pending"),
    ]);
    await migrationOrchestrator.advance("job-1");
    expect(store.updateStep).toHaveBeenCalledWith("job-1", "provision", expect.objectContaining({ status: "failed" }));
    expect(provider.startResource).toHaveBeenCalledWith("app-n8n");
    expect(provider.deleteResource).not.toHaveBeenCalled();
  });

  it("deletes the destination resource when a step fails after provision", async () => {
    provider.deployResource.mockRejectedValue(new Error("deploy boom"));
    store.getArtifact.mockResolvedValue({ reference: "dest-1" });
    store.getJob.mockResolvedValue(jobRow({ status: "deploying" }));
    store.getSteps.mockResolvedValue([
      step("stop_source", "success"),
      step("provision", "success"),
      step("deploy", "pending"),
    ]);
    await migrationOrchestrator.advance("job-1");
    expect(store.updateStep).toHaveBeenCalledWith("job-1", "deploy", expect.objectContaining({ status: "failed" }));
    expect(provider.deleteResource).toHaveBeenCalledWith("dest-1");
    expect(provider.startResource).toHaveBeenCalledWith("app-n8n");
  });

  it("does NOT restart the source when stop_source has not succeeded", async () => {
    validate.mockResolvedValue({
      ok: false, checks: [{ key: "disk", label: "d", pass: false, detail: "x" }], volumes: [], exposure: "internal", defaults: {}, source: SNAPSHOT_WITH_VOL,
    });
    store.getJob.mockResolvedValue(jobRow());
    store.getSteps.mockResolvedValue([step("validate")]);
    await migrationOrchestrator.advance("job-1");
    expect(provider.startResource).not.toHaveBeenCalled();
  });

  it("skips a volume step when the snapshot has no volumes", async () => {
    store.getJob.mockResolvedValue(jobRow({ sourceResourceSnapshot: SNAPSHOT_NO_VOL }));
    store.getSteps.mockResolvedValue([step("archive_volumes")]);
    await migrationOrchestrator.advance("job-1");
    expect(vol.archive).not.toHaveBeenCalled();
    expect(store.updateStep).toHaveBeenCalledWith("job-1", "archive_volumes", expect.objectContaining({ status: "skipped" }));
  });

  it("runs a volume step when the snapshot has volumes", async () => {
    store.getJob.mockResolvedValue(jobRow());
    store.getSteps.mockResolvedValue([step("archive_volumes")]);
    await migrationOrchestrator.advance("job-1");
    expect(vol.archive).toHaveBeenCalledOnce();
    expect(store.updateStep).toHaveBeenCalledWith("job-1", "archive_volumes", expect.objectContaining({ status: "success" }));
  });

  it("provisions from the snapshot and records the destination artifact", async () => {
    store.getJob.mockResolvedValue(jobRow());
    store.getSteps.mockResolvedValue([step("provision")]);
    await migrationOrchestrator.advance("job-1");
    expect(provider.createResource).toHaveBeenCalledWith(
      expect.objectContaining({ name: "n8n", destinationHostId: "server-3", snapshot: SNAPSHOT_WITH_VOL }),
    );
    expect(store.addArtifact).toHaveBeenCalledWith("job-1", "destination_resource", "dest-1");
  });

  it("stores the validation url on the job", async () => {
    store.getJob.mockResolvedValue(jobRow());
    store.getSteps.mockResolvedValue([step("validation_url")]);
    await migrationOrchestrator.advance("job-1");
    expect(store.updateJob).toHaveBeenCalledWith("job-1", expect.objectContaining({ validationUrl: "https://abc.192.168.100.11.sslip.io" }));
  });

  it("halts at await_approval without running cutover", async () => {
    store.getJob.mockResolvedValue(jobRow());
    store.getSteps.mockResolvedValue([step("await_approval"), step("switch_endpoints")]);
    await migrationOrchestrator.advance("job-1");
    expect(store.updateJob).toHaveBeenCalledWith("job-1", expect.objectContaining({ status: "awaiting_approval" }));
    expect(provider.switchEndpoints).not.toHaveBeenCalled();
  });

  it("is a no-op when the job is awaiting approval", async () => {
    store.getJob.mockResolvedValue(jobRow({ status: "awaiting_approval" }));
    await migrationOrchestrator.advance("job-1");
    expect(store.getSteps).not.toHaveBeenCalled();
  });

  it("is a no-op when the job is terminal", async () => {
    store.getJob.mockResolvedValue(jobRow({ status: "completed" }));
    await migrationOrchestrator.advance("job-1");
    expect(store.getSteps).not.toHaveBeenCalled();
  });

  it("completes the job on the complete step", async () => {
    store.getJob.mockResolvedValue(jobRow({ status: "cutting_over" }));
    store.getSteps.mockResolvedValue([step("complete")]);
    await migrationOrchestrator.advance("job-1");
    expect(store.updateJob).toHaveBeenCalledWith("job-1", expect.objectContaining({ status: "completed" }));
  });

  it("bumps attemptNumber when resuming a step left running by a crash", async () => {
    store.getJob.mockResolvedValue(jobRow({ status: "provisioning" }));
    store.getSteps.mockResolvedValue([step("provision", "running", 1)]);
    await migrationOrchestrator.advance("job-1");
    expect(store.updateStep).toHaveBeenCalledWith(
      "job-1",
      "provision",
      expect.objectContaining({ status: "running", attemptNumber: 2 }),
    );
  });

  it("switch_endpoints calls provider with custom domains (sslip filtered out)", async () => {
    store.getJob.mockResolvedValue(jobRow({
      status: "cutting_over",
      sourceResourceId: "src-1",
      sourceResourceSnapshot: {
        volumes: [],
        domains: ["app.example.com", "abc.10.0.0.5.sslip.io"],
      },
    }));
    store.getSteps.mockResolvedValue([step("switch_endpoints")]);
    store.getArtifact.mockResolvedValue({ reference: "dest-1" });
    await migrationOrchestrator.advance("job-1");
    expect(provider.switchEndpoints).toHaveBeenCalledWith({
      sourceResourceId: "src-1",
      destinationResourceId: "dest-1",
      domains: ["app.example.com"],
    });
    expect(store.updateStep).toHaveBeenCalledWith(
      "job-1",
      "switch_endpoints",
      expect.objectContaining({ status: "success" }),
    );
  });

  it("switch_endpoints skips provider call when snapshot has only sslip domains", async () => {
    store.getJob.mockResolvedValue(jobRow({
      status: "cutting_over",
      sourceResourceSnapshot: {
        volumes: [],
        domains: ["abc.10.0.0.5.sslip.io"],
      },
    }));
    store.getSteps.mockResolvedValue([step("switch_endpoints")]);
    await migrationOrchestrator.advance("job-1");
    expect(provider.switchEndpoints).not.toHaveBeenCalled();
    expect(store.updateStep).toHaveBeenCalledWith(
      "job-1",
      "switch_endpoints",
      expect.objectContaining({ status: "success", detail: "Internal resource: no public domains to move." }),
    );
  });
});
