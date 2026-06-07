# Dynamic Environments — Design Spec

**Date:** 2026-06-07
**Status:** Approved (pending final user review)
**Project:** Aspyre Infrastructure Manager (`aspyre-devops`)

## Summary

Today, environments are a hardcoded, compile-time concept: a TypeScript string-union (`"PRODUCTION" | "STAGING" | "DEVELOPMENT"`) in `src/lib/environments.ts` and a matching Prisma `enum Environment`. This change makes environments **user-defined data**: a CRUD-managed entity with a name, description, color, ordering, and per-environment write-protection flags. Environments become the shared organizing dimension that the rest of the app (PostgreSQL targets today; Coolify and future modules later) references.

This is a single installation per company (not multi-tenant): one shared set of environments for the whole deployment.

## Goals

- Let users create, edit, reorder, and delete environments from the Settings page (Environments is the first section).
- Each environment has: **name**, **description**, **color** (from a curated palette), **read-only** flag, **require-write-confirmation** flag, and a sort order.
- Everything currently keyed to the hardcoded enum (Postgres connection targets, the registry, query history, badges, the create flows, the SQL console's write-protection) works off the dynamic list instead.
- Preserve all existing data: seed the current three environments so nothing breaks.

## Non-goals

- Multi-tenancy / per-org isolation (single installation only).
- Changing Coolify's create form, which keeps its own free-text `environment_name` (Coolify's own concept). A future enhancement may map an app-environment to a Coolify environment; out of scope here.
- Archiving/soft-delete. Deletion is **blocked while in use** (user's choice); unused environments can be hard-deleted.

## Key decisions (from brainstorming)

1. **Tenancy:** single installation per company; one shared set of environments.
2. **Delete behavior:** block deletion while the environment is referenced; the database enforces this.
3. **Write protection:** per-environment `readOnly` and `requireWriteConfirm` flags (replaces the hardcoded Production check and `POSTGRES_PROD_READONLY`).
4. **Color:** curated palette of swatches (not free hex).
5. **Migration:** seed the existing Production/Staging/Development so all current data and saved Postgres connections keep working.
6. **Model:** Approach B — `Environment` table whose stable `key` is referenced by foreign keys with `onDelete: Restrict`. The DB enforces the deletion rule; renames edit `name`, never `key`, so references never break.

## Data model

New Prisma model (`environments` table):

| field | type | notes |
|---|---|---|
| `key` | `String @id` | stable slug (e.g. `PRODUCTION`, `QA_EU`); generated from name on create; never changes |
| `name` | `String` | display label, editable |
| `description` | `String?` | optional |
| `color` | `String` | palette swatch key (`red`, `amber`, `green`, `blue`, `violet`, `slate`, `teal`, `orange`, `cyan`, `pink`) |
| `sortOrder` | `Int @default(0)` | manual ordering |
| `readOnly` | `Boolean @default(false)` | hard-blocks SQL writes/DDL for this env |
| `requireWriteConfirm` | `Boolean @default(true)` | typed-CONFIRM modal for writes |
| `createdAt` | `DateTime @default(now())` | |
| `updatedAt` | `DateTime @updatedAt` | |

Relations: `provisionedDatabases ProvisionedDatabase[]`, `queryHistory QueryHistory[]`.

**FK conversion (core of Approach B):**
- `ProvisionedDatabase.environment` and `QueryHistory.environment` change from `enum Environment` to `String`. The scalar field stays named `environment` (so all `row.environment` reads keep working). Each gains a relation field `environmentRef Environment @relation(fields: [environment], references: [key], onDelete: Restrict)`.
- Existing `@@unique`/`@@index` on `environment` are preserved.

## Migration

A single hand-finished Prisma migration:

1. Create the `environments` table.
2. Insert the three seeds:
   - `Production` — key `PRODUCTION`, color `red`, sortOrder 0, requireWriteConfirm true, readOnly false
   - `Staging` — key `STAGING`, color `amber`, sortOrder 1, requireWriteConfirm true, readOnly false
   - `Development` — key `DEVELOPMENT`, color `slate`, sortOrder 2, requireWriteConfirm true, readOnly false
3. Convert both enum columns to `text` (`USING environment::text`, values preserved verbatim); drop the old `Environment` enum type.
4. Add the FK constraints (now satisfied because every existing row's value matches a seeded key).

**`POSTGRES_PROD_READONLY` is superseded** by the per-environment `readOnly` flag. After migrating, a user who relied on it flips Production's "Read-only" toggle once in Settings. Documented in `.env.example` and the migration notes. The env var is no longer read.

## Services & types

`environmentsService` (server-only, over Prisma):
- `list()` → all environments ordered by `sortOrder`
- `get(key)`
- `create({ name, description, color, readOnly, requireWriteConfirm })` → slugifies `name` to a unique `key` (uppercase `A–Z0–9_`; dedupe on collision by suffixing a number), sets `sortOrder` to the end
- `update(key, fields)` → name/description/color/flags/order; never the key
- `delete(key)` → attempts delete; on Prisma FK violation (`P2003`) returns a friendly "in use — N databases / M queries reference it" error
- `reorder(keys[])` → persists new `sortOrder`

Type changes:
- `EnvironmentKey = string` (the key).
- `EnvironmentSummary` interface `{ key, name, color, readOnly, requireWriteConfirm, sortOrder }` passed to client components.
- `src/lib/environments.ts` stops exporting the hardcoded union/array/labels; instead exports the client-safe `PALETTE` (`Record<string, { badgeClass: string; label: string }>`) and the `EnvironmentSummary` type. The actual list always comes from the server.
- `validation.ts`: `environmentSchema` becomes `z.string()`; key existence is verified in server actions against the live list.

## Server actions

`src/app/actions/environments.ts` (all `"use server"`, validated, revalidating `/settings`, `/dashboard`, `/create`, `/query`, `/registry`):
- `createEnvironmentAction(input)`
- `updateEnvironmentAction(key, input)`
- `deleteEnvironmentAction(key)` — surfaces the in-use block as a user message
- `reorderEnvironmentsAction(keys)`

## UI

**Settings page** gains an **Environments** section, placed first (above PostgreSQL servers and Coolify):
- Ordered list; each row: colored badge (name), description, flag chips (`Read-only`, `Confirm writes`), reorder arrows, edit, delete.
- Add / Edit form (inline or dialog — decided at implementation): Name, Description, Color swatch picker, Read-only toggle, Require-write-confirm toggle.
- Delete shows the friendly in-use message when blocked.

**PostgreSQL servers** section iterates the live environment list (one `PostgresTargetForm` per environment); the setting key is `postgres.<key>.url`. `getAllTargetInfo()` iterates the live list.

**Badge** (`EnvironmentBadge`) takes an `EnvironmentSummary` (name + color) and renders via `PALETTE[color].badgeClass`, replacing the hardcoded `destructive/warning/secondary` map. Pages fetch the environment list server-side and pass each row its summary (or a `key → summary` map).

## Ripple updates (consumers)

- **`registryService.stats()`**: dynamic `groupBy environment` joined to the live list (was `Record<Environment, number>` with fixed keys). Dashboard renders a card per existing environment.
- **Create flows**: single-create environment dropdown from the live list; "Full environment set" generalizes to "create across all environments."
- **SQL console**: read-only / write-confirmation driven by the selected environment's flags (server-provided), replacing the hardcoded Production check and `isProdWritesDisabled()`.
- **Badges**: registry table, query console, dashboard, provision results receive `EnvironmentSummary`.
- **`targets.ts`**: iterates the live list; per-env key `postgres.<key>.url`.
- **Coolify**: unchanged.

## Testing (Vitest + TDD)

- `environmentsService`: slugification + uniqueness, delete-blocked-on-FK (`P2003` → friendly), reorder (mock Prisma).
- Validation: environment-key existence.
- Badge palette mapping (pure unit).
- `targets`/registry dynamic iteration with a mocked environment list.
- Migration verified by `npm run build` plus a manual check that seeded keys satisfy the FKs.

## Rollout / scope

One cohesive change, but a large implementation plan: data model + migration → `environmentsService` + types → Environments CRUD UI + actions → ripple across consumers (~20 files). The plan will be sequenced so the app stays green (tests + build) at each step. A single spec; a single (multi-task) plan.
