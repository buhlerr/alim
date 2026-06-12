---
title: Architecture
description: How the application is layered, and how a request flows through it.
category: Reference
order: 2
---

ALIM is a single Next.js 15 (App Router) application written in TypeScript, backed by one PostgreSQL database of its own.

## Layers

```
 Browser
   │
   ▼
 Middleware (src/middleware.ts)         ← the auth gate, runs on every request
   │
   ▼
 Pages (src/app/*/page.tsx)             ← server components, one per module
   │
   ├── Server actions (src/app/actions) ← "use server" RPCs: validate → service → audit → revalidate
   │        │
   │        ▼
   │   Services (src/services)          ← business logic by domain
   │        │
   │        ▼
   │   Prisma  → ALIM metadata DB
   │   pg / ssh2 / fetch → target servers & integrations
   │
   └── Lib (src/lib)                    ← pure helpers: validation, naming, crypto, auth, policy
```

- **Pages** are server components by default; they read data directly through Prisma and the services and render the UI.
- **Server actions** (`"use server"`) are the mutation entry points. The consistent pattern is: validate input with a Zod schema, call a service, record an audit event, revalidate affected paths, and return a serializable `ActionResult<T>` (`{ ok, error?, fieldErrors?, data? }`).
- **Services** encapsulate all database access and external API calls. Each is a namespaced object of async methods (`registryService`, `postgresProvisioner`, `coolifyService`, `npmService`, `cloudflareService`, `migrationService`, `deploymentOrchestrator`, `secretsService`, `settingsService`, `environmentsService`, `auditService`, `healthService`, …).
- **Lib** holds pure, mostly client-safe utilities: Zod validation schemas, identifier naming, password generation, the AES-256-GCM crypto helper, the SQL classifier and query policy, the module registry, and the authentication primitives.
- **Components** split into `ui/` (Radix-based primitives) and feature components. Most are server components; `"use client"` is used only for interactive UI (forms, dialogs, the editor), which call server actions.

## The two-database model

ALIM deliberately separates **its own metadata database** (`DATABASE_URL`, all the Prisma models) from the **target PostgreSQL servers** it provisions into (reached via per-environment admin connection strings). See [Overview](/docs/overview) and [Data Model](/docs/data-model). Target-database passwords are never stored.

## Request lifecycle

1. The **middleware** resolves the caller (password session or proxy header), redirects/denies if unauthenticated, and forwards the identity on `x-alim-user`. See [Authentication](/docs/authentication).
2. The **page** (server component) renders with data from services/Prisma. The root layout reads the current actor for the command bar.
3. A user action invokes a **server action**, which validates, calls a **service**, writes an **audit** entry, and revalidates caches.
4. **Services** talk to Prisma (metadata), `pg` (target Postgres), `ssh2` (migration volume transfer), or `fetch` (Coolify / NPM / Cloudflare).

## Server-only boundaries

Modules that must never reach the client import `"server-only"` at the top, so an accidental client import fails at build time. Pure data and utilities live in `src/lib` without that import, so client components can reference them freely (the SQL classifier and query policy, for instance, run on both client and server).

## Tech stack

| Layer | Technology |
| --- | --- |
| Runtime | Node.js 20 |
| Framework | Next.js 15 (App Router) · React 19 |
| Language | TypeScript 5 (strict) |
| Styling | Tailwind CSS 3 · shadcn/ui · Radix UI |
| ORM / driver | Prisma 6 · `pg` 8 |
| SSH | `ssh2` |
| Validation | Zod |
| Editor | CodeMirror 6 · `sql-formatter` |
| UI extras | next-themes · lucide-react · sonner |
| Testing | Vitest · Playwright |

`pg` and `ssh2` are declared as `serverExternalPackages` in `next.config.ts` so they aren't bundled (ssh2 ships a native addon). The build uses `output: "standalone"` for small Docker images. See [Deployment](/docs/deployment).
