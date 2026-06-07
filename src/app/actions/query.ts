"use server";

import { revalidatePath } from "next/cache";
import { type Environment } from "@/lib/targets";
import { environmentsService } from "@/services/environments";
import { classifyQuery } from "@/lib/sql-classify";
import { evaluatePolicy } from "@/lib/query-policy";
import { assertSafeIdentifier } from "@/lib/validation";
import { postgresQueryEngine } from "@/services/query/postgres";
import { adminService } from "@/services/query/admin";
import { historyService } from "@/services/query/history";
import { savedQueryService } from "@/services/query/saved";
import { QueryError, type QueryResult, type ServerOverview } from "@/services/query/types";
import type { AdminPerformance, AdminStorage } from "@/services/query/admin";

async function requireEnv(value: unknown): Promise<{ key: Environment; readOnly: boolean; requireWriteConfirm: boolean }> {
  if (typeof value !== "string") throw new QueryError("Unknown environment.", "BAD_ENV");
  const env = await environmentsService.get(value);
  if (!env) throw new QueryError("Unknown environment.", "BAD_ENV");
  return { key: env.key, readOnly: env.readOnly, requireWriteConfirm: env.requireWriteConfirm };
}

function msg(err: unknown): string {
  if (err instanceof QueryError) return err.message;
  return "Something went wrong talking to the server.";
}

// ── Database dropdown ─────────────────────────────────────────────────────────
export interface ListDatabasesResult {
  ok: boolean;
  databases?: string[];
  error?: string;
}

export async function listDatabasesAction(
  environment: unknown,
): Promise<ListDatabasesResult> {
  try {
    const env = (await requireEnv(environment)).key;
    return { ok: true, databases: await postgresQueryEngine.listDatabases(env) };
  } catch (err) {
    return { ok: false, error: msg(err) };
  }
}

// ── Execute ───────────────────────────────────────────────────────────────────
export interface ExecuteInput {
  environment: string;
  database: string;
  query: string;
  confirmed?: boolean;
}

export interface ExecuteResult {
  ok: boolean;
  /** Set when a write needs typed CONFIRM before it will run. */
  needsConfirmation?: boolean;
  category?: "read" | "write";
  dangerousKeywords?: string[];
  result?: QueryResult;
  error?: string;
}

export async function executeQueryAction(
  input: ExecuteInput,
): Promise<ExecuteResult> {
  let env: { key: Environment; readOnly: boolean; requireWriteConfirm: boolean };
  try {
    env = await requireEnv(input.environment);
    assertSafeIdentifier(input.database);
  } catch (err) {
    return { ok: false, error: msg(err) };
  }

  const query = (input.query ?? "").trim();
  if (!query) return { ok: false, error: "Query is empty." };

  const classification = classifyQuery(query);
  const decision = evaluatePolicy({
    category: classification.category,
    readOnly: env.readOnly,
    requireWriteConfirm: env.requireWriteConfirm,
  });

  if (!decision.allowed) {
    return { ok: false, error: decision.reason ?? "This query is not allowed." };
  }

  // Gate writes behind explicit confirmation.
  if (decision.requiresConfirmation && !input.confirmed) {
    return {
      ok: false,
      needsConfirmation: true,
      category: classification.category,
      dangerousKeywords: classification.dangerousKeywords,
    };
  }

  const queryType = classification.dangerousKeywords[0] ?? classification.statements[0] ?? "READ";
  try {
    const result = await postgresQueryEngine.execute(env.key, input.database, query);
    await historyService.record({
      environment: env.key,
      databaseName: input.database,
      query,
      queryType,
      executionTimeMs: result.executionTimeMs,
      success: true,
    });
    revalidatePath("/query");
    return { ok: true, category: classification.category, result };
  } catch (err) {
    await historyService
      .record({
        environment: env.key,
        databaseName: input.database,
        query,
        queryType,
        success: false,
        errorMessage: msg(err),
      })
      .catch(() => {});
    return { ok: false, error: msg(err), category: classification.category };
  }
}

// ── Explain ─────────────────────────────────────────────────────────────────
export async function explainQueryAction(input: {
  environment: string;
  database: string;
  query: string;
}): Promise<ExecuteResult> {
  try {
    const env = (await requireEnv(input.environment)).key;
    assertSafeIdentifier(input.database);
    const query = (input.query ?? "").trim();
    if (!query) return { ok: false, error: "Query is empty." };
    const result = await postgresQueryEngine.explain(env, input.database, query);
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: msg(err) };
  }
}

// ── Admin dashboard ───────────────────────────────────────────────────────────
export async function adminOverviewAction(
  environment: unknown,
): Promise<{ ok: boolean; overview?: ServerOverview; error?: string }> {
  try {
    return { ok: true, overview: await adminService.overview((await requireEnv(environment)).key) };
  } catch (err) {
    return { ok: false, error: msg(err) };
  }
}

export async function adminStorageAction(
  environment: unknown,
  database: string,
): Promise<{ ok: boolean; storage?: AdminStorage; error?: string }> {
  try {
    const env = (await requireEnv(environment)).key;
    if (database) assertSafeIdentifier(database);
    return { ok: true, storage: await adminService.storage(env, database) };
  } catch (err) {
    return { ok: false, error: msg(err) };
  }
}

export async function adminPerformanceAction(
  environment: unknown,
): Promise<{ ok: boolean; performance?: AdminPerformance; error?: string }> {
  try {
    return { ok: true, performance: await adminService.performance((await requireEnv(environment)).key) };
  } catch (err) {
    return { ok: false, error: msg(err) };
  }
}

// ── History ───────────────────────────────────────────────────────────────────
export interface HistoryDTO {
  id: string;
  environment: Environment;
  databaseName: string;
  query: string;
  queryType: string;
  executionTimeMs: number | null;
  success: boolean;
  errorMessage: string | null;
  executedAt: string;
}

export async function recentHistoryAction(limit = 50): Promise<HistoryDTO[]> {
  const rows = await historyService.recent(limit);
  return rows.map((r) => ({
    id: r.id,
    environment: r.environment as Environment,
    databaseName: r.databaseName,
    query: r.query,
    queryType: r.queryType,
    executionTimeMs: r.executionTimeMs,
    success: r.success,
    errorMessage: r.errorMessage,
    executedAt: r.executedAt.toISOString(),
  }));
}

// ── Saved queries ─────────────────────────────────────────────────────────────
export interface SavedQueryDTO {
  id: string;
  name: string;
  description: string | null;
  query: string;
}

export async function listSavedQueriesAction(): Promise<SavedQueryDTO[]> {
  const rows = await savedQueryService.list();
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    query: r.query,
  }));
}

export async function saveQueryAction(input: {
  name: string;
  description?: string;
  query: string;
}): Promise<{ ok: boolean; error?: string }> {
  const name = input.name?.trim();
  const query = input.query?.trim();
  if (!name) return { ok: false, error: "A name is required." };
  if (!query) return { ok: false, error: "The query is empty." };
  await savedQueryService.create({ name, description: input.description, query });
  revalidatePath("/query");
  return { ok: true };
}

export async function deleteSavedQueryAction(
  id: string,
): Promise<{ ok: boolean }> {
  await savedQueryService.remove(id);
  revalidatePath("/query");
  return { ok: true };
}
