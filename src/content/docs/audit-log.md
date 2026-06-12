---
title: Audit Log
description: An append-only record of every state-changing action across the platform.
category: Modules
order: 10
---

The Audit Log (`/audit`) is an append-only record of every state-changing action ALIM performs, with the actor, target, outcome, and structured context.

## What is recorded

Each entry (`AuditLog` table) has:

| Field | Meaning |
| --- | --- |
| `createdAt` | When the action happened (indexed). |
| `actor` | Who did it (see attribution below). |
| `action` | The action key, e.g. `database.provision`, `secret.reveal`. |
| `targetType` | The kind of resource, e.g. `database`, `secret`, `environment`. |
| `targetId` | The specific resource id, when applicable. |
| `summary` | A human-readable description. |
| `metadata` | Structured extra context (JSON), e.g. `{ category: "API Token" }`. |
| `success` | `true` for normal operations; `false` for recorded failures. |
| `environment` | The environment key, when the action is scoped to one. |

## Actor attribution

The actor is resolved in priority order:

1. the **authenticated user** for the request (the proxy identity, or the password-session username) — see [Authentication](/docs/authentication);
2. the `PROVISIONED_BY` environment variable, for code that runs outside a request (scripts, jobs);
3. the static default `internal-admin`.

## Best-effort and append-only

Audit writes are **best-effort**: a failure to record (e.g. the database is briefly unavailable) is logged to the server console but never propagates into the operation it was recording. A secret deletion still succeeds even if its audit row fails to write.

The table has **no foreign keys** by design, so audit entries survive the deletion of the resources they reference, and an audit write can never fail a real operation.

## Filtering

The viewer lists newest-first (up to 200 rows by default) and filters by **action**, **actor**, and **target type**, plus a date range. Action keys have friendly labels (e.g. `secret.reveal` → "Revealed secret").

## The action vocabulary

Actions are grouped by area, including:

- **Databases** — `database.provision`, `database.drop`.
- **Coolify** — `coolify.config.save`, `coolify.app.create`, `coolify.app.deploy`, `coolify.env.update`.
- **Environments** — `environment.create|update|delete|reorder`.
- **Settings** — `settings.update`.
- **Secrets** — `secret.create|update|delete|reveal`.
- **NPM** — `npm.config.save`, and `create|update|delete|toggle` for proxy hosts, redirections, streams, and dead hosts, plus `npm.certificate.request|delete`.
- **Cloudflare** — `cloudflare.config.save`, `cloudflare.tunnel.create|delete|route_update`, `cloudflare.dns.create|update|delete`, `cloudflare.tls.update`.
- **Deployments & migrations** — `deployment.run`, `migration.create|approve|rollback|complete|clear|retry|delete`.
- **Host credentials** — `host_credential.save|delete`.

Target types include `database`, `coolify_app`, `environment`, `setting`, `secret`, the NPM resource types, `cf_tunnel`, `cf_dns_record`, `cf_zone`, `deployment`, `migration`, and `host_credential`.
