import "server-only";
import { migrationStore, type MigrationJobRow } from "./store";
import { platformProvider } from "./provider";
import { MigrationError } from "./types";

export const approvalService = {
  /** Authorize production cutover. Valid only from awaiting_approval. */
  async approve(jobId: string): Promise<MigrationJobRow> {
    const job = await migrationStore.getJob(jobId);
    if (!job) throw new MigrationError("Migration job not found.", "NOT_FOUND");
    if (job.status !== "awaiting_approval") {
      throw new MigrationError("Migration is not awaiting approval.", "INVALID_STATE");
    }
    await migrationStore.updateStep(jobId, "await_approval", {
      status: "success",
      finishedAt: new Date(),
    });
    await migrationStore.updateJob(jobId, { status: "cutting_over", approvedAt: new Date() });
    await migrationStore.appendLog(jobId, "await_approval", "info", "Cutover approved by user.");
    return (await migrationStore.getJob(jobId)) as MigrationJobRow;
  },

  /**
   * Compensating rollback. Valid only from awaiting_approval; once cutover has
   * begun, reversal requires a new opposite-direction migration.
   */
  async rollback(jobId: string): Promise<MigrationJobRow> {
    const job = await migrationStore.getJob(jobId);
    if (!job) throw new MigrationError("Migration job not found.", "NOT_FOUND");
    if (job.status !== "awaiting_approval") {
      throw new MigrationError(
        "Rollback is only available while awaiting approval.",
        "INVALID_STATE",
      );
    }
    await migrationStore.appendLog(jobId, null, "warn", "Rolling back migration.");

    const dest = await migrationStore.getArtifact(jobId, "destination_resource");
    if (dest) {
      await platformProvider.deleteResource(dest.reference);
      await migrationStore.appendLog(jobId, null, "info", `Deleted destination resource ${dest.reference}.`);
    }

    await platformProvider.startResource(job.sourceResourceId);
    await migrationStore.appendLog(jobId, null, "info", "Restarted source resource.");

    const steps = await migrationStore.getSteps(jobId);
    for (const s of steps) {
      if (s.status === "pending" || s.status === "running") {
        await migrationStore.updateStep(jobId, s.key, { status: "skipped", finishedAt: new Date() });
      }
    }

    await migrationStore.updateJob(jobId, { status: "rolled_back", completedAt: new Date() });
    return (await migrationStore.getJob(jobId)) as MigrationJobRow;
  },
};
