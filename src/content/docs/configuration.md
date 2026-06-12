---
title: Configuration
description: Every environment variable, and how env vars and in-app Settings interact.
category: Getting Started
order: 3
---

ALIM is configured through environment variables and, for integration credentials, the in-app [Settings](/docs/settings) page. This page is the complete reference.

## Environment variables

### Core

| Variable | Purpose | Required | Default |
| --- | --- | --- | --- |
| `DATABASE_URL` | ALIM's own metadata database connection string. | **Yes** | `postgresql://dbprovisioner:dbprovisioner@localhost:5432/dbprovisioner?schema=public` |
| `ENCRYPTION_KEY` | 32-byte AES-256-GCM key (base64 or hex) for encrypted Settings and Secrets. Also the fallback signing key for sessions. | Recommended | _empty_ |
| `PROVISIONED_BY` | Actor label used in the audit log when there is no authenticated request context (scripts, jobs). | No | `internal-admin` |

`ENCRYPTION_KEY` accepts a 44-character base64 string or a 64-character hex string (both decode to 32 bytes). Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Authentication

| Variable | Purpose | Required | Default |
| --- | --- | --- | --- |
| `AUTH_MODE` | `password`, `proxy`, or `both`. There is no `none`. | No | `password` |
| `AUTH_PASSWORD` | Shared sign-in password. | When mode includes `password` | _empty_ |
| `AUTH_SECRET` | HMAC key that signs session cookies. | When mode includes `password` | falls back to `ENCRYPTION_KEY` |
| `AUTH_ADMIN_USERNAME` | Default username/actor label for password sessions (attribution only). | No | `admin` |
| `AUTH_SESSION_TTL` | Session lifetime. Plain seconds or suffixed: `30m`, `12h`, `7d`. | No | `7d` |
| `AUTH_PROXY_HEADER` | Request header carrying the proxy-authenticated identity. | No | `X-Forwarded-User` |
| `AUTH_PROXY_SHARED_SECRET` | Anti-spoof secret the proxy must also send (in `x-alim-proxy-secret`). | No | _empty_ (disabled) |

See [Authentication](/docs/authentication) for how these combine, and the fail-closed behavior when a password mode is missing its inputs.

### Target PostgreSQL servers (legacy fallback)

These are an **optional fallback**. The preferred path is to configure each environment's connection string on the [Settings](/docs/settings) page (stored encrypted). The `POSTGRES_*_URL` variables are used only for the original three environments when no encrypted value has been saved.

| Variable | Purpose |
| --- | --- |
| `POSTGRES_PROD_URL` | Admin connection string for the production target. |
| `POSTGRES_STAGING_URL` | Admin connection string for the staging target. |
| `POSTGRES_DEV_URL` | Admin connection string for the development target. |

Format: `postgresql://<admin_user>:<admin_password>@<host>:<port>/postgres`. These must be **superuser** (or at least `CREATEDB` + `CREATEROLE`) connections — typically to the maintenance `postgres` database on each server.

### Integrations (optional fallback)

The preferred path for all integration credentials is the [Settings](/docs/settings) page (encrypted at rest, requires `ENCRYPTION_KEY`). These env vars are used only when no in-app value is set.

| Variable | Integration |
| --- | --- |
| `COOLIFY_BASE_URL`, `COOLIFY_API_TOKEN` | [Coolify](/docs/coolify) |
| `NPM_BASE_URL`, `NPM_IDENTITY`, `NPM_SECRET` | [Proxy Hosts / NPM](/docs/proxy-hosts) |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | [Cloudflare](/docs/cloudflare) |

### Runtime / Docker

| Variable | Purpose | Default |
| --- | --- | --- |
| `NODE_ENV` | Next.js environment. | `production` in the image |
| `PORT` | HTTP port. | `3000` |
| `HOSTNAME` | Bind address. | `0.0.0.0` |
| `NEXT_TELEMETRY_DISABLED` | Disables Next.js telemetry. | `1` in the image |
| `APPDB_PASSWORD` | Password for the bundled `appdb` service (docker-compose only). | `dbprovisioner` |

## Configuration resolution order

ALIM resolves configuration with **Settings first, environment variable second**:

1. **Target connection strings** — encrypted Setting `postgres.<ENV_KEY>.url` first, then `POSTGRES_<ENV>_URL`. If neither is set, the environment shows as _not configured_.
2. **Integration credentials** (Coolify / NPM / Cloudflare) — encrypted Settings first, then the corresponding env var.
3. **Authentication** — environment variables only (parsed once per request by the middleware). If a password mode is configured without `AUTH_PASSWORD` and a signing secret, config loading throws and the gate **fails closed**.

This lets you bootstrap from environment variables and later move credentials into the encrypted Settings store without downtime.

## Notes on secrets handling

- Integration credentials and per-environment connection strings are **write-only** in the UI: once saved they are never echoed back to the browser, only re-saved.
- Provisioned-database passwords are never stored at all.
- All encrypted values use AES-256-GCM; rotating `ENCRYPTION_KEY` invalidates previously stored ciphertext (it will read back as "not set"). See [Security](/docs/security).
