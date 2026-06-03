import "server-only";
import { postgresQueryEngine } from "./postgres";
import type { Environment } from "@/lib/targets";
import type { QueryResult, ServerOverview } from "./types";

/**
 * Read-only admin dashboard queries. These run through the engine but are NOT
 * recorded in query history (they are tooling, not user queries).
 *
 * Cluster-wide views (database sizes, connections, locks) run against the
 * maintenance database; table sizes run against the selected database.
 */

const DATABASE_SIZES = `SELECT datname AS database,
       pg_size_pretty(pg_database_size(datname)) AS size,
       pg_database_size(datname) AS size_bytes
FROM pg_database
WHERE datistemplate = false
ORDER BY pg_database_size(datname) DESC`;

const LARGEST_TABLES = `SELECT schemaname AS schema,
       relname AS table,
       pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
       pg_total_relation_size(relid) AS bytes
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 25`;

const ACTIVE_QUERIES = `SELECT pid,
       usename AS username,
       datname AS database,
       state,
       now() - query_start AS duration,
       left(query, 200) AS query
FROM pg_stat_activity
WHERE state <> 'idle' AND pid <> pg_backend_pid()
ORDER BY duration DESC NULLS LAST
LIMIT 50`;

const LONG_RUNNING = `SELECT pid,
       usename AS username,
       datname AS database,
       now() - query_start AS duration,
       left(query, 200) AS query
FROM pg_stat_activity
WHERE state <> 'idle'
  AND query_start IS NOT NULL
  AND now() - query_start > interval '30 seconds'
ORDER BY duration DESC
LIMIT 50`;

const LOCKS = `SELECT a.pid,
       a.usename AS username,
       a.datname AS database,
       l.locktype,
       l.mode,
       l.granted,
       left(a.query, 120) AS query
FROM pg_locks l
JOIN pg_stat_activity a ON a.pid = l.pid
WHERE NOT l.granted
ORDER BY a.pid
LIMIT 50`;

export interface AdminStorage {
  databaseSizes: QueryResult;
  largestTables: QueryResult;
}

export interface AdminPerformance {
  activeQueries: QueryResult;
  longRunning: QueryResult;
  locks: QueryResult;
}

export const adminService = {
  overview(environment: Environment): Promise<ServerOverview> {
    return postgresQueryEngine.overview(environment);
  },

  async storage(
    environment: Environment,
    database: string,
  ): Promise<AdminStorage> {
    const [databaseSizes, largestTables] = await Promise.all([
      // cluster-wide → maintenance db (empty database arg)
      postgresQueryEngine.execute(environment, "", DATABASE_SIZES).catch(emptyResult),
      postgresQueryEngine.execute(environment, database, LARGEST_TABLES).catch(emptyResult),
    ]);
    return { databaseSizes, largestTables };
  },

  async performance(environment: Environment): Promise<AdminPerformance> {
    const [activeQueries, longRunning, locks] = await Promise.all([
      postgresQueryEngine.execute(environment, "", ACTIVE_QUERIES).catch(emptyResult),
      postgresQueryEngine.execute(environment, "", LONG_RUNNING).catch(emptyResult),
      postgresQueryEngine.execute(environment, "", LOCKS).catch(emptyResult),
    ]);
    return { activeQueries, longRunning, locks };
  },
};

function emptyResult(): QueryResult {
  return { columns: [], rows: [], rowCount: 0, command: null, executionTimeMs: 0 };
}
