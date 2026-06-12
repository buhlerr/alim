---
title: Deployment
description: Build and run ALIM in production — Docker, Compose, Coolify, and reverse proxies.
category: Operations
order: 1
---

ALIM ships as a self-contained Docker image and a `docker-compose.yml` for the full stack. This page covers running it in production.

## The Docker image

The `Dockerfile` is a multi-stage build on `node:20-bookworm-slim` (Debian slim — chosen over Alpine for painless Prisma + `pg`/OpenSSL compatibility):

1. **base** — installs `openssl` (required by Prisma's engine at runtime), disables Next telemetry.
2. **deps** — `npm ci` with `prisma/` present so the `postinstall` `prisma generate` runs.
3. **builder** — `npm run build` (`prisma generate && next build`), producing the `.next/standalone` output.
4. **runner** — copies the standalone server, static assets, and the Prisma CLI + schema (so migrations can run on boot), runs as a non-root `nextjs` user, exposes `3000`, and starts via `docker-entrypoint.sh`.

`next.config.ts` sets `output: "standalone"` for a small image, marks `pg` and `ssh2` as external packages, and force-includes the `/docs` Markdown content in the standalone trace.

### Startup: migrations on boot

`docker-entrypoint.sh` runs database migrations before starting the server:

```sh
#!/bin/sh
set -e
node_modules/.bin/prisma migrate deploy
exec "$@"   # node server.js
```

`prisma migrate deploy` is a no-op when the schema is already current, so it is safe to run on every boot.

## Docker Compose (full stack)

`docker-compose.yml` runs ALIM plus a bundled PostgreSQL 16 metadata database:

- **`appdb`** — `postgres:16-alpine` with a persistent `appdb-data` volume and a `pg_isready` healthcheck.
- **`app`** — built from the Dockerfile, depends on `appdb` being healthy, and exposes `3000`. Its healthcheck polls `/api/health` every 30s.

Provide your secrets via the environment or an `.env` file. At minimum set `AUTH_PASSWORD` and `ENCRYPTION_KEY`; optionally `POSTGRES_*_URL`, `APPDB_PASSWORD`, and integration credentials. See [Configuration](/docs/configuration).

```bash
docker compose up --build -d
```

## Deploying to Coolify

Two patterns work well:

1. **Coolify-managed metadata database** — create a PostgreSQL resource in Coolify, point `DATABASE_URL` at it, and deploy ALIM as a single application (using the Dockerfile). Omit the bundled `appdb`.
2. **Bundled compose** — deploy the full `docker-compose.yml` and let Coolify build and manage both services.

Either way, set the environment variables in Coolify (they are never shown to end users), and rely on `docker-entrypoint.sh` to migrate on boot.

## Putting ALIM behind a reverse proxy

Terminate TLS in front of ALIM and forward to port 3000. The session cookie is marked `Secure` only when the request arrives over HTTPS (ALIM checks `x-forwarded-proto`), so make sure your proxy sets that header.

If you use the reverse proxy for **authentication** (Cloudflare Access, Authelia, Authentik, oauth2-proxy, …), set `AUTH_MODE=proxy` (or `both`) and `AUTH_PROXY_HEADER` to the header your proxy emits. Crucially, ensure ALIM's port is reachable **only** through the proxy, or set `AUTH_PROXY_SHARED_SECRET` so a forged header is rejected. See [Authentication](/docs/authentication).

## Operating checklist

- Set a strong `ENCRYPTION_KEY` (and ideally a separate `AUTH_SECRET`) and keep them stable — rotating them invalidates encrypted data and sessions.
- Back up the metadata database (`appdb-data` volume / your managed Postgres).
- Keep `DATABASE_URL` and the target admin connection strings on a private network.
- Monitor `/api/health`.
