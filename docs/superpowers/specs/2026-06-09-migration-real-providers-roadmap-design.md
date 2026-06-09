# Design: Migration Engine, Real Provider Roadmap (Phases A to F)

**Date:** 2026-06-09
**Status:** Approved scope. Supersedes the "mock only" framing of the foundation spec for forward work.
**Predecessor:** `2026-06-09-migration-engine-foundation-design.md` (the foundation; architecture unchanged).

## Context

The Migration Engine Foundation is built and merged: `MigrationJob` is the source
of truth, `MigrationStep` gives resumability, `MigrationLog` gives auditing,
`MigrationArtifact` tracks outputs, the planner is pure, the orchestrator advances
exactly one step per call, and `ApprovalService` owns approval and rollback. All
external work sits behind two interfaces, `PlatformProvider` and
`VolumeTransferService`, currently backed by `MockCoolifyProvider` and
`MockVolumeTransfer`.

A Coolify API audit (against `routes/api.php` and the OpenAPI spec) confirmed that
10 of the 12 provider methods are fully achievable through the official API, that
host capacity metrics are not in the API (SSH only), and that volume data movement
is SSH only while volume detection is API-based.

This spec defines the roadmap to replace the mocks with real implementations,
phase by phase, without redesigning the foundation.

## Validated architecture (unchanged)

The audit validated, and this roadmap preserves without modification:

- `MigrationJob` is the source of truth.
- `MigrationStep` enables resumability; `MigrationLog` provides persistent auditing;
  `MigrationArtifact` is part of the schema.
- `PlatformProvider` is the orchestration boundary; `VolumeTransferService` is the
  data transfer boundary.
- The planner is a pure function; the orchestrator owns execution; `ApprovalService`
  owns approval and rollback.
- Execution advances exactly one step per call; all progress survives application
  restarts and page reloads.

No orchestrator, planner, UI flow, or state-machine redesign occurs. Changes are
additive (new fields, a new registry, a new SSH module) or are swaps of an
implementation behind an existing interface.

## Guiding principle and success criterion

Evolve by swapping implementations behind existing interfaces. The provider-swap
success criterion is that this line:

```
export const platformProvider: PlatformProvider = mockCoolifyProvider;
```

becomes:

```
export const platformProvider: PlatformProvider = coolifyPlatformProvider;
```

with no orchestrator, planner, UI, or state-machine modifications. Phases B to F
add capabilities (resource types, an expanded create spec and wizard fields, a host
credential registry, an SSH module, real volume transfer); these are additive and
do not redesign the foundation.

## Decisions (resolved during scope adjustment)

1. **createResource sequencing: infer in A, formalize in C.** Phase A's
   `createResource` infers `projectUuid`, `environmentName`, and `resourceType` from
   the source snapshot and resolves the destination server's default
   destination/network via `GET /servers/{uuid}`, so same-Coolify migrations need no
   new user input. Phase B adds the explicit type discriminator; Phase C exposes the
   targeting fields as overridable wizard inputs.
2. **Async deploy: block inside `deployResource`.** It triggers the deploy, polls the
   Coolify deployment endpoint until success or failure (with a timeout), and throws
   on failure. The orchestrator's existing `deploy` step simply awaits it. No planner
   or state-machine change. The step becomes a multi-minute action, acceptable on
   ALIM's always-on Node server.
3. **`switch_endpoints` stays a no-op this phase.** Real endpoint switching (Coolify
   fqdn swap, NPM, Cloudflare) is deferred to a later dedicated phase. Existing mocked
   endpoint behavior is unchanged.
4. **SSH uses fixed command templates, not raw binaries.** The SSH module exposes a
   closed set of parameterized command templates with validated and escaped inputs.
   The raw `docker` binary is never exposed for arbitrary args.

Settled clarifications:

- `getHostCapacity` returns reachability only in Phase A. `ValidationService` keeps
  `host_exists` and `reachable` as hard checks and demotes `disk` and `memory` to
  advisory: populated only once SSH (Phase E) can supply them, otherwise omitted, and
  never blocking. This is a contained `ValidationService` plus Step 4 display change.
