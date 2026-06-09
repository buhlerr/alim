"use server";

import { revalidatePath } from "next/cache";

import { createMigrationSchema } from "@/lib/migration-validation";
import { migrationStore } from "@/services/migration/store";
import type { MigrationJobWithRelations } from "@/services/migration/store";
import { migrationOrchestrator } from "@/services/migration/orchestrator";
import { approvalService } from "@/services/migration/approval";
import { validationService, type ValidationReport } from "@/services/migration/validation";
import { platformProvider } from "@/services/migration/provider";
import { buildPlan, type StepDef } from "@/services/migration/planner";
import { defaultFlags, isTerminalStatus, type MigrationType } from "@/lib/migration";
import type { HostCapacity, HostSummary, ResourceSummary } from "@/services/migration/types";
import { auditService } from "@/services/audit";
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from "@/lib/audit";

export interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  data?: T;
}

export interface MigrationHostInfo extends HostSummary {
  capacity: HostCapacity;
}

export interface MigrationOptions {
  resources: ResourceSummary[];
  hosts: MigrationHostInfo[];
}

/** Wizard data: candidate resources + destination hosts with capacities. */
export async function getMigrationOptionsAction(): Promise<MigrationOptions> {
  const [resources, hosts] = await Promise.all([
    platformProvider.listResources(),
    platformProvider.listHosts(),
  ]);
  const hostInfos = await Promise.all(
    hosts.map(async (h) => ({ ...h, capacity: await platformProvider.getHostCapacity(h.id) })),
  );
  return { resources, hosts: hostInfos };
}

export interface MigrationPreview {
  report: ValidationReport;
  plan: StepDef[];
}

/** Step 4/5: run validation + volume detection + exposure + plan preview. */
export async function validateMigrationAction(input: {
  migrationType: MigrationType;
  sourceResourceId: string;
  destinationHost: string;
  destinationResourceName: string;
}): Promise<ActionResult<MigrationPreview>> {
  const parsed = createMigrationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const report = await validationService.validate({
    sourceResourceId: parsed.data.sourceResourceId,
    destinationHost: parsed.data.destinationHost,
    destinationResourceName: parsed.data.destinationResourceName,
  });
  return { ok: true, data: { report, plan: buildPlan(parsed.data.migrationType) } };
}

/** Step 6: persist the job (+ seeded steps + frozen snapshot) and return its id. */
export async function createMigrationAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createMigrationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const data = parsed.data;

  const report = await validationService.validate({
    sourceResourceId: data.sourceResourceId,
    destinationHost: data.destinationHost,
    destinationResourceName: data.destinationResourceName,
  });
  if (!report.ok) {
    const failed = report.checks.find((c) => !c.pass);
    return { ok: false, error: failed?.detail ?? "Validation failed." };
  }

  const hosts = await platformProvider.listHosts();
  const destHost = hosts.find((h) => h.id === data.destinationHost);
  const fallback = defaultFlags(report.exposure);

  const job = await migrationStore.createJob({
    migrationType: data.migrationType,
    sourceResourceId: data.sourceResourceId,
    sourceResourceName: report.source.name,
    destinationResourceName: data.destinationResourceName,
    sourceHost: report.source.hostId,
    sourceHostName: report.source.hostName,
    destinationHost: data.destinationHost,
    destinationHostName: destHost?.name ?? data.destinationHost,
    exposure: report.exposure,
    npmEnabled: data.npmEnabled ?? fallback.npmEnabled,
    cloudflareEnabled: data.cloudflareEnabled ?? fallback.cloudflareEnabled,
    sourceResourceSnapshot: report.source,
  });

  await auditService.record({
    action: AUDIT_ACTIONS.MIGRATION_CREATE,
    targetType: AUDIT_TARGET_TYPES.MIGRATION,
    targetId: job.id,
    summary: `Created ${data.migrationType} of ${report.source.name} to ${destHost?.name ?? data.destinationHost}`,
  });

  revalidatePath("/migrations");
  return { ok: true, data: { id: job.id } };
}

