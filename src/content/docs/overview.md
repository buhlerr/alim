---
title: Overview
description: What ALIM is, how it is organized, and the ideas behind it.
category: Getting Started
order: 1
---

**Aspyre Labs Infrastructure Manager (ALIM)** is an open-source, self-hosted control plane for the day-to-day operations of running your own infrastructure. It brings provisioning, SQL access, reverse-proxy and DNS configuration, deployments, and resource migrations into a single, audited web application.

ALIM is built by [Aspyre Labs](https://github.com/aspyrelabs) and runs as a single Next.js application backed by one PostgreSQL database of its own.

## What it does

| Area | Capability |
| --- | --- |
| **Databases** | Provision PostgreSQL databases, roles, and grants across environments, idempotently. |
| **SQL Console** | Run, explain, format, and save SQL against any environment, with read/write safety rails. |
| **Coolify** | Create, configure, and deploy applications through the Coolify API. |
| **Proxy Hosts** | Manage Nginx Proxy Manager: proxy hosts, redirections, streams, 404 hosts, and certificates. |
| **Cloudflare** | Manage tunnels and routes, DNS records, and TLS/SSL settings. |
| **Deployments** | A one-shot wizard that stands an application up end-to-end across the modules above. |
| **Migrations** | Clone or migrate Coolify resources between servers, with volume transfer and an approval-gated cutover. |
| **Secrets** | An encrypted vault for API tokens, passwords, connection strings, and SSH keys. |
| **Audit Log** | An append-only record of every state-changing action. |
| **Settings** | Define environments and store integration credentials (encrypted). |

## The two-database model

This is the single most important concept to understand before using ALIM.

ALIM works with **two completely separate tiers of database**:

1. **ALIM's own metadata database** — pointed at by `DATABASE_URL`. This stores the application's operational state: the registry of provisioned databases, query history, secrets, settings, the audit log, migration jobs, and host credentials. With the bundled `docker-compose.yml` this is the `appdb` service.

2. **The target PostgreSQL servers you provision _into_** — your production, staging, and development database servers. ALIM connects to these with an administrative (superuser) connection string to run `CREATE DATABASE`, `CREATE USER`, and `GRANT`. These connection strings are configured per environment in [Settings](/docs/settings) (encrypted) or via the `POSTGRES_*_URL` environment variables.

> ALIM never stores the passwords of the databases it provisions. A new database's connection string — with its password — is shown exactly **once**, on the success screen, and never again.

## How it is organized

ALIM is a Next.js 15 (App Router) application with a clean, layered structure:

- **Pages** (`src/app/*/page.tsx`) — one server-rendered landing page per module.
- **Server actions** (`src/app/actions/*.ts`) — `"use server"` RPCs that validate input, call services, record audit events, and revalidate caches.
- **Services** (`src/services/*`) — the business logic, organized by domain (registry, provisioning, query, coolify, npm, cloudflare, deployment, migration, secrets, settings, environments, audit, health).
- **Lib** (`src/lib/*`) — pure utilities: validation schemas, naming, password generation, crypto, query policy, the module registry, and the authentication primitives.
- **Components** (`src/components/*`) — React UI, split into `ui/` primitives (Radix-based) and feature components.

See [Architecture](/docs/architecture) for the full picture and [Data Model](/docs/data-model) for every table.

## Design principles

- **Secure by default.** There is no unauthenticated mode — every route is gated. See [Authentication](/docs/authentication).
- **Idempotent operations.** Re-running a provision or a deployment is safe; existing resources are reconciled, not duplicated.
- **Audited.** Every state-changing action is recorded with an actor, target, and outcome.
- **Encrypted at rest.** Secrets and integration credentials are encrypted with AES-256-GCM. See [Security](/docs/security).
- **No stored passwords.** Provisioned-database passwords are shown once and never persisted.

## Where to go next

- New to ALIM? Start with [Getting Started](/docs/getting-started).
- Setting it up for a team? Read [Configuration](/docs/configuration) and [Authentication](/docs/authentication).
- Deploying to production? See [Deployment](/docs/deployment).
