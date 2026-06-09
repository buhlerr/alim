# Design: Migration Engine Foundation

**Date:** 2026-06-09
**Status:** Approved (foundation phase) — decisions finalized by user revisions 1–6.
**Author:** designed against the existing modules (Coolify, Deployment, NPM, Cloudflare).

## Context

A new module that migrates Coolify **resources** (applications, Docker-compose
apps, apps with Docker volumes) from one Coolify-managed **server** to another —
e.g. Server 2 → Server 3 — while preserving configuration. There is a single
Coolify control plane (one base URL / token, as today); "hosts" are the servers
registered under it (`CoolifyServer { uuid, name }`). Volume movement happens
host-to-host over SSH/rsync/tar.

This phase builds the **complete foundation**: schema, service interfaces, the
state machine, the validation engine, the wizard UI, and job tracking — with
**every external integration mocked behind an interface**. Real Coolify, SSH,
NPM, and Cloudflare calls are out of scope and arrive in later phases **without
refactoring** the callers.

**Guiding principle:** optimize for *confidence*, not speed. The user must always
be able to answer "Is the resource I validated the exact resource that will
become production?" with an unconditional **yes**. Every design decision below
serves that answer.

## Scope

Two distinct operations, each with its **own fixed planner**:

- **Migrate** — destructive move. Stops the source, moves volumes, provisions and
  deploys the destination, generates a validation URL, **waits for manual
  approval**, then switches endpoints and deletes the source.
- **Clone** — non-destructive copy. Validate → provision → deploy → URL →
  complete. Never stops, approves, switches endpoints, or deletes anything.

### Out of scope (mocked or deferred)

Real Coolify API · real SSH/rsync/tar · real NPM · real Cloudflare endpoint
switching · Database migration · Redis migration · Coolify app-creation
workflows · infrastructure dashboards. The `switch_endpoints` step is a logged
no-op behind the provider in this phase.

## Core principles (final)

1. **One canonical migration sequence.** The migrate planner is a pure function
   that always emits the *same* 12 steps in the *same* order — independent of
   workload, volume presence, or exposure. Predictable, easy to test, consistent.
2. **Volume steps always exist.** `archive_volumes`, `transfer_volumes`,
   `restore_volumes` are *always* in the plan. When no volumes are detected, the
   orchestrator transitions those steps to **`skipped`** at runtime — the plan
   shape never changes.
3. **Data integrity over downtime.** Stopping the source before migration begins
   is intentional. Once execution starts, **no writes to the source are
   permitted**. The destination presented for validation **is** the destination
   that becomes production — provisioned from a captured snapshot, never re-fetched.
4. **Clone is separate and non-destructive.** Its own planner; no stop/approval/
   cutover/delete.
5. **Approval gates production cutover.** Approval means "I validated the migrated
   resource and authorize cutover." Rollback is available **only** while
   `awaiting_approval`. Once cutover starts, automatic rollback is gone — reversing
   a completed migration means starting a *new* migration in the opposite
   direction (Server 3 → Server 2).
6. **Resumable and recoverable.** `MigrationJob` is the source of truth; all
   progress is reconstructable from the database after restart, crash, or reload.

## Canonical step sequences (pure planner)

`planner.ts` exposes `buildPlan(migrationType): StepDef[]`. It depends on nothing
but the type — never on volumes, exposure, or flags.

**Migrate** (always identical):

| # | key | label | job status while running |
|---|-----|-------|--------------------------|
| 1 | `validate` | Validate Migration | `validating` |
| 2 | `stop_source` | Stop Source Resource | `transferring` |
| 3 | `archive_volumes` | Archive Volumes | `transferring` |
| 4 | `transfer_volumes` | Transfer Volumes | `transferring` |
| 5 | `restore_volumes` | Restore Volumes | `transferring` |
| 6 | `provision` | Provision Destination Resource | `provisioning` |
| 7 | `deploy` | Deploy Destination Resource | `deploying` |
| 8 | `validation_url` | Generate Temporary Validation URL | `deploying` |
| 9 | `await_approval` | Await User Approval | `awaiting_approval` |
| 10 | `switch_endpoints` | Switch Public Endpoints | `cutting_over` |
| 11 | `delete_source` | Delete Source Resource | `cutting_over` |
| 12 | `complete` | Complete Migration | `completed` |

