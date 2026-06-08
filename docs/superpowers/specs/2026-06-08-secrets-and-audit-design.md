# Design: Secrets & Audit modules

**Date:** 2026-06-08
**Status:** Approved
**Author:** brainstormed with user

## Context

Aspyre Infrastructure Manager (package `aspyre-devops`, formerly DB Provisioner)
is a modular infrastructure platform. Shipped modules: Databases, SQL Console,
Coolify, and dynamic Environments. The module registry (`src/lib/modules.ts`)
lists five `coming-soon` modules; this design covers the two cross-cutting
**platform** modules: **Secrets** and **Audit**.

Build order (user decision): **Secrets first, then Audit.** Each module gets its
own implementation plan and build cycle. This single design doc captures both so
the cross-cutting decisions (audit must log secret reveals) are locked from the
start.

### Existing foundation to reuse

- `src/lib/crypto.ts` — AES-256-GCM `encrypt`/`decrypt`, `isEncryptionConfigured()`.
  Key from `ENCRYPTION_KEY`. Reused as-is by Secrets.
- `src/services/settings.ts` + `Setting` table — encrypted key/value store for
  **app-internal config** (Coolify token, Postgres admin URLs). Secrets is
  deliberately a *separate* table so user-managed secrets don't intermingle with
  internal settings.
- `ActionResult<T>` shape (`{ ok, error?, fieldErrors?, data? }`) — used by all
  server actions; reused here.
- Module shape to mirror (Coolify): `config/validation → service → server
  actions → pages → module registry`.
- No auth system. This is a single-admin tool. Actor identity resolves from
  `PROVISIONED_BY` env var, falling back to `"internal-admin"` (same convention
  as `src/services/registry.ts`).

## Design decisions (from brainstorming)

1. **Order:** Secrets first, then Audit.
2. **Secrets storage:** new dedicated `Secret` table (not the existing `Setting`
   table), reusing `crypto.ts` for encryption at rest.
3. **Audit scope:** every state-changing (mutating) action plus secret reveals.
   Read-only page views are NOT logged. SQL Console keeps its own `QueryHistory`.
4. **Secret reveal UX:** reveal-on-demand. Values stay masked in the UI; an
   explicit Reveal/copy action decrypts server-side and writes an audit entry.

---

## Module A — Secrets (build first)

A user-managed encrypted vault for arbitrary credentials (API tokens,
passwords, connection strings, SSH keys). Distinct from the internal `Setting`
store.

### Data model

New Prisma model `Secret` (`secrets` table):

| field            | type      | notes                                                     |
|------------------|-----------|-----------------------------------------------------------|
| `id`             | String    | `@id @default(cuid())`                                     |
| `name`           | String    | `@unique`. Human label and lookup key.                    |
| `description`    | String?   | optional free text                                        |
| `category`       | String    | free string; UI offers presets (see below)                |
| `encryptedValue` | String    | `@map("encrypted_value")`. AES-256-GCM via `crypto.ts`.   |
| `lastRevealedAt` | DateTime? | `@map("last_revealed_at")`. Set each time value revealed. |
| `createdAt`      | DateTime  | `@default(now()) @map("created_at")`                       |
| `updatedAt`      | DateTime  | `@updatedAt @map("updated_at")`                            |

Category presets surfaced in the UI (value is still a free string so users can
type their own): `API Token`, `Password`, `Connection String`, `SSH Key`,
`Other`.

The plaintext secret value is **never** stored or returned except through the
explicit reveal path.

### Layers

- **`src/lib/secrets-validation.ts`** — zod schemas:
  - `createSecretSchema` — `name` (required, non-empty, trimmed), `value`
    (required, non-empty), `category` (required), `description` (optional).
  - `updateSecretSchema` — same fields; `value` optional (empty value = leave
    existing value unchanged).
- **`src/services/secrets.ts`** (`import "server-only"`):
  - `list()` → metadata-only summaries (`id`, `name`, `description`, `category`,
    `lastRevealedAt`, `createdAt`, `updatedAt`). **Never** includes plaintext or
    `encryptedValue`.
  - `create(input)` — encrypts `value`, inserts. Throws on duplicate `name`.
  - `update(id, input)` — updates metadata; re-encrypts only if a new `value`
    is provided.
  - `delete(id)` — removes the row.
  - `reveal(id)` → decrypts and returns plaintext, stamps `lastRevealedAt`.
    Returns `null` if the row is missing or the value can't be decrypted (stale
    key).
- **`src/app/actions/secrets.ts`** (`"use server"`):
  - `createSecretAction`, `updateSecretAction`, `deleteSecretAction`,
    `revealSecretAction` — all return `ActionResult<T>`. Validate with zod,
    surface `fieldErrors`, `revalidatePath("/secrets")` after mutations.
    `revealSecretAction` returns `{ ok, data: { value } }`.