/** Step 6: advance one step; returns the refreshed job for the poll loop. */
export async function advanceMigrationAction(
  jobId: string,
): Promise<ActionResult<MigrationJobWithRelations>> {
  await migrationOrchestrator.advance(jobId);
  const job = await migrationStore.getJobWithRelations(jobId);
  if (!job) return { ok: false, error: "Migration job not found." };
  if (job.status === "completed") {
    await auditService.record({
      action: AUDIT_ACTIONS.MIGRATION_COMPLETE,
      targetType: AUDIT_TARGET_TYPES.MIGRATION,
      targetId: job.id,
      summary: `Completed ${job.migrationType} of ${job.sourceResourceName}`,
    });
  }
  revalidatePath(`/migrations/${jobId}`);
  return { ok: true, data: job };
}

/** Poll source for the detail page. */
export async function getMigrationJobAction(
  jobId: string,
): Promise<ActionResult<MigrationJobWithRelations>> {
  const job = await migrationStore.getJobWithRelations(jobId);
  if (!job) return { ok: false, error: "Migration job not found." };
  return { ok: true, data: job };
}

export async function approveMigrationAction(
  jobId: string,
): Promise<ActionResult<MigrationJobWithRelations>> {
  try {
    await approvalService.approve(jobId);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Approval failed." };
  }
  await auditService.record({
    action: AUDIT_ACTIONS.MIGRATION_APPROVE,
    targetType: AUDIT_TARGET_TYPES.MIGRATION,
    targetId: jobId,
    summary: "Approved migration cutover",
  });
  revalidatePath(`/migrations/${jobId}`);
  const job = await migrationStore.getJobWithRelations(jobId);
  return { ok: true, data: job! };
}

export async function rollbackMigrationAction(
  jobId: string,
): Promise<ActionResult<MigrationJobWithRelations>> {
  try {
    await approvalService.rollback(jobId);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Rollback failed." };
  }
  await auditService.record({
    action: AUDIT_ACTIONS.MIGRATION_ROLLBACK,
    targetType: AUDIT_TARGET_TYPES.MIGRATION,
    targetId: jobId,
    summary: "Rolled back migration",
  });
  revalidatePath(`/migrations/${jobId}`);
  const job = await migrationStore.getJobWithRelations(jobId);
  return { ok: true, data: job! };
}

/** Reset the failed step so the orchestrator advance loop can resume. */
export async function retryMigrationAction(
  jobId: string,
): Promise<ActionResult<MigrationJobWithRelations>> {
  const job = await migrationStore.getJob(jobId);
  if (!job) return { ok: false, error: "Migration job not found." };
  if (job.status !== "failed") {
    return { ok: false, error: "Only a failed migration can be retried." };
  }
  const reset = await migrationStore.resetFailedStep(jobId);
  if (!reset) return { ok: false, error: "No failed step to retry." };
  await auditService.record({
    action: AUDIT_ACTIONS.MIGRATION_RETRY,
    targetType: AUDIT_TARGET_TYPES.MIGRATION,
    targetId: jobId,
    summary: `Retried migration for ${job.sourceResourceName}`,
  });
  revalidatePath(`/migrations/${jobId}`);
  const refreshed = await migrationStore.getJobWithRelations(jobId);
  return { ok: true, data: refreshed! };
}

/** Delete a single terminal migration job (completed/failed/rolled_back). */
export async function deleteMigrationAction(jobId: string): Promise<ActionResult> {
  const job = await migrationStore.getJob(jobId);
  if (!job) return { ok: false, error: "Migration job not found." };
  if (!isTerminalStatus(job.status)) {
    return { ok: false, error: "Only finished migrations can be deleted." };
  }
  await migrationStore.deleteJob(jobId);
  await auditService.record({
    action: AUDIT_ACTIONS.MIGRATION_DELETE,
    targetType: AUDIT_TARGET_TYPES.MIGRATION,
    targetId: jobId,
    summary: `Deleted ${job.migrationType} of ${job.sourceResourceName}`,
  });
  revalidatePath("/migrations");
  return { ok: true };
}

/** Remove finished migrations (completed/failed/rolled_back) from the list. */
export async function clearMigrationsAction(): Promise<ActionResult<{ deleted: number }>> {
  const deleted = await migrationStore.deleteTerminalJobs();
  await auditService.record({
    action: AUDIT_ACTIONS.MIGRATION_CLEAR,
    targetType: AUDIT_TARGET_TYPES.MIGRATION,
    summary: `Cleared ${deleted} finished migration${deleted === 1 ? "" : "s"}`,
  });
  revalidatePath("/migrations");
  return { ok: true, data: { deleted } };
}