Steps 3–5 auto-`skipped` when volume detection found none — order and presence
unchanged (a volumeless Next.js app and a volume-bearing n8n instance produce the
identical 12-step plan; only the *runtime status* of steps 3–5 differs).

**Clone** (always identical):

| # | key | label | job status while running |
|---|-----|-------|--------------------------|
| 1 | `validate` | Validate Migration | `validating` |
| 2 | `provision` | Provision Destination Resource | `provisioning` |
| 3 | `deploy` | Deploy Destination Resource | `deploying` |
| 4 | `validation_url` | Generate Temporary Validation URL | `deploying` |
| 5 | `complete` | Complete Clone | `completed` |

Clone has **no** `await_approval` — it runs straight through. The validation URL
is still produced and displayed on the completed job.

## Data model (Prisma)

Four new models. Statuses/types are `String` columns (per house convention) with
unions + constant maps in `src/lib/migration.ts`.

### MigrationJob — source of truth
`id` · `migrationType` (`"clone" | "migrate"`) · `sourceResourceId` ·
`sourceResourceName` · `destinationResourceName` · `sourceHost` ·
`sourceHostName` · `destinationHost` · `destinationHostName` · `status` (enum
below) · `exposure` (`"internal" | "public"`) · `validationUrl?` · `npmEnabled` ·
`cloudflareEnabled` · `currentStepKey?` · `sourceResourceSnapshot` (Json — the
exact captured source config the destination is built from) · `errorMessage?` ·
`createdAt` · `updatedAt` · `approvedAt?` · `completedAt?`.

Relations: `steps MigrationStep[]`, `logs MigrationLog[]`, `artifacts MigrationArtifact[]`.

### MigrationStep — enables resumability
`id` · `jobId` (FK, `onDelete: Cascade`) · `key` · `label` · `order` · `status`
(`"pending" | "running" | "success" | "failed" | "skipped"`) · `attemptNumber`
(Int, default 1 — incremented when a failed step is retried) · `detail?` ·
`startedAt?` · `finishedAt?`. `@@unique([jobId, key])`, `@@index([jobId])`.

### MigrationLog — persistent log storage / audit
`id` · `jobId` (FK, Cascade) · `stepKey?` · `level` (`"info" | "warn" | "error"`)
· `message` · `createdAt`. `@@index([jobId, createdAt])`.

### MigrationArtifact — tracked outputs for compensation & audit
`id` · `jobId` (FK, Cascade) · `type` (e.g. `"destination_resource"`,
`"volume_archive"`, `"transferred_volume"`, `"validation_url"`) · `reference`
(uuid / path / url) · `metadata?` (Json) · `createdAt`. `@@index([jobId])`.
Rollback reads these to know what to delete; auditing reads them for a record of
exactly what was created.

### Status enum (job)
`pending` · `validating` · `provisioning` · `transferring` · `deploying` ·
`awaiting_approval` · `cutting_over` · `completed` · `failed` · `rolled_back`.

## Architecture

### PlatformProvider — the orchestration abstraction boundary
The engine depends only on this interface; `MockCoolifyProvider` is the default
implementation this phase. A real `CoolifyPlatformProvider` slots in later with
zero caller changes.

```ts
interface PlatformProvider {
  listHosts(): Promise<HostSummary[]>;                    // server uuid + name
  getHostCapacity(hostId): Promise<HostCapacity>;         // freeMemoryMb, freeDiskMb, reachable
  listResources(): Promise<ResourceSummary[]>;            // candidate apps
  inspectResource(id): Promise<ResourceInfo>;             // name, env, host, domains[], type, envVars, buildConfig
  detectVolumes(id): Promise<VolumeInfo[]>;               // name + estimated size
  resourceExistsOnHost(hostId, name): Promise<boolean>;   // duplicate-name check
  createResource(spec): Promise<{ resourceId: string }>;  // from a snapshot
  deployResource(id): Promise<void>;
  generateValidationUrl(id, hostIp): Promise<string>;     // sslip.io
  stopResource(id): Promise<void>;
  startResource(id): Promise<void>;                       // rollback restart
  switchEndpoints(job): Promise<void>;                    // cutover — mock no-op (NPM/CF later)
  deleteResource(id): Promise<void>;
}
```

