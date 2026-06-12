---
title: Getting Started
description: Install dependencies, configure the environment, and run ALIM locally or with Docker.
category: Getting Started
order: 2
---

This guide gets ALIM running on your machine and signs you in for the first time.

## Prerequisites

- **Node.js 20** (the Docker image uses `node:20-bookworm-slim`).
- **PostgreSQL** for ALIM's own metadata database. The bundled `docker-compose.yml` provides one (`postgres:16-alpine`); for local dev you can also point at any reachable PostgreSQL.
- Optional: a **Coolify**, **Nginx Proxy Manager**, and/or **Cloudflare** account if you want to use those integrations.

## 1. Install

```bash
git clone https://github.com/aspyrelabs/alim.git
cd alim
npm install
```

`npm install` runs `prisma generate` automatically (via the `postinstall` hook).

## 2. Configure the environment

Copy the example file and fill it in:

```bash
cp .env.example .env
```

The **minimum to run** (with the default password auth mode) is three values:

1. `DATABASE_URL` — ALIM's own metadata database. The docker-compose default works as-is.
2. `AUTH_PASSWORD` — the shared sign-in password. ALIM refuses to serve any page until this is set.
3. `AUTH_SECRET` — the key that signs session cookies. You can set `ENCRYPTION_KEY` instead and `AUTH_SECRET` will fall back to it.

Generate a strong key for `AUTH_SECRET` / `ENCRYPTION_KEY`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

A minimal `.env` for local development:

```bash
DATABASE_URL="postgresql://dbprovisioner:dbprovisioner@localhost:5432/dbprovisioner?schema=public"
ENCRYPTION_KEY="<paste the generated 32-byte base64 key>"
AUTH_MODE="password"
AUTH_PASSWORD="change-me-locally"
AUTH_ADMIN_USERNAME="admin"
```

See [Configuration](/docs/configuration) for the complete list of variables.

## 3. Create the database schema

With `DATABASE_URL` pointing at a running PostgreSQL, apply the migrations:

```bash
# development (creates the DB if needed, applies migrations)
npm run prisma:migrate:dev

# or, against an already-provisioned database
npm run prisma:migrate
```

## 4. Run the dev server

```bash
npm run dev
```

ALIM starts on [http://localhost:3000](http://localhost:3000).

## 5. Sign in

Because authentication is always on, the first request redirects you to `/login`. Enter:

- **Username** — prefilled with `admin` (this is attribution only; it labels your actions in the audit log).
- **Password** — the `AUTH_PASSWORD` you set.

After signing in you land on the dashboard. Your username appears in the top-right of the command bar with a sign-out button.

## Running with Docker Compose

The bundled stack runs ALIM plus its metadata database together:

```bash
# set at least AUTH_PASSWORD and ENCRYPTION_KEY in your environment or an .env file
docker compose up --build
```

The compose stack:

- starts an `appdb` PostgreSQL 16 service with a persistent volume,
- waits for it to become healthy,
- runs `prisma migrate deploy` on startup (via `docker-entrypoint.sh`),
- serves ALIM on port 3000 with a `/api/health` healthcheck.

See [Deployment](/docs/deployment) for production guidance, including deploying to Coolify and putting ALIM behind a reverse proxy.

## Next steps

- Define your **environments** (production, staging, …) and add target-server connection strings in [Settings](/docs/settings).
- Connect **Coolify / NPM / Cloudflare** credentials in [Settings](/docs/settings).
- Provision your first database — see [Databases](/docs/databases).
