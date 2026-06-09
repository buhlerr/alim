import "server-only";
import { isTerminalStatus } from "@/lib/migration";
import { migrationStore, type MigrationJobRow } from "./store";
import { platformProvider } from "./provider";
import { volumeTransfer } from "./volume-transfer";
import { validationService } from "./validation";
import { stepJobStatus } from "./planner";
import { MigrationError, type ResourceInfo } from "./types";

interface StepOutcome {
  skipped?: boolean;
  detail?: string;
}

function snapshotOf(job: MigrationJobRow): ResourceInfo {
  return job.sourceResourceSnapshot as unknown as ResourceInfo;
}

async function handleValidate(job: MigrationJobRow): Promise<StepOutcome> {
  const report = await validationService.validate({
    sourceResourceId: job.sourceResourceId,
    destinationHost: job.destinationHost,
    destinationResourceName: job.destinationResourceName,
  });
  for (const check of report.checks) {
    await migrationStore.appendLog(
      job.id,
      "validate",
      check.pass ? "info" : "error",
      `${check.label}: ${check.detail}`,
    );
  }
  if (!report.ok) {
    const failed = report.checks.find((c) => !c.pass);
    throw new MigrationError(failed?.detail ?? "Validation failed.", "VALIDATION_FAILED");
  }
  await migrationStore.updateJob(job.id, {
    sourceResourceSnapshot: report.source as unknown as object,
    exposure: report.exposure,
  });
  for (const v of report.volumes) {
    await migrationStore.addArtifact(job.id, "volume", v.name, { sizeMb: v.estimatedSizeMb });
  }
  return { detail: "All validation checks passed." };
}

async function handleStopSource(job: MigrationJobRow): Promise<StepOutcome> {
  await platformProvider.stopResource(job.sourceResourceId);
  await migrationStore.addArtifact(job.id, "source_stopped", job.sourceResourceId);
  return { detail: "Source resource stopped; no further writes permitted." };
}

async function handleVolumeStep(
  job: MigrationJobRow,
  op: "archive" | "transfer" | "restore",
): Promise<StepOutcome> {
  const volumes = snapshotOf(job).volumes ?? [];
  if (volumes.length === 0) {
    return { skipped: true, detail: "No volumes detected — skipped." };
  }
  for (const v of volumes) {
    let ref: string;
    if (op === "archive") ref = await volumeTransfer.archive(v, job.sourceHost);
    else if (op === "transfer") ref = await volumeTransfer.transfer(v, job.sourceHost, job.destinationHost);
    else ref = await volumeTransfer.restore(v, job.destinationHost);
    await migrationStore.addArtifact(job.id, `volume_${op}`, ref, { volume: v.name });
  }
  return { detail: `${volumes.length} volume(s) ${op}d.` };
}

async function handleProvision(job: MigrationJobRow): Promise<StepOutcome> {
  const { resourceId } = await platformProvider.createResource({
    name: job.destinationResourceName,
    destinationHostId: job.destinationHost,
    snapshot: snapshotOf(job),
  });
  await migrationStore.addArtifact(job.id, "destination_resource", resourceId);
  return { detail: `Provisioned destination resource ${resourceId}.` };
}

async function destinationId(job: MigrationJobRow): Promise<string> {
  const art = await migrationStore.getArtifact(job.id, "destination_resource");
  if (!art) throw new MigrationError("Destination resource not found.", "NO_DESTINATION");
  return art.reference;
}

async function handleDeploy(job: MigrationJobRow): Promise<StepOutcome> {
  await platformProvider.deployResource(await destinationId(job));
  return { detail: "Destination resource deployed." };
}

async function handleValidationUrl(job: MigrationJobRow): Promise<StepOutcome> {
  const hosts = await platformProvider.listHosts();
  const ip = hosts.find((h) => h.id === job.destinationHost)?.ip ?? "127.0.0.1";
  const url = await platformProvider.generateValidationUrl(await destinationId(job), ip);
  await migrationStore.updateJob(job.id, { validationUrl: url });
  await migrationStore.addArtifact(job.id, "validation_url", url);
  return { detail: url };
}

