---
title: API & Health
description: The /api/health liveness endpoint and the integration health checks.
category: Reference
order: 5
---

ALIM is a web application rather than a public API, but it exposes one HTTP endpoint for monitoring, plus an in-app integration health view.

## `GET /api/health`

A public (unauthenticated) liveness probe — it is on the middleware allowlist so it works for Docker/Coolify healthchecks.

- Runs `SELECT 1` against ALIM's metadata database to confirm connectivity.
- **Healthy** → `200` with `{ "status": "ok", "uptimeSeconds": <process uptime> }`.
- **Degraded** → `503` with `{ "status": "degraded", "database": "unreachable", "uptimeSeconds": … }`.
- Always returns promptly (never hangs), so it is safe as a liveness/readiness check.

`uptimeSeconds` is the Node process uptime (`process.uptime()`), useful for spotting restarts. The command bar polls this endpoint to show live status and uptime.

The bundled `docker-compose.yml` uses it as the app healthcheck, and `depends_on` ensures the database is healthy first.

## Integration health

Beyond the liveness probe, ALIM checks the configured integrations (surfaced in the command bar via the `getIntegrationsHealth()` service). For each of **Coolify**, **Nginx Proxy Manager**, and **Cloudflare** it reports:

- `configured` — whether credentials are present.
- `ok` — whether a live test connection succeeded.
- `detail` — a version string, "Connected", or an error message.

When Coolify is configured and healthy, it additionally lists each Coolify **server** and whether it is reachable. Checks run in parallel and degrade gracefully — an unreachable integration reports `ok: false` with the error rather than failing the whole view.
