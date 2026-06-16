# Aspyre Labs Infrastructure Manager (ALIM)

## About ALIM

ALIM (Aspyre Labs Infrastructure Manager) is an open-source platform
designed to simplify infrastructure operations for self-hosted teams.

Built by Aspyre Labs.

ALIM brings the day-to-day pieces of running self-hosted infrastructure into one
place: provisioning PostgreSQL databases, running SQL safely across
environments, managing Coolify applications, configuring Nginx Proxy Manager and
Cloudflare, orchestrating end-to-end deployments, and moving resources between
servers. Every action is recorded in an audit log, and credentials are stored
encrypted.

> **Authentication is built in and on by default.** ALIM gates every route
> behind either a shared password or a reverse-proxy identity (or both). There
> is no unauthenticated mode. See [Authentication](#authentication) for setup.

![ALIM dashboard](docs/screenshots/dashboard.png)

---

## Features

### Databases
- **Create a database:** pick an environment and name the application; the
  database name, username, and a strong password (generated with Node `crypto`)
  are derived for you and remain editable.
- **Full environment set:** one action provisions an application's database and
  user across each of its environments on their respective servers.
- **Idempotent provisioning:** re-running is safe. Existing users get their
  password reset; existing databases and grants are left in place.
- **Prisma/NestJS-ready grants:** the new role is made owner of the `public`
  schema and granted privileges (including default privileges) so Prisma
  migrations and typical app frameworks work out of the box.
- **Connection strings:** the full `DATABASE_URL` is shown once, immediately
  after creation, with copy and reveal/hide controls. Passwords are never
  stored.
- **Registry:** every provisioned database is recorded and listed in a
  searchable table (by application, database, or username) with full details.

![Create a database](docs/screenshots/create.png)
![Database registry](docs/screenshots/registry.png)

### SQL Console (`/query`)
- CodeMirror editor with PostgreSQL syntax highlighting; Execute, Explain,
  Format, and Clear.
- Environment and database selectors (databases listed live from the server);
  connection strings are never exposed.
- **Safety:** reads run immediately; writes require a confirmation modal where
  you type `CONFIRM` and see the target environment and database. Each
  environment's read-only and write-confirm behavior is configurable, and a
  read-only environment blocks all writes.
- **Results:** sortable table with client-side search, pagination, copy (TSV),
  and CSV / JSON export.
- **History** and **saved queries** in the sidebar, plus a built-in admin query
  library.
- **Admin dashboard:** server overview, storage (database and table sizes), and
  performance (active queries, long-running queries, waiting locks).

![SQL Console](docs/screenshots/query.png)

### Coolify (`/coolify`)
Create, configure, and deploy applications through the Coolify API: list
projects and servers, create applications, manage environment variables, and
trigger deploys.

![Coolify](docs/screenshots/coolify.png)

### Proxy Hosts (`/npm`)
Manage Nginx Proxy Manager: proxy hosts, redirections, streams, 404 hosts,
SSL certificates, and access lists.

![Proxy Hosts](docs/screenshots/npm.png)

### Cloudflare (`/cloudflare`)
Manage Cloudflare tunnels and routes, DNS records, and TLS settings.

![Cloudflare](docs/screenshots/cloudflare.png)

### Deployments (`/deploy`)
A single guided wizard that stands an application up end to end, orchestrating
the underlying modules: provision a database, create and deploy a Coolify app,
create an NPM proxy host, and point Cloudflare DNS at it. Each step is optional
and gated on whether its module is configured.

![Deployments](docs/screenshots/deploy.png)

### Migrations (`/migrations`)
Plan, execute, and track the clone or migration of Coolify resources between
servers. A single canonical workflow validates the destination, transfers
volumes, provisions and deploys the copy, generates a temporary validation URL,
and (for a migration) waits for manual approval before cutting over and removing
the source. Progress is tracked per step and is resumable. Clone is a
non-destructive copy. (Foundation: the workflow, validation, approval gate, and
job tracking are in place; live provider integrations are being rolled out.)

![Migrations](docs/screenshots/migrations.png)

### Secrets (`/secrets`)
An encrypted vault (AES-256-GCM) for API tokens, passwords, connection strings,
and SSH keys, revealed only through an explicit reveal action.

![Secrets](docs/screenshots/secrets.png)

### Audit Log (`/audit`)
An append-only record of every state-changing action across the platform, with
filters by action, actor, and target.

![Audit Log](docs/screenshots/audit.png)

### Settings
Define your own environments (name, color, abbreviation, read-only and
write-confirm flags), configure each environment's encrypted connection string
and test it, and store the credentials for Coolify, Nginx Proxy Manager, and
Cloudflare.

![Settings](docs/screenshots/settings.png)

### Security
- Passwords are **never stored** and **never logged**.
- SQL uses **parameterized queries** for values; object names (database / role
  names) are validated against `^[a-z][a-z0-9_]*$` and quoted, so they can never
  break out of their identifier quoting.
- All form input is validated with `zod` on the server.
- Admin connection strings and integration tokens are stored encrypted or in
  environment variables and are never sent to the browser (the UI only sees
  masked or derived metadata).

---

## Authentication

Every route is gated by a single middleware choke point (`src/middleware.ts`).
There is **no unauthenticated mode** — ALIM is secure-by-default. Pick a mode
with `AUTH_MODE`:

![Sign in](docs/screenshots/login.png)

| Mode | Behaviour |
| --- | --- |
| `password` (default) | A single **shared password** gate with a signed, HTTP-only session cookie. The login form takes a username (prefilled `admin`) used purely for **audit attribution** — the password is the one shared credential. |
| `proxy` | Trust an identity header set by a reverse proxy that has already authenticated the user (Cloudflare Access, Authelia, Authentik, oauth2-proxy, …). No password is used. |
| `both` | Accept **either** (OR semantics): SSO via the proxy normally, with the shared password as a **break-glass** fallback when the proxy is misconfigured or bypassed. |

The authenticated identity (the proxy email, or the password-session username)
is recorded as the actor in the **audit log** and as `createdBy` on provisioned
databases, replacing the old static `PROVISIONED_BY` label.

**Fail-closed:** if a password-bearing mode is configured without
`AUTH_PASSWORD` and a signing secret (`AUTH_SECRET`, falling back to
`ENCRYPTION_KEY`), the gate denies every request until it is fixed.

> **Reverse-proxy security caveat.** Header trust is only safe if ALIM is
> reachable **exclusively** through the proxy; otherwise anyone who can reach
> the port can forge the identity header. When the port might be directly
> reachable, set `AUTH_PROXY_SHARED_SECRET` — the proxy must then also send it
> in the `x-alim-proxy-secret` header, and requests without it are rejected.

See `.env.example` for every `AUTH_*` variable. `/api/health` and the `/login`
page are the only unauthenticated routes.

---

## Tech stack

Next.js 15 (App Router) · TypeScript · TailwindCSS · shadcn/ui · Prisma ORM ·
PostgreSQL · `pg` · Server Actions · Docker (Coolify-compatible).

---

## Architecture

```
src/
├── lib/                  # client-safe types, validation (zod), crypto, naming
├── services/             # server-only domain logic, one folder per module
│   ├── provisioning/     # idempotent CREATE USER / DATABASE / GRANT (engine-agnostic)
│   ├── query/            # SQL Console engine (execute / explain / admin stats)
│   ├── coolify/          # Coolify API client + service
│   ├── npm/              # Nginx Proxy Manager client + service
│   ├── cloudflare/       # Cloudflare client + service
│   ├── deployment/       # cross-module deployment orchestrator
│   ├── migration/        # migration engine: planner, orchestrator, validation,
│   │                     #   approval, provider + volume-transfer boundaries
│   ├── registry.ts       # CRUD over provisioned_databases
│   ├── secrets.ts        # encrypted secrets vault
│   ├── environments.ts   # user-defined environments
│   └── audit.ts          # append-only audit log
├── app/
│   ├── actions/          # server actions per module
│   ├── (module pages)/   # dashboard, create, registry, query, coolify, npm,
│   │                     #   cloudflare, deploy, migrations, secrets, settings, audit
│   └── api/health/       # liveness probe
└── components/           # shadcn/ui + feature components
```

Each integration sits behind a typed service interface, so engines and providers
can be swapped or extended without reworking the UI or data layer. The
provisioning layer is engine-agnostic (additional engines implement the same
`Provisioner` interface), and the migration engine talks to a `PlatformProvider`
and `VolumeTransferService` so new platforms slot in without changing callers.

---

## Configuration

Copy `.env.example` to `.env` and fill in:

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | ALIM's **own** metadata database (registry, settings, audit, migrations). Separate from the servers you provision into. |
| `AUTH_MODE` | yes | `password` (default), `proxy`, or `both`. See [Authentication](#authentication). |
| `AUTH_PASSWORD` | with `password`/`both` | The shared sign-in password. **Required in the default mode** — without it the gate fails closed and every request returns `503 {"error":"authentication is misconfigured"}`. |
| `AUTH_SECRET` | with `password`/`both` | HMAC key that signs session cookies. Falls back to `ENCRYPTION_KEY` when unset, so setting `ENCRYPTION_KEY` satisfies this. Generate with the command below. |
| `ENCRYPTION_KEY` | recommended | 32-byte key (base64 or hex) for the AES-256-GCM encrypted Settings and Secrets store. Required to save integration credentials in the UI. Also serves as the `AUTH_SECRET` fallback. |
| `POSTGRES_PROD_URL` | no | Optional legacy fallback admin (superuser) connection string for the original Production environment. Prefer configuring connection strings per environment on the Settings page. |
| `POSTGRES_STAGING_URL` | no | Optional legacy fallback admin connection string for the original Staging environment. |
| `POSTGRES_DEV_URL` | no | Optional legacy fallback admin connection string for the original Development environment. |
| `COOLIFY_BASE_URL` / `COOLIFY_API_TOKEN` | no | Optional fallback Coolify credentials; the preferred path is the Settings page. |
| `PROVISIONED_BY` | no | Actor label recorded against actions in the audit log. |

Credentials for Coolify, Nginx Proxy Manager, and Cloudflare are configured in
the in-app **Settings** page (stored encrypted) and do not need environment
variables.

Each `POSTGRES_*_URL` should be a **superuser** (or at least `CREATEDB` +
`CREATEROLE`) connection to the maintenance database, e.g.:

```
postgresql://postgres:adminpw@db.internal:5432/postgres
```

Generate an encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

---

## Local development

```bash
# 1. Install dependencies (runs `prisma generate`)
npm install

# 2. Configure environment
cp .env.example .env
#   → set DATABASE_URL (a local Postgres works fine) and ENCRYPTION_KEY

# 3. Create the metadata schema
npx prisma migrate deploy        # or: npx prisma migrate dev

# 4. Run
npm run dev
```

Open http://localhost:3000 (it redirects to `/dashboard`).

A quick local metadata database via Docker:

```bash
docker run --rm -d --name alim-meta -p 5432:5432 \
  -e POSTGRES_USER=alim -e POSTGRES_PASSWORD=alim \
  -e POSTGRES_DB=alim postgres:16-alpine
```

Run the test suite:

```bash
npm test
```

---

## Docker / docker-compose

```bash
# Build and run the app plus its metadata database
docker compose up --build
```

The compose stack includes:

- `app`: the Next.js app (standalone build). On boot it runs
  `prisma migrate deploy` and then starts the server.
- `appdb`: a PostgreSQL instance for ALIM's own metadata.

The servers you provision **into** are external; configure them on the Settings
page or via the optional `POSTGRES_*_URL` fallbacks.

Health check: `GET /api/health` returns `200` when the app can reach its
metadata database.

---

## Deploying to Coolify

1. Create a new **Application** from this Git repository. Coolify will detect the
   `Dockerfile` and build it.
2. Provision a **PostgreSQL** resource in Coolify for the app's metadata, or
   bring your own. Set `DATABASE_URL` to its connection string.
3. Add environment variables:
   - `DATABASE_URL` — the metadata DB connection string.
   - `AUTH_PASSWORD` — the shared sign-in password. **Required** in the default
     `password` mode; without it every request returns
     `503 {"error":"authentication is misconfigured"}`.
   - `AUTH_SECRET` — signs session cookies. You can skip this if you set
     `ENCRYPTION_KEY` (it is used as the fallback). Generate either with:
     `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
   - `ENCRYPTION_KEY` — for the encrypted Settings/Secrets store (and the
     `AUTH_SECRET` fallback).
   - Optionally `PROVISIONED_BY` and any legacy `POSTGRES_*_URL` fallbacks.

   For SSO instead of a shared password, set `AUTH_MODE=proxy` (or `both`) and
   the `AUTH_PROXY_*` variables — see [Authentication](#authentication) and
   `.env.example`.
4. Set the health check path to `/api/health`.
5. Deploy. Migrations run automatically on container start via the entrypoint.

Define your environments, connection strings, and integration credentials on the
Settings page; you can change them there without a redeploy or code change.

---

## How provisioning works (idempotency)

For each target the PostgreSQL provisioner:

1. Validates `databaseName` and `username` against `^[a-z][a-z0-9_]*$`.
2. Ensures the role: `CREATE USER` if absent, otherwise `ALTER USER … PASSWORD`
   (password passed as a bind parameter).
3. Ensures the database: `CREATE DATABASE … OWNER` if absent (run outside a
   transaction, as Postgres requires).
4. Grants privileges (naturally re-runnable): `GRANT ALL PRIVILEGES ON DATABASE`,
   then, connected to the new database, `GRANT ALL ON SCHEMA public`,
   `ALTER SCHEMA public OWNER`, grants on all tables/sequences/functions, and
   matching `ALTER DEFAULT PRIVILEGES`.
5. Returns the connection string **in memory only**: shown once and recorded
   (without the password) in the registry.

Partial failures in a full environment set are reported per environment.

---

## License

Open source, built by Aspyre Labs.
