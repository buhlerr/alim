"use server";

import { revalidatePath } from "next/cache";

import { createSecretSchema, updateSecretSchema } from "@/lib/secrets-validation";
import { secretsService } from "@/services/secrets";
import { auditService } from "@/services/audit";
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from "@/lib/audit";

export interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  data?: T;
}

/** Prisma unique-constraint violation. */
function isDuplicateNameError(err: unknown): boolean {
  return (err as { code?: string }).code === "P2002";
}

export async function createSecretAction(input: unknown): Promise<ActionResult> {
  const parsed = createSecretSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  try {
    await secretsService.create({
      name: parsed.data.name,
      value: parsed.data.value,
      category: parsed.data.category,
      description: parsed.data.description || null,
    });
    await auditService.record({
      action: AUDIT_ACTIONS.SECRET_CREATE,
      summary: `Created secret "${parsed.data.name}"`,
      targetType: AUDIT_TARGET_TYPES.SECRET,
      metadata: { category: parsed.data.category },
    });
    revalidatePath("/secrets");
    return { ok: true };
  } catch (err) {
    if (isDuplicateNameError(err)) {
      return {
        ok: false,
        error: "A secret with that name already exists.",
        fieldErrors: { name: ["A secret with that name already exists."] },
      };
    }
    return { ok: false, error: "Could not create the secret." };
  }
}

export async function updateSecretAction(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = updateSecretSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  try {
    await secretsService.update(id, {
      name: parsed.data.name,
      value: parsed.data.value,
      category: parsed.data.category,
      description: parsed.data.description || null,
    });
    await auditService.record({
      action: AUDIT_ACTIONS.SECRET_UPDATE,
      summary: `Updated secret "${parsed.data.name}"`,
      targetType: AUDIT_TARGET_TYPES.SECRET,
      targetId: id,
      metadata: { valueChanged: Boolean(parsed.data.value) },
    });
    revalidatePath("/secrets");
    return { ok: true };
  } catch (err) {
    if (isDuplicateNameError(err)) {
      return {
        ok: false,
        error: "A secret with that name already exists.",
        fieldErrors: { name: ["A secret with that name already exists."] },
      };
    }
    return { ok: false, error: "Could not update the secret." };
  }
}

export async function deleteSecretAction(id: string): Promise<ActionResult> {
  try {
    await secretsService.remove(id);
    await auditService.record({
      action: AUDIT_ACTIONS.SECRET_DELETE,
      summary: `Deleted secret ${id}`,
      targetType: AUDIT_TARGET_TYPES.SECRET,
      targetId: id,
    });
    revalidatePath("/secrets");
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not delete the secret." };
  }
}

export async function revealSecretAction(
  id: string,
): Promise<ActionResult<{ value: string }>> {
  try {
    const value = await secretsService.reveal(id);
    if (value === null) {
      return {
        ok: false,
        error:
          "Could not reveal this secret. It may be missing or encrypted under a different key.",
      };
    }
    await auditService.record({
      action: AUDIT_ACTIONS.SECRET_REVEAL,
      summary: `Revealed secret ${id}`,
      targetType: AUDIT_TARGET_TYPES.SECRET,
      targetId: id,
    });
    revalidatePath("/secrets");
    return { ok: true, data: { value } };
  } catch {
    return { ok: false, error: "Could not reveal the secret." };
  }
}