- `resourceType` is an additive `MigrationJob` column (default `application`) plus a
  field on the snapshot, create spec, and provider contracts, added by one Prisma
  migration.

## Coolify API compatibility summary

Source of truth: Coolify `routes/api.php`. Verify exact verbs and DELETE query flags
against the running instance version before implementing each method.

| Method | API | SSH | Endpoint / strategy |
|---|---|---|---|
| `listHosts` | Yes | No | `GET /servers` -> `{uuid,name,ip}` |
| `getHostCapacity` | Reachability only | Yes (Phase E) | `GET /servers/{uuid}/validate` for reachable; disk/memory via SSH `free -b`, `df -B1` |
| `listResources` | Yes | No | `GET /resources` (unified), or `GET /applications` + `/services` |
| `inspectResource` | Yes | No | `GET /applications/{uuid}` + `/envs` + `/storages` |
| `resourceExistsOnHost` | Yes | No | `GET /servers/{uuid}/resources`, match by name |
| `createResource` | Yes | No | `POST /applications/{public,dockerfile,dockerimage,private-*}` or `/services` or `/databases/*` by type; then `PATCH /applications/{uuid}/envs/bulk` and `POST /applications/{uuid}/storages` |
| `deployResource` | Yes | No | `POST /deploy?uuid=`; poll `GET /deployments/{uuid}` to completion |
| `generateValidationUrl` | Yes | No | Read auto-assigned sslip fqdn from `GET /applications/{uuid}`, or `PATCH` to set one, after successful deploy |
| `stopResource` | Yes | No | `POST /applications/{uuid}/stop` (or `/services`, `/databases`) |
| `startResource` | Yes | No | `POST /applications/{uuid}/start` |
| `switchEndpoints` | Deferred | No | Stays a no-op this phase |
| `deleteResource` | Yes | No | `DELETE /applications/{uuid}` with cleanup query flags |

Volume data movement (`VolumeTransferService.archive/transfer/restore`) is SSH only;
volume detection stays in `PlatformProvider.inspectResource` via `/storages`.

---

## Phase A: Real Coolify API Provider

**Objective:** Replace `MockCoolifyProvider` with `CoolifyPlatformProvider` using only
official Coolify APIs. No SSH.

**Methods implemented for real:** `listHosts`, `listResources`, `inspectResource`,
`resourceExistsOnHost`, `createResource` (inference-based, per Decision 1),
`deployResource`, `generateValidationUrl`, `stopResource`, `startResource`,
`deleteResource`. `getHostCapacity` returns reachability only. `switchEndpoints`
stays a no-op.

**Approach:**
- Extend the existing `coolify/client.ts` and `coolify/service.ts` (already proving
  `/version`, `/applications`, `/applications/public`, `/deploy`, `/projects`,
  `/servers`) with the remaining endpoints in the matrix, each typed.
- `deployResource` is blocking and polls deployment status (Decision 2). The
  validation URL is surfaced only after a successful deploy.
- `createResource` infers project, environment, and type from the source snapshot and
  resolves the destination server's default destination/network.
- `ValidationService` capacity checks become advisory (settled clarification).
- Swap `platformProvider = coolifyPlatformProvider`.

**Unchanged:** orchestrator, planner, state machine, UI flow, schema (other than the
advisory display tweak).

## Phase B: Resource Type Support

**Objective:** Make the provider layer resource-type aware.

Add a `ResourceType` discriminator with values `application`, `service`, `database`.
It becomes part of the resource snapshot, `CreateResourceSpec`, `MigrationJob` (a new
column, default `application`, one Prisma migration), and the `PlatformProvider`
contracts. Provider methods dispatch to the correct Coolify endpoint family by type
(`/applications/*`, `/services/*`, `/databases/*`).

## Phase C: CreateResourceSpec Expansion and Wizard Updates

**Objective:** Make destination targeting explicit and overridable.

