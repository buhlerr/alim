"use server";

import { revalidatePath } from "next/cache";

import { environmentInputSchema } from "@/lib/validation";
import { environmentsService } from "@/services/environments";
import { auditService } from "@/services/audit";
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from "@/lib/audit";

export interface EnvActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

function revalidateAll() {
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/create");
  revalidatePath("/query");
  revalidatePath("/registry");
}

export async function createEnvironmentAction(input: unknown): Promise<EnvActionResult> {
  const parsed = environmentInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  try {
    await environmentsService.create({
      name: parsed.data.name,
      description: parsed.data.description || null,
      color: parsed.data.color,
      abbreviation: parsed.data.abbreviation ? parsed.data.abbreviation : undefined,
      readOnly: parsed.data.readOnly,
      requireWriteConfirm: parsed.data.requireWriteConfirm,
    });
    await auditService.record({
      action: AUDIT_ACTIONS.ENVIRONMENT_CREATE,
      summary: `Created environment "${parsed.data.name}"`,
      targetType: AUDIT_TARGET_TYPES.ENVIRONMENT,
    });
    revalidateAll();
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not create the environment." };
  }
}

export async function updateEnvironmentAction(
  key: string,
  input: unknown,
): Promise<EnvActionResult> {
  const parsed = environmentInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  try {
    await environmentsService.update(key, {
      name: parsed.data.name,
      description: parsed.data.description || null,
      color: parsed.data.color,
      abbreviation: parsed.data.abbreviation ?? "",
      readOnly: parsed.data.readOnly,
      requireWriteConfirm: parsed.data.requireWriteConfirm,
    });
    await auditService.record({
      action: AUDIT_ACTIONS.ENVIRONMENT_UPDATE,
      summary: `Updated environment "${parsed.data.name}"`,
      targetType: AUDIT_TARGET_TYPES.ENVIRONMENT,
      targetId: key,
      environment: key,
    });
    revalidateAll();
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not update the environment." };
  }
}

export async function deleteEnvironmentAction(key: string): Promise<EnvActionResult> {
  try {
    const res = await environmentsService.remove(key);
    if (res.ok) {
      await auditService.record({
        action: AUDIT_ACTIONS.ENVIRONMENT_DELETE,
        summary: `Deleted environment ${key}`,
        targetType: AUDIT_TARGET_TYPES.ENVIRONMENT,
        targetId: key,
        environment: key,
      });
      revalidateAll();
    }
    return res;
  } catch {
    return { ok: false, error: "Could not delete the environment." };
  }
}

export async function reorderEnvironmentsAction(keys: string[]): Promise<EnvActionResult> {
  try {
    await environmentsService.reorder(keys);
    await auditService.record({
      action: AUDIT_ACTIONS.ENVIRONMENT_REORDER,
      summary: `Reordered ${keys.length} environments`,
      targetType: AUDIT_TARGET_TYPES.ENVIRONMENT,
      metadata: { order: keys },
    });
    revalidateAll();
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not reorder environments." };
  }
}
