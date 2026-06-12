---
title: Databases
description: Provision PostgreSQL databases, roles, and grants across environments — idempotently.
category: Modules
order: 1
---

The Databases module (`/create`, `/registry`, `/dashboard`) provisions PostgreSQL databases and users on your target servers and keeps a searchable registry of everything it has created.

## Provisioning a database

The Create page offers two tabs:

1. **Single database** — one database + user on one environment.
2. **Full environment set** — the same application provisioned across every configured environment at once.

### Inputs

- **Environment** — chosen from your configured environments.
- **Application name** — a friendly label (1–100 characters).
- **Database name** — a PostgreSQL identifier (auto-derived, editable).
- **Database username** — a PostgreSQL identifier (auto-derived, editable).
- **Password** — auto-generated (or your own, 16–128 characters).
- **Notes** — optional (max 1000 characters).

### How names are derived

From the application name and the environment's abbreviation, ALIM derives a safe identifier (`src/lib/naming.ts`): lowercased, non-`[a-z0-9_]` runs collapsed to `_`, leading non-letters stripped, trailing underscores removed, truncated to 50 characters.

- **Database**: `{stem}` (no abbreviation) or `{stem}_{abbrev}`
- **Username**: `{stem}_user` or `{stem}_{abbrev}_user`

For example, "Orders API" in a staging environment abbreviated `stg` becomes database `orders_api_stg` and user `orders_api_stg_user`. Both fields stay editable; once you type into them, auto-derivation stops.

### How passwords are generated

Passwords use `crypto.randomBytes` with rejection sampling for a uniform distribution over a URL-safe alphabet (`A–Z a–z 0–9 - _`), default length 32. A fresh password is generated when the form loads and can be regenerated. You may also supply your own.

## What runs on the server

Provisioning connects to the target server using its admin (superuser, or at least `CREATEDB` + `CREATEROLE`) connection string and runs an **idempotent** sequence (`src/services/provisioning/postgres.ts`):

**On the maintenance database:**

```sql
-- user (created or password-reset)
CREATE USER "<username>" WITH LOGIN PASSWORD '<password>';
-- ALTER USER ... if it already exists

-- database (created only if absent)
CREATE DATABASE "<database>" OWNER "<username>";

GRANT ALL PRIVILEGES ON DATABASE "<database>" TO "<username>";
```

**On the new database:**

```sql
GRANT ALL ON SCHEMA public TO "<username>";
ALTER SCHEMA public OWNER TO "<username>";
GRANT ALL ON ALL TABLES    IN SCHEMA public TO "<username>";
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO "<username>";
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO "<username>";

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO "<username>";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO "<username>";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO "<username>";
```

Making the role the owner of `public` plus the default privileges means Prisma migrations and typical NestJS/ORM apps work out of the box.

### Safety

- **Identifiers** are validated against `^[a-z][a-z0-9_]*$` and double-quoted, so they can never break out of their quoting (defense in depth even if validation were bypassed).
- **Passwords** are escaped as SQL string literals (quotes and backslashes handled) because `PASSWORD` clauses cannot use bind parameters.
- Admin connections use a 10-second connect timeout and 30-second statement timeout.

## Idempotency

Re-running provisioning is safe:

- **User** — if it exists, its password is reset (`ALTER USER`); otherwise it is created.
- **Database** — if it exists it is left untouched (reported as `already_existed`); otherwise it is created.
- **Grants** — always re-applied; granting an already-held privilege is a no-op.

The registry record is an **upsert** on the unique key `(environment, host, databaseName)`, so re-provisioning the same target updates metadata in place rather than creating a duplicate.

## Full environment set

The environment-set flow takes only an application name (plus optional notes) and provisions across every configured environment sequentially, deriving names per environment and generating an independent password for each. A failure in one environment does not stop the others; the result screen reports per-environment status.

## Connection strings

The user connection string is built **in memory only**:

```
postgresql://<user>:<url-encoded-password>@<host>:<port>/<database>
```

It is returned to the success screen, shown once with copy and reveal controls, and **never persisted** to any database or log. Everywhere else (the registry, settings), connection strings are masked: `postgresql://<user>:****@<host>:<port>/<database>`.

> If you lose a connection string, you cannot recover the password — re-provision the database to reset it.

## The registry

Every provisioned database is recorded in the `provisioned_databases` table and listed at `/registry`:

- **Recorded fields**: application name, environment, database name, username, host, created-at, created-by, notes.
- **Unique key**: `(environment, host, databaseName)` — a database name is unique per (environment, server).
- **Search**: free-text across application, database, and username (case-insensitive).
- **Attribution**: `createdBy` is the authenticated user, falling back to `PROVISIONED_BY`, then `internal-admin`.

Passwords are never shown in the registry because they are never stored.

## Errors

PostgreSQL errors are mapped to safe messages that never echo credentials — for example, connection refused, host not found, timeout, bad admin credentials, or "the admin role lacks the privileges required (needs CREATEDB and CREATEROLE)."

Every provision records a `database.provision` entry in the [Audit Log](/docs/audit-log).
