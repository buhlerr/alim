"use server";

import { revalidatePath } from "next/cache";

import { settingsService } from "@/services/settings";
import { COOLIFY_SETTING_KEYS, isCoolifyConfigured } from "@/lib/coolify-config";
import { coolifyService } from "@/services/coolify/service";
import { CoolifyError } from "@/services/coolify/types";
import type {
  CoolifyApplication,
  CoolifyConnectionResult,
  CoolifyEnvVar,
  CoolifyProject,
  CoolifyServer,
} from "@/services/coolify/types";
import {
  coolifyConfigSchema,
  createApplicationSchema,
  envVarSchema,
  updateApplicationSchema,
} from "@/lib/coolify-validation";
import { auditService } from "@/services/audit";
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from "@/lib/audit";

export interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  data?: T;
}

function toMessage(err: unknown): string {
  if (err instanceof CoolifyError) return err.message;
  return "Something went wrong talking to Coolify. Check the server logs.";
}

/** Persist the Coolify base URL + token (encrypted). */
export async function saveCoolifyConfigAction(
  input: unknown,
): Promise<ActionResult> {
  const parsed = coolifyConfigSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const token = parsed.data.apiToken?.trim() ?? "";
  // The token is required for first-time setup, but optional on update: a blank
  // field keeps the token already stored (we never echo it back to the client).
  if (!token && !(await settingsService.has(COOLIFY_SETTING_KEYS.apiToken))) {
    return {
      ok: false,
      error: "An API token is required.",
      fieldErrors: { apiToken: ["API token is required"] },
    };
  }
  try {
    await settingsService.set(COOLIFY_SETTING_KEYS.baseUrl, parsed.data.baseUrl);
    if (token) {
      await settingsService.set(COOLIFY_SETTING_KEYS.apiToken, token);
    }
    await auditService.record({
      action: AUDIT_ACTIONS.COOLIFY_CONFIG_SAVE,
      summary: "Saved Coolify API connection",
      targetType: AUDIT_TARGET_TYPES.SETTING,
      metadata: { baseUrl: parsed.data.baseUrl, tokenChanged: Boolean(token) },
    });
    revalidatePath("/settings");
    revalidatePath("/coolify");
    return { ok: true };
  } catch (err) {
    console.error("[coolify] save config failed:", err instanceof CoolifyError ? err.code : "unknown");
    return { ok: false, error: "Could not save Coolify settings. Is ENCRYPTION_KEY configured?" };
  }
}

export async function testCoolifyConnectionAction(): Promise<CoolifyConnectionResult> {
  if (!(await isCoolifyConfigured())) {
    return { ok: false, message: "Coolify is not configured yet." };
  }
  return coolifyService.testConnection();
}

export async function getCoolifyApplicationsAction(): Promise<ActionResult<CoolifyApplication[]>> {
  try {
    return { ok: true, data: await coolifyService.listApplications() };
  } catch (err) {
    return { ok: false, error: toMessage(err) };
  }
}

export async function getCoolifyApplicationAction(
  uuid: string,
): Promise<ActionResult<CoolifyApplication>> {
  try {
    return { ok: true, data: await coolifyService.getApplication(uuid) };
  } catch (err) {
    return { ok: false, error: toMessage(err) };
  }
}

export async function getCoolifyFormOptionsAction(): Promise<
  ActionResult<{ projects: CoolifyProject[]; servers: CoolifyServer[] }>
> {
  try {
    const [projects, servers] = await Promise.all([
      coolifyService.listProjects(),
      coolifyService.listServers(),
    ]);
    return { ok: true, data: { projects, servers } };
  } catch (err) {
    return { ok: false, error: toMessage(err) };
  }
}

export async function createCoolifyApplicationAction(
  input: unknown,
): Promise<ActionResult<{ uuid: string }>> {
  const parsed = createApplicationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  try {
    const { name, domains, ...rest } = parsed.data;
    const result = await coolifyService.createApplication({
      ...rest,
      name: name || undefined,
      domains: domains || undefined,
    });
    await auditService.record({
      action: AUDIT_ACTIONS.COOLIFY_APP_CREATE,
      summary: `Created Coolify application ${name || result.uuid}`,
      targetType: AUDIT_TARGET_TYPES.COOLIFY_APP,
      targetId: result.uuid,
      metadata: { name: name || null, gitRepository: rest.git_repository },
    });
    revalidatePath("/coolify");
    return { ok: true, data: result };
  } catch (err) {
    console.error("[coolify] create failed:", err instanceof CoolifyError ? err.code : "unknown");
    return { ok: false, error: toMessage(err) };
  }
}

export async function deployCoolifyApplicationAction(
  uuid: string,
): Promise<ActionResult<{ message?: string }>> {
  try {
    const res = await coolifyService.deploy(uuid);
    await auditService.record({
      action: AUDIT_ACTIONS.COOLIFY_APP_DEPLOY,
      summary: `Deployed Coolify application ${uuid}`,
      targetType: AUDIT_TARGET_TYPES.COOLIFY_APP,
      targetId: uuid,
    });
    revalidatePath(`/coolify/${uuid}`);
    return { ok: true, data: res };
  } catch (err) {
    return { ok: false, error: toMessage(err) };
  }
}

export async function getCoolifyEnvVarsAction(
  uuid: string,
): Promise<ActionResult<CoolifyEnvVar[]>> {
  try {
    return { ok: true, data: await coolifyService.listEnvVars(uuid) };
  } catch (err) {
    return { ok: false, error: toMessage(err) };
  }
}

export async function setCoolifyEnvVarAction(
  uuid: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = envVarSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  try {
    await coolifyService.setEnvVar(uuid, parsed.data.key, parsed.data.value);
    await auditService.record({
      action: AUDIT_ACTIONS.COOLIFY_ENV_UPDATE,
      summary: `Set Coolify env var ${parsed.data.key} on ${uuid}`,
      targetType: AUDIT_TARGET_TYPES.COOLIFY_APP,
      targetId: uuid,
      metadata: { key: parsed.data.key },
    });
    revalidatePath(`/coolify/${uuid}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toMessage(err) };
  }
}

export async function updateCoolifyApplicationAction(
  uuid: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = updateApplicationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  try {
    const { domains, build_command, start_command } = parsed.data;
    await coolifyService.updateApplication(uuid, {
      domains: domains || undefined,
      build_command: build_command || undefined,
      start_command: start_command || undefined,
    });
    await auditService.record({
      action: AUDIT_ACTIONS.COOLIFY_APP_CREATE,
      summary: `Updated Coolify application ${uuid}`,
      targetType: AUDIT_TARGET_TYPES.COOLIFY_APP,
      targetId: uuid,
    });
    revalidatePath(`/coolify/${uuid}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toMessage(err) };
  }
}
