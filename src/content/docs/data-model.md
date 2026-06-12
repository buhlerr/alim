---
title: Data Model
description: Every table in ALIM's metadata database.
category: Reference
order: 3
---

These are the Prisma models that make up ALIM's own metadata database (`DATABASE_URL`). They describe ALIM's state — **not** the databases it provisions. Provisioned-database passwords are never stored here.

## Environment

User-defined environments. The stable `key` is the primary key and is referenced by other tables.

| Field | Type | Notes |
| --- | --- | --- |
| `key` | String | Primary key; stable identifier (e.g. `PRODUCTION`). |
| `name` | String | Display name. |
| `description` | String? | |
| `color` | String | UI badge color (default `slate`). |
| `abbreviation` | String? | Used when deriving database/user names. |
| `sortOrder` | Int | Ordering (default 0). |
| `readOnly` | Boolean | Blocks writes in the SQL Console (default false). |
| `requireWriteConfirm` | Boolean | Requires typed confirmation for writes (default true). |
| `createdAt` / `updatedAt` | DateTime | |

Related rows in `ProvisionedDatabase` and `QueryHistory` reference `key` with `onDelete: Restrict`, so an environment in use cannot be deleted.

## ProvisionedDatabase

One row per `(database, server)` ALIM has provisioned.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | String | `cuid()`. |
| `applicationName` | String | |
| `environment` | String | FK → `Environment.key` (Restrict). |
| `databaseName` | String | |
| `username` | String | |
| `host` | String | |
| `createdAt` | DateTime | |
| `createdBy` | String | Default `system`; set to the authenticated actor. |
| `notes` | String? | |

**Unique:** `(environment, host, databaseName)` (`env_host_db`). **Indexes:** `applicationName`, `databaseName`, `username`. Passwords are intentionally **not** stored.

## QueryHistory

One row per executed SQL Console query — metadata and the query text only, never connection strings.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | String | `cuid()`. |
| `environment` | String | FK → `Environment.key` (Restrict). |
| `databaseName` | String | |
| `query` | String | The SQL text (for review/replay). |
| `queryType` | String | e.g. `SELECT`, `INSERT`. |
| `executionTimeMs` | Int? | |
| `success` | Boolean | |
| `errorMessage` | String? | |
| `executedAt` | DateTime | Indexed. |

## SavedQuery

User-saved queries shown in the console sidebar.

| Field | Type |
| --- | --- |
| `id` | String (`cuid()`) |
| `name` | String (indexed) |
| `description` | String? |
| `query` | String |
| `createdAt` / `updatedAt` | DateTime |

## Setting

Encrypted key/value store for ALIM's own configuration (integration credentials, per-environment connection strings under keys like `postgres.<ENV_KEY>.url`).

| Field | Type | Notes |
| --- | --- | --- |
| `key` | String | Primary key. |
| `encryptedValue` | String | AES-256-GCM, format `base64(iv).base64(tag).base64(ciphertext)`. |
| `updatedAt` | DateTime | |

## Secret

The user-managed encrypted vault (see [Secrets](/docs/secrets)).

| Field | Type | Notes |
| --- | --- | --- |
| `id` | String | `cuid()`. |
| `name` | String | Unique, indexed. |
| `description` | String? | |
| `category` | String | Free label. |
| `encryptedValue` | String | AES-256-GCM. |
| `lastRevealedAt` | DateTime? | Stamped on reveal. |
| `createdAt` / `updatedAt` | DateTime | |

## AuditLog

Append-only action history (see [Audit Log](/docs/audit-log)). **No foreign keys**, so entries survive deletions.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | String | `cuid()`. |
| `createdAt` | DateTime | Indexed. |
| `actor` | String | |
| `action` | String | Indexed. |
| `targetType` | String? | Indexed. |
| `targetId` | String? | |
| `summary` | String | |
| `metadata` | Json? | |
| `success` | Boolean | Default true. |
| `environment` | String? | |

## HostCredential

SSH access for migration volume transfers (see [Migrations](/docs/migrations)).

| Field | Type | Notes |
| --- | --- | --- |
| `id` | String | `cuid()`. |
| `name` | String | Friendly label. |
| `hostname` | String? | |
| `ipAddress` | String | SSH target. |
| `sshPort` | Int | Default 22. |
| `sshUsername` | String | Default `root`. |
| `encryptedPrivateKey` | String | AES-256-GCM. |
| `providerType` | String | Default `coolify`. |
| `coolifyServerUuid` | String? | Indexed. |
| `createdAt` / `updatedAt` | DateTime | |

## Migration models

The migration engine uses four related models:

- **MigrationJob** — the job: type (`clone`/`migrate`), source/destination resource and host, `status`, `exposure`, `validationUrl`, NPM/Cloudflare flags, `currentStepKey` (resumability), `sourceResourceSnapshot` (frozen source config), and `approvedAt` / `completedAt`. Indexed on `status` and `createdAt`.
- **MigrationStep** — per-step tracking: `key`, `label`, `order`, `status`, `attemptNumber`, `detail`, timestamps. Unique on `(jobId, key)`.
- **MigrationLog** — append-only log lines (`level`, `message`, optional `stepKey`), live-streamed to the UI.
- **MigrationArtifact** — outputs to enable rollback (`type`, `reference`, `metadata`) — destination resource, volume archive/transfer/restore, validation URL, source-stopped marker.

All three child models cascade-delete with their job.

## Prisma generator

The client is generated for two binary targets so the same build runs locally and in Docker:

```
binaryTargets = ["native", "debian-openssl-3.0.x"]
```

(`debian-openssl-3.0.x` matches the `node:20-bookworm-slim` base image.)