`MockCoolifyProvider` returns deterministic fake data with small simulated
delays. It deliberately surfaces realistic shapes (a volumeless app vs. a
multi-volume app) so the skip path and the volume path both exercise.

### VolumeTransferService — the transfer abstraction boundary
Interface mirroring the SSH/rsync/tar shape — `archive(volume, host)`,
`transfer(volume, srcHost, dstHost)`, `restore(volume, host)` — implemented this
phase by `MockVolumeTransfer` as logged no-ops returning artifact references.

### planner.ts — pure function
`buildPlan(migrationType): StepDef[]` (the fixed tables above) and a
`stepJobStatus(key)` map. No I/O, no volume awareness. Fully unit-testable.

### MigrationOrchestratorService — owns execution
`advance(jobId)` runs **exactly one step** per call and is idempotent:

1. Load job + steps; find the first `pending`/`running` step (resume point).
2. Set step `running`, job status per `stepJobStatus(key)`, `currentStepKey`.
3. Dispatch to the keyed handler (below); append `MigrationLog` lines; record any
   `MigrationArtifact`.
4. On success → step `success`. On failure → step `failed`, job `failed`,
   `errorMessage`; a later re-`advance` retries the same step with
   `attemptNumber + 1`.
5. The `await_approval` handler sets job `awaiting_approval` and **stops** — it
   does not auto-run cutover. The client poll loop halts advancing here.

Handlers:
- `validate` → run `ValidationService`; **capture `sourceResourceSnapshot`** via
  `inspectResource`; store detected volumes as artifacts. A hard validation
  failure fails the job before anything is touched.
- `stop_source` → `provider.stopResource` (source now frozen; no further writes).
- `archive_volumes` / `transfer_volumes` / `restore_volumes` → if zero detected
  volumes, mark **`skipped`** + log and return; otherwise call the
  `VolumeTransferService` per volume, recording artifacts.
- `provision` → `provider.createResource(snapshot)` — built from the captured
  snapshot, **not** a fresh fetch → record `destination_resource` artifact.
- `deploy` → `provider.deployResource`.
- `validation_url` → `provider.generateValidationUrl`; persist `validationUrl` +
  artifact.
- `await_approval` → set `awaiting_approval`, stop.
- `switch_endpoints` → `provider.switchEndpoints` (mock).
- `delete_source` → `provider.deleteResource(source)`.
- `complete` → set `completed`, `completedAt`.

Importing the underlying **provider/services** (not server actions) keeps the
orchestrator free of `revalidatePath`/audit and unit-testable.

### ApprovalService — owns approval & rollback
- `approve(jobId)` — valid **only** from `awaiting_approval`. Marks the
  `await_approval` step `success`, sets `approvedAt`, transitions to
  `cutting_over`. The client resumes `advance` for `switch_endpoints` →
  `delete_source` → `complete`.
- `rollback(jobId)` — valid **only** from `awaiting_approval`. Compensating
  actions: delete the destination resource (from the `destination_resource`
  artifact), `startResource` the source (undo the stop), append rollback logs,
  mark remaining steps `skipped`, set job `rolled_back`. After cutover begins,
  rollback is rejected — reversal is a new opposite-direction migration.

### ValidationService — the five pre-flight checks
`validate(input): ValidationReport` (per-check `pass | fail` + detail), driving
wizard Step 4: destination host **exists**, **reachable**, enough free **disk**,
enough free **memory**, **no duplicate** resource name on the destination. A
duplicate name is a hard fail forcing a rename. The report also carries detected
volumes, the **exposure** classification, and resolved default flags.