async function handleSwitchEndpoints(job: MigrationJobRow): Promise<StepOutcome> {
  await platformProvider.switchEndpoints({
    id: job.id,
    sourceResourceId: job.sourceResourceId,
    destinationResourceName: job.destinationResourceName,
    destinationHost: job.destinationHost,
    npmEnabled: job.npmEnabled,
    cloudflareEnabled: job.cloudflareEnabled,
    exposure: job.exposure,
  });
  return { detail: "Public endpoints switched to the destination." };
}

async function handleDeleteSource(job: MigrationJobRow): Promise<StepOutcome> {
  await platformProvider.deleteResource(job.sourceResourceId);
  return { detail: "Source resource deleted." };
}

async function runHandler(job: MigrationJobRow, key: string): Promise<StepOutcome> {
  switch (key) {
    case "validate":
      return handleValidate(job);
    case "stop_source":
      return handleStopSource(job);
    case "archive_volumes":
      return handleVolumeStep(job, "archive");
    case "transfer_volumes":
      return handleVolumeStep(job, "transfer");
    case "restore_volumes":
      return handleVolumeStep(job, "restore");
    case "provision":
      return handleProvision(job);
    case "deploy":
      return handleDeploy(job);
    case "validation_url":
      return handleValidationUrl(job);
    case "switch_endpoints":
      return handleSwitchEndpoints(job);
    case "delete_source":
      return handleDeleteSource(job);
    case "complete":
      return { detail: "Migration complete." };
    default:
      throw new MigrationError(`Unknown step "${key}".`, "UNKNOWN_STEP");
  }
}

export const migrationOrchestrator = {
  /** Advance exactly one step. Idempotent and resumable from DB state. */
  async advance(jobId: string): Promise<MigrationJobRow> {
    const job = await migrationStore.getJob(jobId);
    if (!job) throw new MigrationError("Migration job not found.", "NOT_FOUND");
    if (isTerminalStatus(job.status) || job.status === "awaiting_approval") return job;

    const steps = await migrationStore.getSteps(jobId);
    const next = steps.find((s) => s.status === "pending" || s.status === "running");
    if (!next) return job;

    const attemptNumber = next.status === "running" ? next.attemptNumber + 1 : next.attemptNumber;
    await migrationStore.updateStep(jobId, next.key, {
      status: "running",
      attemptNumber,
      startedAt: new Date(),
    });
    await migrationStore.updateJob(jobId, {
      status: stepJobStatus(next.key),
      currentStepKey: next.key,
    });
    await migrationStore.appendLog(jobId, next.key, "info", `Starting: ${next.label}`);

    if (next.key === "await_approval") {
      await migrationStore.appendLog(jobId, next.key, "info", "Awaiting user approval before cutover.");
      return (await migrationStore.getJob(jobId)) as MigrationJobRow;
    }

    try {
      const outcome = await runHandler(job, next.key);
      await migrationStore.updateStep(jobId, next.key, {
        status: outcome.skipped ? "skipped" : "success",
        detail: outcome.detail ?? null,
        finishedAt: new Date(),
      });
      await migrationStore.appendLog(
        jobId,
        next.key,
        "info",
        outcome.detail ?? `${outcome.skipped ? "Skipped" : "Done"}: ${next.label}`,
      );
      if (next.key === "complete") {
        await migrationStore.updateJob(jobId, {
          status: "completed",
          completedAt: new Date(),
          errorMessage: null,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Step failed unexpectedly.";
      await migrationStore.updateStep(jobId, next.key, {
        status: "failed",
        detail: message,
        finishedAt: new Date(),
      });
      await migrationStore.updateJob(jobId, { status: "failed", errorMessage: message });
      await migrationStore.appendLog(jobId, next.key, "error", message);
    }

    return (await migrationStore.getJob(jobId)) as MigrationJobRow;
  },
};
