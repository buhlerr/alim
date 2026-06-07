"use server";

import { revalidatePath } from "next/cache";
import {
  createDatabaseSchema,
  createEnvSetSchema,
  postgresConnectionSchema,
} from "@/lib/validation";
import { deriveDatabaseName, deriveUsername } from "@/lib/naming";
import { generatePassword } from "@/lib/password";
import {
  ENVIRONMENTS,
  POSTGRES_SETTING_KEYS,
  type Environment,
} from "@/lib/targets";
import { postgresProvisioner } from "@/services/provisioning/postgres";
import { ProvisioningError } from "@/services/provisioning/types";
import { registryService } from "@/services/registry";
import { settingsService } from "@/services/settings";

/** Client-safe shape returned after a successful single provision. */
export interface ProvisionActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  data?: {
    environment: Environment;
    databaseName: string;
    username: string;
    host: string;
    port: number;
    status: "created" | "already_existed";
    connectionString: string; // shown once on the success screen
  };
}

export interface EnvSetActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  results?: Array<{
    environment: Environment;
    ok: boolean;
    error?: string;
    databaseName?: string;
    username?: string;
    host?: string;
    status?: "created" | "already_existed";
    connectionString?: string;
  }>;
}

export interface TestConnectionResult {
  ok: boolean;
  message: string;
  serverVersion?: string;
}

function toMessage(err: unknown): string {
  if (err instanceof ProvisioningError) return err.message;
  // Generic fallback — never surface raw errors that might leak connection info.
  return "Something went wrong while provisioning. Check the server logs.";
}

/** Create a single database + user on one environment's server. */
export async function createDatabaseAction(
  input: unknown,
): Promise<ProvisionActionResult> {
  const parsed = createDatabaseSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const data = parsed.data;
  try {
    const result = await postgresProvisioner.provision({
      environment: data.environment as Environment,
      applicationName: data.applicationName,
      databaseName: data.databaseName,
      username: data.username,
      password: data.password,
    });

    await registryService.record({
      applicationName: data.applicationName,
      environment: result.environment,
      databaseName: result.databaseName,
      username: result.username,
      host: result.host,
      notes: data.notes || null,
    });

    revalidatePath("/registry");
    revalidatePath("/dashboard");

    return {
      ok: true,
      data: {
        environment: result.environment,
        databaseName: result.databaseName,
        username: result.username,
        host: result.host,
        port: result.port,
        status: result.status,
        connectionString: result.connectionString,
      },
    };
  } catch (err) {
    // Deliberately do not log `err` verbatim — it may reference credentials.
    console.error(
      `[provision] failed for ${data.environment}/${data.databaseName}:`,
      err instanceof ProvisioningError ? err.code : "unknown",
    );
    return { ok: false, error: toMessage(err) };
  }
}

/**
 * Create the full environment set for an application: production, staging, and
 * development databases + users on their respective servers. Reports per-
 * environment success so a partial failure is visible.
 */
export async function createEnvSetAction(
  input: unknown,
): Promise<EnvSetActionResult> {
  const parsed = createEnvSetSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const { applicationName, notes } = parsed.data;
  const results: NonNullable<EnvSetActionResult["results"]> = [];

  for (const environment of ENVIRONMENTS) {
    const databaseName = deriveDatabaseName(applicationName, environment);
    const username = deriveUsername(applicationName, environment);
    const password = generatePassword();
    try {
      const result = await postgresProvisioner.provision({
        environment,
        applicationName,
        databaseName,
        username,
        password,
      });
      await registryService.record({
        applicationName,
        environment,
        databaseName: result.databaseName,
        username: result.username,
        host: result.host,
        notes: notes || null,
      });
      results.push({
        environment,
        ok: true,
        databaseName: result.databaseName,
        username: result.username,
        host: result.host,
        status: result.status,
        connectionString: result.connectionString,
      });
    } catch (err) {
      console.error(
        `[provision:env-set] failed for ${environment}/${databaseName}:`,
        err instanceof ProvisioningError ? err.code : "unknown",
      );
      results.push({ environment, ok: false, error: toMessage(err) });
    }
  }

  revalidatePath("/registry");
  revalidatePath("/dashboard");

  const anyOk = results.some((r) => r.ok);
  return {
    ok: anyOk,
    error: anyOk ? undefined : "Provisioning failed on every environment.",
    results,
  };
}

/** Test the admin connection for one environment. */
export async function testConnectionAction(
  environment: Environment,
): Promise<TestConnectionResult> {
  if (!ENVIRONMENTS.includes(environment)) {
    return { ok: false, message: "Unknown environment." };
  }
  return postgresProvisioner.testConnection(environment);
}

export interface SaveTargetResult {
  ok: boolean;
  error?: string;
}

/**
 * Store an environment's admin connection string (encrypted) in the settings
 * store. This is the preferred source over the POSTGRES_*_URL env vars.
 */
export async function savePostgresTargetAction(
  environment: Environment,
  connectionString: unknown,
): Promise<SaveTargetResult> {
  if (!ENVIRONMENTS.includes(environment)) {
    return { ok: false, error: "Unknown environment." };
  }
  const parsed = postgresConnectionSchema.safeParse(connectionString);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid connection string.",
    };
  }
  try {
    await settingsService.set(POSTGRES_SETTING_KEYS[environment], parsed.data.trim());
    revalidatePath("/settings");
    revalidatePath("/dashboard");
    revalidatePath("/create");
    revalidatePath("/query");
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "Could not save the connection. Is ENCRYPTION_KEY configured?",
    };
  }
}

/**
 * Remove an environment's stored connection string. The target then falls back
 * to its POSTGRES_*_URL env var (if any), or becomes unconfigured.
 */
export async function clearPostgresTargetAction(
  environment: Environment,
): Promise<SaveTargetResult> {
  if (!ENVIRONMENTS.includes(environment)) {
    return { ok: false, error: "Unknown environment." };
  }
  try {
    await settingsService.delete(POSTGRES_SETTING_KEYS[environment]);
    revalidatePath("/settings");
    revalidatePath("/dashboard");
    revalidatePath("/create");
    revalidatePath("/query");
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not clear the connection." };
  }
}
