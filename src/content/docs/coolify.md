---
title: Coolify
description: Create, configure, and deploy applications through the Coolify API.
category: Modules
order: 3
---

The Coolify module (`/coolify`) is a client for the [Coolify](https://coolify.io) API. It lets you discover projects and servers, create and configure applications, manage their environment variables, and trigger deployments.

## Capabilities

- **Applications** — list, view details, create (from a public Git repo, or a private repo via a configured GitHub App), update configuration, and delete.
- **Deployments** — trigger a build/deploy and track its status.
- **Environment variables** — list, set a single variable, and bulk-upsert.
- **Application config** — domains, build/start commands, base/publish directory, build pack, exposed ports.
- **Discovery** — list projects (with environments) and servers to populate creation forms.
- **Lifecycle** — start/stop/delete applications; manage docker-compose services and databases (start/stop/delete).

Application detail surfaces status, Git repo/branch, build pack, exposed ports, health-check settings, resource limits, pre/post-deploy commands, storage, and deployment history.

## Configuration

Configure on the [Settings](/docs/settings) page (encrypted), or via environment variables as a fallback:

| Setting key | Env fallback | Purpose |
| --- | --- | --- |
| `coolify.baseUrl` | `COOLIFY_BASE_URL` | Root URL of your Coolify instance (no trailing `/api/v1`). |
| `coolify.apiToken` | `COOLIFY_API_TOKEN` | API token with application permissions (encrypted at rest). |

Settings take precedence over env vars. The token is never returned to the browser; on update, leaving the token field blank keeps the existing value. Use the **Test connection** button in Settings (which calls `GET /version`) to verify.

## API surface

All calls are made under `/api/v1` on your configured base URL. Representative endpoints:

- `GET /version` — connection test.
- `GET /applications`, `GET /applications/{uuid}` — list / detail.
- `POST /applications/public`, `POST /applications/private-github-app` — create.
- `PATCH /applications/{uuid}` — update config.
- `POST /deploy?uuid=…` — trigger a deployment; `GET /deployments/{uuid}` — status.
- `GET|POST /applications/{uuid}/envs`, `PATCH /applications/{uuid}/envs/bulk` — env vars.
- `GET /projects`, `GET /servers`, `GET /servers/{uuid}/resources` — discovery.
- `POST /applications/{uuid}/start|stop`, `DELETE /applications/{uuid}` — lifecycle.
- `GET|POST /services`, `POST /services/{uuid}/start|stop`, `DELETE /services/{uuid}` — docker-compose services.
- `GET /databases`, `POST /databases/{uuid}/start|stop`, `DELETE /databases/{uuid}` — databases.

## Validation highlights

- Base URL and Git repository must be valid URLs (trailing slashes stripped).
- Build pack is one of `nixpacks`, `dockerfile`, `static`, `dockercompose`.
- Environment-variable keys must match `^[A-Za-z_][A-Za-z0-9_]*$`; values up to 10,000 chars.
- Domains up to 500 chars; build/start commands up to 2,000 chars.

## Audit

Coolify mutations record `coolify.config.save`, `coolify.app.create`, `coolify.app.deploy`, and `coolify.env.update` in the [Audit Log](/docs/audit-log).

Coolify is also the backbone of the [Deployments](/docs/deployments) wizard and the [Migrations](/docs/migrations) engine.
