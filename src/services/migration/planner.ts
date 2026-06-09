import type { MigrationStatus, MigrationType } from "@/lib/migration";

export interface StepDef {
  key: string;
  label: string;
  order: number;
}

const MIGRATE_STEPS: Array<Omit<StepDef, "order">> = [
  { key: "validate", label: "Validate Migration" },
  { key: "stop_source", label: "Stop Source Resource" },
  { key: "archive_volumes", label: "Archive Volumes" },
  { key: "transfer_volumes", label: "Transfer Volumes" },
  { key: "restore_volumes", label: "Restore Volumes" },
  { key: "provision", label: "Provision Destination Resource" },
  { key: "deploy", label: "Deploy Destination Resource" },
  { key: "validation_url", label: "Generate Temporary Validation URL" },
  { key: "await_approval", label: "Await User Approval" },
  { key: "switch_endpoints", label: "Switch Public Endpoints" },
  { key: "delete_source", label: "Delete Source Resource" },
  { key: "complete", label: "Complete Migration" },
];

const CLONE_STEPS: Array<Omit<StepDef, "order">> = [
  { key: "validate", label: "Validate Migration" },
  { key: "provision", label: "Provision Destination Resource" },
  { key: "deploy", label: "Deploy Destination Resource" },
  { key: "validation_url", label: "Generate Temporary Validation URL" },
  { key: "complete", label: "Complete Clone" },
];

/** The three steps that auto-skip at runtime when no volumes are detected. */
export const VOLUME_STEP_KEYS = [
  "archive_volumes",
  "transfer_volumes",
  "restore_volumes",
] as const;

/**
 * Pure: the plan depends ONLY on the migration type; never on volumes,
 * exposure, or flags. The shape is always identical for a given type.
 */
export function buildPlan(type: MigrationType): StepDef[] {
  const steps = type === "migrate" ? MIGRATE_STEPS : CLONE_STEPS;
  return steps.map((s, order) => ({ ...s, order }));
}

const STATUS_BY_STEP: Record<string, MigrationStatus> = {
  validate: "validating",
  stop_source: "transferring",
  archive_volumes: "transferring",
  transfer_volumes: "transferring",
  restore_volumes: "transferring",
  provision: "provisioning",
  deploy: "deploying",
  validation_url: "deploying",
  await_approval: "awaiting_approval",
  switch_endpoints: "cutting_over",
  delete_source: "cutting_over",
  complete: "completed",
};

export function stepJobStatus(key: string): MigrationStatus {
  return STATUS_BY_STEP[key] ?? "provisioning";
}
