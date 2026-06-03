# DB Provisioner

An internal Aspyre Labs tool for provisioning PostgreSQL **databases, users, and
permissions** across multiple PostgreSQL servers (Production / Staging /
Development) from a single admin dashboard.

> **No authentication (v1).** This app is designed to run on a trusted internal
> network only. Do not expose it to the public internet.

---

## Features

- **Create a database** — pick an environment, name the application, and the
  database name, username, and a strong password are generated for you (all
  editable except the generated password is created with Node `crypto`).
- **Create a full environment set** — one click provisions `appname`,
  `appname_staging`, and `appname_dev` plus matching users on their respective
  servers.
- **Idempotent provisioning** — re-running is safe. Existing users get their
  password reset; existing databases and grants are left in place. Friendly
  errors throughout.
- **Prisma/NestJS-ready grants** — the new role is made owner of the `public`
  schema and granted privileges (including default privileges) so Prisma
  migrations and NestJS apps work out of the box.
- **Connection strings** — the full `DATABASE_URL` is shown once, right after
  creation, with copy-to-clipboard and reveal/hide controls.
- **Registry** — every provisioned database is recorded in the app's own
  database (`provisioned_databases`) and listed in a searchable table.
- **Search** — by application name, database name, or username.
- **View details** — environment, database, username, host, creation date.
- **Settings** — read-only status of each server target with a "Test
  connection" button. (Targets are configured via environment variables.)
- **SQL Query Console** (`/query`) — a lightweight embedded pgAdmin:
  - CodeMirror editor with PostgreSQL syntax highlighting; Execute / Explain /
    Format (via `sql-formatter`) / Clear.
  - Environment + database selectors (databases are listed live from the
    server). Connection strings are never exposed.
  - **Safety:** reads (SELECT/EXPLAIN/SHOW) run immediately; writes (INSERT/
    UPDATE/DELETE/DROP/TRUNCATE/ALTER/GRANT/REVOKE/…) require a confirmation
    modal where you type `CONFIRM` and see the target environment + database.
    Production writes can be hard-disabled via `POSTGRES_PROD_READONLY`.
  - **Results:** sortable table with client-side search, pagination, copy
    (TSV), and CSV / JSON export; shows rows, execution time, database, env.
  - **History** (`query_history`) and **Saved queries** (`saved_queries`) plus
    a built-in admin query library, all in the sidebar.
  - **Admin dashboard:** server overview (databases, roles, connections,
    version, uptime), storage (database & table sizes), and performance
    (active queries, long-running queries, waiting locks).

### Security

- Passwords are **never stored** and **never logged**.
- All SQL uses **parameterized queries** for values; object names (database /
  role names) are validated against `^[a-z][a-z0-9_]*$` and quoted — they can
  never break out of their identifier quoting.
- All form input is validated with `zod` on the server.
- Admin connection strings live only in environment variables and are never
  sent to the browser (the UI only ever sees masked/derived metadata).

---

## Tech stack

Next.js 15 (App Router) · TypeScript · TailwindCSS · shadcn/ui · Prisma ORM ·
PostgreSQL · `pg` · Server Actions · Docker (Coolify-compatible).

---

## Architecture

```
src/
├── lib/
│   ├── environments.ts   # client-safe Environment constants
│   ├── targets.ts        # server-only: resolves POSTGRES_*_URL per environment
│   ├── crypto.ts         # AES-256-GCM helper (future encrypted settings)
│   ├── password.ts       # crypto-strong password generator
│   ├── naming.ts         # appName → db/user name derivation
│   ├── validation.ts     # zod schemas + identifier guard
│   └── prisma.ts         # Prisma client singleton
├── services/
│   ├── provisioning/
│   │   ├── types.ts      # Provisioner interface (future: MySQL, Redis)
│   │   └── postgres.ts   # idempotent CREATE USER / DATABASE / GRANT
│   ├── registry.ts       # CRUD over provisioned_databases
│   └── query/            # SQL Console service layer (engine-agnostic)
│       ├── types.ts      # QueryEngine interface (future: MySQL/Redis/Mongo…)
│       ├── postgres.ts   # execute / explain / listDatabases / overview
│       ├── admin.ts      # admin-dashboard stat queries
│       ├── history.ts    # query_history
│       └── saved.ts      # saved_queries
├── app/
│   ├── actions/          # server actions (provision, query, …)
│   ├── dashboard/  create/  registry/  query/  settings/
│   └── api/health/       # liveness probe
└── components/           # shadcn/ui + feature components
```