- **`src/app/secrets/page.tsx`** + components under
  `src/components/secrets/`:
  - Server component loads `secretsService.list()` and `isEncryptionConfigured()`.
  - Table: name, category badge, description, "last revealed" relative time,
    row actions (Reveal/copy, Edit, Delete). Values masked by default.
  - Create/Edit dialog driven by the validation schemas.
  - **Reveal** button calls `revealSecretAction(id)` on demand, then shows the
    value with a copy button (auto-remask after copy or dialog close).
  - Delete confirms first.
  - If encryption is not configured, show a banner (mirroring Coolify's
    not-configured state) and disable create/reveal.
- **`src/lib/modules.ts`** — flip the `secrets` module `status` to `available`
  and add its nav entry (`{ href: "/secrets", label: "Secrets", icon: KeyRound }`).

### Flows & safety

- List/table payloads carry **no** plaintext — only `revealSecretAction`
  decrypts, server-side, per request.
- Reveal returns plaintext to the client purely for display/copy; the client
  does not cache it beyond the open dialog.
- All encryption goes through the existing `crypto.ts`; an unset/rotated
  `ENCRYPTION_KEY` degrades gracefully (reveal returns null, banner shown).

### Tests (Vitest, TDD)

- `src/services/secrets.test.ts` — create→reveal round-trip; `list()` excludes
  plaintext/`encryptedValue`; duplicate-name rejected; `update` without value
  preserves the stored value; `update` with value re-encrypts; `reveal` stamps
  `lastRevealedAt` and returns null for missing rows.
- `src/lib/secrets-validation.test.ts` — schema accept/reject cases.

---

## Module B — Audit (build second, own plan)

A platform-wide, append-only log of state-changing actions.

### Data model

New Prisma model `AuditLog` (`audit_log` table):

| field        | type      | notes                                                   |
|--------------|-----------|---------------------------------------------------------|
| `id`         | String    | `@id @default(cuid())`                                   |
| `createdAt`  | DateTime  | `@default(now()) @map("created_at")`, indexed           |
| `actor`      | String    | resolved identity (`PROVISIONED_BY`/`internal-admin`)   |
| `action`     | String    | dotted action key, e.g. `database.provision`, `secret.reveal`, indexed |
| `targetType` | String?   | `@map("target_type")`, e.g. `database`, `secret`, `environment` |
| `targetId`   | String?   | `@map("target_id")`                                     |
| `summary`    | String    | human-readable one-liner                                |
| `metadata`   | Json?     | structured extra context                                |
| `success`    | Boolean   | `@default(true)`                                        |
| `environment`| String?   | optional environment key (no FK — keep audit decoupled) |

Append-only: no update/delete in the service surface.

### Layers

- **`src/lib/audit.ts`** (client-safe constants + actor helper boundary):
  action key constants and `targetType` constants. `getActor()` lives in a
  `server-only` module (or `src/services/audit.ts`) since it reads env.
- **`src/services/audit.ts`** (`import "server-only"`):
  - `record(event)` — best-effort insert. **Never throws into the caller**:
    failures are caught and logged so auditing can't break a real operation.
  - `list(filters)` — paginated query with filters: `action`, `actor`,
    `targetType`, date range. Ordered by `createdAt desc`.
- **Instrumentation** — add `auditService.record(...)` calls to existing
  mutating server actions:
  - `src/app/actions/provision.ts` — provision / drop.
  - `src/app/actions/coolify.ts` — config save, app create, deploy, env-var
    changes.
  - `src/app/actions/environments.ts` — environment create/update/delete/reorder.
  - settings mutations (Postgres URLs, Coolify token).
  - `src/app/actions/secrets.ts` — `secret.create`, `secret.update`,
    `secret.delete`, `secret.reveal`.
- **`src/app/audit/page.tsx`** + `src/components/audit/` — filterable table
  (action, actor, target type, date range), relative timestamps, expandable
  metadata. Read-only.
- **`src/lib/modules.ts`** — flip the `audit` module `status` to `available`,
  add `/audit` nav entry.

### Tests (Vitest, TDD)

- `src/services/audit.test.ts` — `record` persists fields; `record` swallows
  errors (best-effort); `list` filters by action/actor/targetType/date and
  orders desc.
- At least one instrumentation test verifying a representative action writes the
  expected audit entry.

---

## Out of scope (YAGNI)

- Multi-user auth / per-user audit attribution (no auth system exists).
- Secret versioning / rotation history.
- Audit log retention/pruning policy and export.
- Logging read-only page views (SQL Console already has `QueryHistory`).
