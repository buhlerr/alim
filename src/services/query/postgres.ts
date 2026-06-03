import "server-only";
import { Client, type QueryResult as PgResult } from "pg";
import { getAdminUrl, type Environment } from "@/lib/targets";
import { assertSafeIdentifier } from "@/lib/validation";
import {
  QueryError,
  type QueryEngine,
  type QueryResult,
  type ServerOverview,
} from "./types";

// Cap how long any console statement may run so a runaway query can't pin a
// server connection indefinitely.
const STATEMENT_TIMEOUT_MS = 60_000;
const CONNECT_TIMEOUT_MS = 10_000;

/** Connection errors get a friendly, credential-free message. SQL errors keep
 *  their PostgreSQL message (syntax/undefined-table/etc.) which is what a
 *  console user needs — those never contain the connection string. */
function toQueryError(err: unknown): QueryError {
  const e = err as { code?: string; message?: string };
  switch (e?.code) {
    case "ECONNREFUSED":
      return new QueryError("Could not reach the server (connection refused).", "ECONNREFUSED");
    case "ENOTFOUND":
      return new QueryError("The server hostname could not be resolved.", "ENOTFOUND");
    case "ETIMEDOUT":
      return new QueryError("Timed out connecting to the server.", "ETIMEDOUT");
    case "28P01":
      return new QueryError("The admin credentials for this server were rejected.", "28P01");
    case "3D000":
      return new QueryError("That database does not exist on this server.", "3D000");
    default:
      // SQL-level error: surface the PostgreSQL message (safe, no creds).
      return new QueryError(e?.message ?? "Query failed.", e?.code ?? "QUERY_ERROR");
  }
}

function connectionFor(environment: Environment, database?: string): string {
  const adminUrl = getAdminUrl(environment);
  if (!adminUrl) {
    throw new QueryError(
      `The ${environment} server is not configured.`,
      "NOT_CONFIGURED",
    );
  }
  if (!database) return adminUrl;
  assertSafeIdentifier(database);
  const u = new URL(adminUrl);
  u.pathname = `/${database}`;
  return u.toString();
}

async function withClient<T>(
  connectionString: string,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    statement_timeout: STATEMENT_TIMEOUT_MS,
  });
  try {
    await client.connect();
  } catch (err) {
    throw toQueryError(err);
  }
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => {});
  }
}

/** Normalize node-pg's single-or-array result into our QueryResult shape. */
function shapeResult(res: PgResult | PgResult[], ms: number): QueryResult {
  const results = Array.isArray(res) ? res : [res];
  // Prefer the last statement that produced rows/columns; else the last one.
  const withRows = [...results].reverse().find((r) => r.fields?.length);
  const chosen = withRows ?? results[results.length - 1];

  const columns = chosen?.fields?.map((f) => f.name) ?? [];
  const rows = (chosen?.rows ?? []) as Record<string, unknown>[];
  const command = chosen?.command
    ? `${chosen.command}${chosen.rowCount != null ? ` ${chosen.rowCount}` : ""}`
    : null;
  const rowCount = chosen?.fields?.length ? rows.length : (chosen?.rowCount ?? 0);

  return { columns, rows, rowCount, command, executionTimeMs: ms };
}

export class PostgresQueryEngine implements QueryEngine {
  readonly kind = "postgres" as const;

  async listDatabases(environment: Environment): Promise<string[]> {
    return withClient(connectionFor(environment), async (client) => {
      const res = await client.query(
        `SELECT datname FROM pg_database
         WHERE datistemplate = false AND datallowconn = true
         ORDER BY datname`,
      );
      return res.rows.map((r) => r.datname as string);
    });
  }

  async execute(
    environment: Environment,
    database: string,
    sql: string,
  ): Promise<QueryResult> {
    return withClient(connectionFor(environment, database), async (client) => {
      const start = Date.now();
      try {
        const res = await client.query(sql);
        return shapeResult(res, Date.now() - start);
      } catch (err) {
        throw toQueryError(err);
      }
    });
  }

  async explain(
    environment: Environment,
    database: string,
    sql: string,
  ): Promise<QueryResult> {
    // Strip any leading EXPLAIN/ANALYZE so we never accidentally execute the
    // statement; ANALYZE would run the underlying write.
    const inner = sql
      .trim()
      .replace(/;+\s*$/, "")
      .replace(/^\s*EXPLAIN\s+(ANALYZE\s+)?(VERBOSE\s+)?/i, "");
    return withClient(connectionFor(environment, database), async (client) => {
      const start = Date.now();
      try {
        const res = await client.query(`EXPLAIN ${inner}`);
        return shapeResult(res, Date.now() - start);
      } catch (err) {
        throw toQueryError(err);
      }
    });
  }

  async overview(environment: Environment): Promise<ServerOverview> {
    return withClient(connectionFor(environment), async (client) => {
      const res = await client.query(`
        SELECT
          (SELECT count(*) FROM pg_database WHERE datistemplate = false) AS total_databases,
          (SELECT count(*) FROM pg_roles) AS total_users,
          (SELECT count(*) FROM pg_stat_activity) AS active_connections,
          current_setting('server_version') AS server_version,
          (now() - pg_postmaster_start_time())::text AS uptime
      `);
      const row = res.rows[0] ?? {};
      return {
        totalDatabases: Number(row.total_databases ?? 0),
        totalUsers: Number(row.total_users ?? 0),
        activeConnections: Number(row.active_connections ?? 0),
        serverVersion: String(row.server_version ?? "unknown"),
        uptime: String(row.uptime ?? "unknown"),
      };
    });
  }
}

export const postgresQueryEngine = new PostgresQueryEngine();