The `Provisioner` interface is the seam for **future engines**: MySQL and Redis
provisioners implement the same interface, so the UI and actions don't change.
Other planned extensions (backups, read-only users, Coolify env-var generation,
an API) slot in as additional services without reworking the data layer.

---

## Configuration

Copy `.env.example` to `.env` and fill in:

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | The app's **own** metadata database (registry + settings). Separate from the servers you provision into. |
| `POSTGRES_PROD_URL` | — | Admin (superuser) connection string for the **Production** server. |
| `POSTGRES_STAGING_URL` | — | Admin connection string for the **Staging** server. |
| `POSTGRES_DEV_URL` | — | Admin connection string for the **Development** server. |
| `POSTGRES_PROD_READONLY` | — | If truthy (`1`/`true`/`yes`/`on`), the SQL Console blocks all writes against Production. |
| `ENCRYPTION_KEY` | — | 32-byte key (base64 or hex) for the future encrypted-settings store. |
| `PROVISIONED_BY` | — | Audit label recorded against provisioning actions. |

Each `POSTGRES_*_URL` should be a **superuser** (or at least `CREATEDB` +
`CREATEROLE`) connection to the maintenance database, e.g.:

```
postgresql://postgres:adminpw@db.internal:5432/postgres
```

Any target left blank simply shows as "not configured".

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
#   → set DATABASE_URL (a local Postgres works fine) and at least one POSTGRES_*_URL

# 3. Create the metadata schema
npx prisma migrate deploy        # or: npx prisma migrate dev

# 4. Run
npm run dev
```

Open http://localhost:3000 — it redirects to `/dashboard`.

A quick local metadata database via Docker:

```bash
docker run --rm -d --name dbpro-meta -p 5432:5432 \
  -e POSTGRES_USER=dbprovisioner -e POSTGRES_PASSWORD=dbprovisioner \
  -e POSTGRES_DB=dbprovisioner postgres:16-alpine
```

---

## Docker / docker-compose

```bash
# Build and run the app + its metadata database
POSTGRES_DEV_URL="postgresql://postgres:pw@dev-db:5432/postgres" \
docker compose up --build
```

The compose stack includes:

- `app` — the Next.js app (standalone build). On boot it runs
  `prisma migrate deploy` then starts the server.
- `appdb` — a PostgreSQL instance for the app's own metadata.

The three servers you provision **into** are external; pass them via
`POSTGRES_PROD_URL` / `POSTGRES_STAGING_URL` / `POSTGRES_DEV_URL`.

Health check: `GET /api/health` returns `200` when the app can reach its
metadata database.

---

## Deploying to Coolify

1. Create a new **Application** from this Git repository. Coolify will detect
   the `Dockerfile` and build it.
2. Provision a **PostgreSQL** resource in Coolify for the app's metadata, or
   bring your own. Set `DATABASE_URL` to its connection string.
3. Add environment variables: `DATABASE_URL`, the `POSTGRES_*_URL` targets you
   want, and optionally `ENCRYPTION_KEY` / `PROVISIONED_BY`.
4. Set the health check path to `/api/health`.
5. Deploy. Migrations run automatically on container start via the entrypoint.

Because connection strings come from environment variables, you change a target
by updating its variable in Coolify and redeploying — no code change.

---

## How provisioning works (idempotency)

For each target the PostgreSQL provisioner:

1. Validates `databaseName` and `username` against `^[a-z][a-z0-9_]*$`.
2. Ensures the role: `CREATE USER` if absent, otherwise `ALTER USER … PASSWORD`
   (password passed as a bind parameter).
3. Ensures the database: `CREATE DATABASE … OWNER` if absent (run outside a
   transaction, as Postgres requires).
4. Grants privileges (naturally re-runnable):
   `GRANT ALL PRIVILEGES ON DATABASE …`, then, connected to the new database,
   `GRANT ALL ON SCHEMA public`, `ALTER SCHEMA public OWNER`, grants on all
   tables/sequences/functions, and matching `ALTER DEFAULT PRIVILEGES`.
5. Returns the connection string **in memory only** — it is shown once and
   recorded (without the password) in the registry.

Partial failures in a full environment set are reported per environment.

---

## Roadmap (future-ready)

The codebase is structured so these can be added without rearchitecting:

- Redis & MySQL provisioning (implement the `Provisioner` interface)
- PostgreSQL backups
- Read-only user creation
- Coolify environment-variable generation
- Editable, encrypted server targets (Settings page — crypto helper already
  present)
- Authenticated HTTP API

---

## License

Internal Aspyre Labs tooling.
