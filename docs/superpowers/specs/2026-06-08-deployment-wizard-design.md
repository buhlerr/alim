# Design: Deployment Wizard module

**Date:** 2026-06-08
**Status:** Approved (Phase 5, capstone) — user pre-authorized full build.
**Author:** designed against the existing modules.

## Context

Phase 5 is the capstone: a single guided flow that orchestrates the modules
already built — **Database**, **Coolify**, and **Cloudflare** — to stand up an
application end to end. Unlike Phases 2–4, this is **not** a new external
integration; it composes the existing services. No new external client, no new
Prisma model.

## Scope

One deployment runs up to three steps, each **optional** and **gated** on
whether its module is configured:

1. **Database** — provision a PostgreSQL database + user in a chosen environment
   (reuses `postgresProvisioner` + `registryService`, deriving names from the
   app name like the existing create flow).
2. **Coolify app** — create a public application and trigger a deploy
   (`coolifyService.createApplication` + `deploy`).
3. **Cloudflare DNS** — create a DNS record pointing at the app
   (`cloudflareService.dns.create`).

Steps run in order; a failure in one is recorded and the remaining steps still
run (they're independently useful). The result is a per-step report
(success / failed / skipped, with a detail line and the DB connection string
shown once).

## Architecture

### Orchestrator (the heart — pure, testable)
- **`src/services/deployment/types.ts`** — `DeploymentPlan`, `DeploymentStep`
  result (`{ key, label, status: "success" | "failed" | "skipped", detail?,
  error? }`), `DeploymentResult { steps, ok }`.
- **`src/services/deployment/orchestrator.ts`** — `runDeployment(plan)`:
  - Database step: resolve the environment (for its abbreviation), derive
    db/user names (`deriveDatabaseName`/`deriveUsername`), generate a password
    (`generatePassword`), call `postgresProvisioner.provision`, then
    `registryService.record`. Detail = connection string (shown once).
  - Coolify step: `createApplication(req)` then `deploy(uuid)`.
  - Cloudflare DNS step: `dns.create(zoneId, record)`.
  - Each step wrapped: enabled? run → success/failed; disabled? skipped. Always
    returns the full step list; `ok` = no step failed. Errors are caught and
    reduced to safe messages (reuses each module's typed error).

Importing the underlying *services* (not the server actions) keeps the
orchestrator free of `revalidatePath`/per-action audit and makes it unit-testable
by mocking those service modules.

### Validation, action, page
- **`src/lib/deployment-validation.ts`** — `deploymentPlanSchema`: app name +
  per-step toggles and fields (database: environment; coolify: project/server/
  git repo/branch/build pack/port/domain; dns: zone/type/name/content/proxied).
  Reuses field rules from the existing Coolify/Cloudflare schemas.
- **`src/app/actions/deploy.ts`** — `runDeploymentAction(input)` validates,
  calls `runDeployment`, records one `deployment.run` audit event summarizing the
  outcome, and returns the `DeploymentResult`. Plus `getDeploymentOptionsAction`
  (environments + module-configured flags + Coolify projects/servers + zones) to
  populate the form.
- **`/deploy`** — a sectioned wizard (client component): Application basics, then
  a toggleable card per system (each disabled with a "configure in Settings"
  note when its module is off). A **Deploy** button runs the action and renders
  the per-step result report. The DB connection string is shown once with a copy
  button.
- **Settings/registry** — flip the `deployment` module to `available` with a
  `/deploy` nav entry. Add a `deployment.run` audit action + `deployment` target
  type and label.

## Testing (Vitest, TDD)

- `src/services/deployment/orchestrator.test.ts` — mock `postgresProvisioner`,
  `registryService`, `coolifyService`, `cloudflareService`,
  `environmentsService`: runs only enabled steps; skipped steps reported;
  a failing step is marked failed but later steps still run; `ok` reflects
  failures; DB step derives names and surfaces the connection string.
- `src/lib/deployment-validation.test.ts` — accept/reject, per-step required
  fields only when that step is enabled.

## Build order (incremental, each green slice committed)

1. Orchestrator types + `runDeployment` (TDD). 2. Validation + action + audit
constant. 3. Wizard page + UI. 4. Module registry flip + final verify.

## Out of scope (YAGNI)

- NPM proxy-host step (Cloudflare DNS covers public exposure for v1; NPM remains
  available on its own page).
- Rollback/undo of partially-completed deployments (results are reported; the
  operator cleans up via each module's page).
- Saved/reusable deployment templates and scheduling.