### Exposure + defaults (`src/lib/migration.ts`, client-safe)
Only-`sslip.io` domains → **`internal`** (NPM off, Cloudflare off). Any custom
domain → **`public`** (NPM on, Cloudflare on). Both flags are user-overridable in
the wizard. Plus sslip.io URL helpers and the status/type/level constant maps.

## UI / server actions

Pages (App Router):
- **`/migrations`** — job list: name, type, `source → destination`, status badge,
  created; empty state; "New Migration".
- **`/migrations/new`** — `MigrationWizard` (client). Steps 1–5 gather selections
  (resource → type → destination host → validation results → plan preview). Step
  6 "Execute" calls `createMigrationAction` and routes to the job page.
- **`/migrations/[id]`** — `MigrationJobView`: live step progress + polled log
  stream (Step 6); when `awaiting_approval`, the Approval panel — validation URL,
  Open-URL button, **Approve** / **Rollback** (Step 7). This durable page is what
  makes the flow resumable: a reload re-reads job + steps + logs and keeps going.

Server actions (`src/app/actions/migration.ts`, returning the existing
`ActionResult<T>` shape):
- `getMigrationOptionsAction` — resources + hosts (with capacities) for the wizard.
- `validateMigrationAction` — runs validation + volume detection + exposure +
  plan preview *without persisting* (Steps 4–5).
- `createMigrationAction` — persists `MigrationJob` + seeded `MigrationStep` rows
  from `buildPlan`, returns the id.
- `advanceMigrationAction` — one orchestrator step; the job page polls in a loop
  until `awaiting_approval`/terminal.
- `getMigrationJobAction` — job + steps + recent logs + artifacts (poll source).
- `approveMigrationAction` / `rollbackMigrationAction`.

Audit: new `MIGRATION_*` entries in `AUDIT_ACTIONS` + a `migration` target type;
create/approve/rollback/complete write audit events. Navigation: a `Migrations`
entry in `MODULES` and a sidebar item (Infrastructure section, `ArrowLeftRight`
icon).

## Testing (Vitest, TDD)

- `planner.test.ts` — migrate emits the exact 12-step sequence; clone emits the
  exact 5-step sequence; **identical output regardless of input** beyond the type.
- `migration.test.ts` (lib) — exposure classification + default flags; sslip.io
  helpers; status/type maps.
- `migration-validation.test.ts` — schema accept/reject; duplicate name hard-fail.
- `validation.test.ts` — each of the five checks pass/fail against the mock provider.
- `orchestrator.test.ts` — one-step-per-`advance`; volume steps `skipped` when no
  volumes and `success` when present; `provision` consumes the snapshot; failure
  marks step+job `failed` and a retry bumps `attemptNumber`; `await_approval`
  halts; full happy-path reaches `completed`; resume from `currentStepKey` after a
  simulated restart.
- `approval.test.ts` — approve only from `awaiting_approval` → `cutting_over`;
  rollback compensations (destination deleted, source restarted, `rolled_back`);
  approve/rollback rejected outside `awaiting_approval`.

## Build order (incremental, each green slice committed)

1. Prisma models + migration; `src/lib/migration.ts` constants/helpers (TDD).
2. `planner.ts` (TDD) — pure step catalogs.
3. `PlatformProvider` + `MockCoolifyProvider`; `VolumeTransferService` +
   `MockVolumeTransfer`; domain `types.ts` + `MigrationError`.
4. `ValidationService` (TDD).
5. `MigrationOrchestratorService` (TDD) — handlers, skip logic, snapshot capture,
   artifacts, resume.
6. `ApprovalService` (TDD) — approve/rollback + compensation.
7. Validation schemas + server actions + audit constants.
8. Wizard + list + job-view UI; `MODULES`/nav entry; final verify.

## What this guarantees

Manual approval gates cutover · temporary URLs always generated · no automatic
traffic switch · source intact (stopped, never deleted) until approval · resumable
and DB-recoverable · and — because the destination is provisioned from the exact
captured snapshot the user validates — the resource validated is precisely the
resource that becomes production.
