---
title: SQL Console
description: Run, explain, format, and save SQL with read/write safety rails and an admin dashboard.
category: Modules
order: 2
---

The SQL Console (`/query`) runs SQL against any configured environment with a CodeMirror editor, classification-based write protection, and a built-in admin dashboard. Connection strings are never exposed to the browser.

## The editor

A CodeMirror 6 editor with PostgreSQL syntax highlighting, line numbers, active-line highlight, bracket matching, and autocompletion. Four actions:

- **Execute** — runs the query against the selected environment + database.
- **Explain** — wraps the query in `EXPLAIN` (never `EXPLAIN ANALYZE`, so it never executes writes) and returns the plan. Any leading `EXPLAIN` you typed is stripped first to avoid double-wrapping.
- **Format** — reformats in place using `sql-formatter` (PostgreSQL dialect, uppercase keywords).
- **Clear** — empties the editor and results.

## Read vs. write classification

Before anything runs, the query is classified (`src/lib/sql-classify.ts`). The classifier is **pure and runs identically on the client** (to show the confirmation modal early) **and on the server** (the authoritative gate), and it **errs toward caution** — an unrecognized leading keyword is treated as a write.

How it works:

1. **Strip noise** — comments, string literals, quoted identifiers, and dollar-quoted blocks are removed so keywords inside them never trigger detection.
2. **Split** on `;` into statements.
3. **Inspect each** leading keyword. Special cases: `EXPLAIN` counts as a write only if `ANALYZE` is present; `WITH` (CTEs) are scanned for embedded write keywords; unknown keywords are treated as writes.

Reads include `SELECT, SHOW, TABLE, VALUES, FETCH, SET, RESET, BEGIN/COMMIT/ROLLBACK, SAVEPOINT, DECLARE`, …
Writes include `INSERT, UPDATE, DELETE, DROP, TRUNCATE, ALTER, CREATE, GRANT, REVOKE, MERGE, VACUUM, COPY, CALL, DO, LOCK`, …

## Write-safety policy

Per-environment policy (`src/lib/query-policy.ts`) is also pure and enforced on both client and server. Each environment carries two flags (set in [Settings](/docs/settings)):

| Category | `readOnly` | `requireWriteConfirm` | Result |
| --- | --- | --- | --- |
| Read | any | any | Runs immediately. |
| Write | `true` | — | **Blocked.** "Write operations are disabled on this environment." |
| Write | `false` | `true` | Allowed, but requires typed confirmation. |
| Write | `false` | `false` | Allowed, no confirmation. |

When confirmation is required, a modal shows the target environment, database, and the detected dangerous keywords, and you must type **`CONFIRM`** to proceed. The server re-classifies and re-evaluates the policy on submit — it never trusts the client's decision.

## Selectors and connection security

- **Environment** — selectable from your configured environments; a read-only environment shows a badge.
- **Database** — populated live by querying `pg_database` for non-template, connectable databases (`datistemplate = false AND datallowconn = true`).

Connection strings live server-side only; the browser only ever sees database **names**. Console queries run with a 60-second statement timeout and a 10-second connect timeout, and connection errors are returned credential-free.

## Results

Results render in a table with:

- a stats bar (rows, execution time in ms, database, environment, command tag),
- case-insensitive client-side **search** across all columns,
- **pagination** (25 rows per page),
- **copy as TSV**, and **CSV / JSON export** (exports respect the active search filter),
- nulls shown as `<NULL>`, objects as JSON, dates as ISO-8601.

## History and saved queries

- **History** (`QueryHistory` table) records **metadata and the query text only** — environment, database, query type, execution time, success, and any error message. It never stores connection strings or credentials. The sidebar shows the last 50; click one to load it back into the editor.
- **Saved queries** (`SavedQuery` table) — name, optional description, and the SQL. Save from the editor, load with a click, delete from the sidebar.
- **Built-in library** (`src/lib/query-library.ts`) — eight read-only diagnostic queries: List Databases, List Users, Show Active Connections, Database Sizes, Long Running Queries, Table Sizes, Index Usage, and Connection Statistics.

## Admin dashboard

A second tab provides a live operational view of the selected environment's server:

- **Overview** — total databases, roles, active connections, server version, and uptime.
- **Storage** — cluster-wide database sizes, and the largest tables in the selected database (total size including indexes, table size, index size).
- **Performance** — active queries (excluding idle sessions and the dashboard's own query), long-running queries (> 30s), and waiting locks (joining `pg_locks` with `pg_stat_activity`).

Admin-dashboard queries are tooling and are **not** recorded to query history.