Expand `CreateResourceSpec` to include: `resourceType`, `resourceName`,
`sourceResourceId`, `sourceSnapshot`, `destinationServerUuid`, `projectUuid`,
`environmentName`, `destinationUuid`, `networkUuid`, `exposure`, `npmEnabled`,
`cloudflareEnabled`. Update the wizard to collect or default these. Defaults are
inferred from the source snapshot and the destination server wherever they can be
inferred safely (the same inference Phase A uses internally), so the wizard only
prompts when inference is ambiguous.

## Phase D: Host Credential Registry

**Objective:** Make SSH access an explicit, provider-agnostic ALIM concern.

Introduce a Host Credential Registry. Each host entry has: a host identifier, a
hostname, an IP address, an SSH port (default 22), an SSH username (default `root`),
a private key reference, and a provider type (default `coolify`; future
`docker-compose`, `portainer`, `dokploy`). Private keys are stored using ALIM's
existing Secrets infrastructure and referenced by id; Coolify's own SSH keys are not
relied upon because private keys are not exposed via the API. Entries correlate to
Coolify servers by IP (and optionally store the Coolify server uuid). Designed for
future provider expansion beyond Coolify.

## Phase E: SSH Execution Module

**Objective:** A dedicated SSH module that executes a closed set of allow-listed
command templates, streams logs, and surfaces structured failures.

Per Decision 4, no raw binary passthrough and no arbitrary command execution. Initial
templates cover: capacity (`free -b`, `df -B1 <docker-data-root>`), and the volume
operations used by Phase F (`docker volume inspect/ls`, archive/restore via
`docker run --rm -v <vol>:/v alpine tar ...`, and `rsync` between hosts). All
interpolated values are validated and escaped. The module reads credentials from the
Host Credential Registry (Phase D).

## Phase F: Real VolumeTransferService

**Objective:** Replace `MockVolumeTransfer` with a real implementation over the SSH
module (Phase E).

Responsibilities: archive volumes, transfer archives, restore volumes. Volume
detection stays in `PlatformProvider` (via `/storages`); volume movement stays in
`VolumeTransferService`. The two boundaries remain separate.

---

## Host capacity revision

Capacity checks are advisory, not mandatory. Migration remains possible without SSH.

- Without SSH (Phase A onward): validation verifies only that the destination host
  exists and is reachable.
- With SSH (Phase E onward): available disk and available memory may be displayed as
  advisory information. They inform the user and never block a migration.

## Endpoint switching

Endpoint switching remains out of scope for this roadmap. `switch_endpoints` stays a
no-op. Coolify-managed domains may be updated through Coolify APIs in a later
dedicated phase. NPM and Cloudflare integration remain deferred. Existing mocked
endpoint providers are unchanged.

## Implementation order and dependencies

Phase A, then B, then C, then D, then E, then F.

Note the one cross-phase dependency: Phase A's `createResource` works via inference,
so A is independently shippable and achieves the clean provider swap. Phase B
formalizes the type discriminator and Phase C exposes explicit targeting fields and
wizard overrides; together they replace A's inference with explicit, user-controllable
inputs. Phases D, E, and F are the SSH track, required only for volume transfer and
advisory capacity, and do not block the API-only Phases A to C.

## Out of scope

Real endpoint switching (Coolify fqdn swap, NPM, Cloudflare), database and Redis
migration, infrastructure dashboards, and any orchestrator, planner, UI flow, or
state-machine redesign.

## Success criteria

- The provider swap line changes from `mockCoolifyProvider` to
  `coolifyPlatformProvider` with no orchestrator, planner, UI, or state-machine
  changes.
- Same-Coolify migrations (server to server) run end to end through the real API:
  validate, stop source, provision, deploy (polled to completion), generate validation
  URL, await approval, delete source (cutover deferred as a no-op).
- Capacity is advisory; migrations are possible without SSH.
- Volume transfer, once Phases D to F land, moves real Docker volume data over SSH
  with detection still driven by the API.
