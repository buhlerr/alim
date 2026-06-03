/**
 * Built-in PostgreSQL admin query library. Client-safe (pure data) so it can
 * populate the console sidebar. These are read-only diagnostic queries.
 */

export interface LibraryQuery {
  id: string;
  name: string;
  description: string;
  query: string;
}

export const QUERY_LIBRARY: LibraryQuery[] = [
  {
    id: "list-databases",
    name: "List Databases",
    description: "All non-template databases with size and owner.",
    query: `SELECT d.datname AS database,
       pg_catalog.pg_get_userbyid(d.datdba) AS owner,
       pg_size_pretty(pg_database_size(d.datname)) AS size,
       d.datallowconn AS allows_connections
FROM pg_catalog.pg_database d
WHERE d.datistemplate = false
ORDER BY pg_database_size(d.datname) DESC;`,
  },
  {
    id: "list-users",
    name: "List Users",
    description: "Roles and their attributes.",
    query: `SELECT rolname AS role,
       rolsuper AS is_superuser,
       rolcreatedb AS can_create_db,
       rolcreaterole AS can_create_role,
       rolcanlogin AS can_login,
       rolconnlimit AS connection_limit
FROM pg_catalog.pg_roles
ORDER BY rolname;`,
  },
  {
    id: "active-connections",
    name: "Show Active Connections",
    description: "Current sessions by database, user, and state.",
    query: `SELECT datname AS database,
       usename AS username,
       client_addr,
       state,
       count(*) AS connections
FROM pg_stat_activity
GROUP BY datname, usename, client_addr, state
ORDER BY connections DESC;`,
  },
  {
    id: "database-sizes",
    name: "Database Sizes",
    description: "Size of every database, largest first.",
    query: `SELECT datname AS database,
       pg_size_pretty(pg_database_size(datname)) AS size,
       pg_database_size(datname) AS size_bytes
FROM pg_database
WHERE datistemplate = false
ORDER BY pg_database_size(datname) DESC;`,
  },
  {
    id: "long-running-queries",
    name: "Long Running Queries",
    description: "Active queries running longer than 30 seconds.",
    query: `SELECT pid,
       usename AS username,
       datname AS database,
       now() - query_start AS duration,
       state,
       left(query, 200) AS query
FROM pg_stat_activity
WHERE state <> 'idle'
  AND query_start IS NOT NULL
  AND now() - query_start > interval '30 seconds'
ORDER BY duration DESC;`,
  },
  {
    id: "table-sizes",
    name: "Table Sizes",
    description: "Largest tables in the current database (incl. indexes).",
    query: `SELECT schemaname AS schema,
       relname AS table,
       pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
       pg_size_pretty(pg_relation_size(relid)) AS table_size,
       pg_size_pretty(pg_total_relation_size(relid) - pg_relation_size(relid)) AS index_size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 50;`,
  },
  {
    id: "index-usage",
    name: "Index Usage",
    description: "Index scan counts for the current database.",
    query: `SELECT schemaname AS schema,
       relname AS table,
       indexrelname AS index,
       idx_scan AS scans,
       pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_catalog.pg_stat_user_indexes
ORDER BY idx_scan ASC, pg_relation_size(indexrelid) DESC
LIMIT 50;`,
  },
  {
    id: "connection-statistics",
    name: "Connection Statistics",
    description: "Connection counts vs. max_connections.",
    query: `SELECT (SELECT count(*) FROM pg_stat_activity) AS total_connections,
       (SELECT count(*) FROM pg_stat_activity WHERE state = 'active') AS active,
       (SELECT count(*) FROM pg_stat_activity WHERE state = 'idle') AS idle,
       current_setting('max_connections') AS max_connections;`,
  },
];
