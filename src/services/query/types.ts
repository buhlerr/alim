/**
 * Query engine abstraction. v1 ships a PostgreSQL implementation; the console
 * UI and server actions talk only to this interface, so MySQL / MariaDB /
 * MSSQL / Redis / MongoDB engines can be added later without UI changes.
 */
import type { Environment } from "@/lib/environments";

export type QueryEngineKind =
  | "postgres"
  | "mysql"
  | "mariadb"
  | "mssql"
  | "redis"
  | "mongodb";

/** A single result set: column names + rows as plain objects. */
export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  /** The command tag of the last statement, e.g. "SELECT" or "UPDATE 3". */
  command: string | null;
  executionTimeMs: number;
}

export interface ServerOverview {
  totalDatabases: number;
  totalUsers: number;
  activeConnections: number;
  serverVersion: string;
  uptime: string;
}

export class QueryError extends Error {
  constructor(
    message: string,
    public readonly code: string = "QUERY_ERROR",
  ) {
    super(message);
    this.name = "QueryError";
  }
}

export interface QueryEngine {
  readonly kind: QueryEngineKind;
  /** Databases available on the environment's server (for the DB dropdown). */
  listDatabases(environment: Environment): Promise<string[]>;
  /** Run a query against a specific database and return the (last) result set. */
  execute(
    environment: Environment,
    database: string,
    sql: string,
  ): Promise<QueryResult>;
  /** Run EXPLAIN (no ANALYZE — never executes the statement) and return the plan. */
  explain(
    environment: Environment,
    database: string,
    sql: string,
  ): Promise<QueryResult>;
  /** Server-level overview stats. */
  overview(environment: Environment): Promise<ServerOverview>;
}
