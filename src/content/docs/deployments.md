---
title: Deployments
description: A one-shot wizard that stands an application up end-to-end across every module.
category: Modules
order: 6
---

The Deployments wizard (`/deploy`) orchestrates the other modules to stand an application up in one pass: provision a database, create and deploy a Coolify application, create an NPM proxy host, and point Cloudflare DNS at it.

## The wizard

You give the deployment an **application name** (used to derive stable, environment-scoped names), then enable any combination of four optional steps. Each step is **gated** on whether its module is configured, and at least one step must be enabled.

1. **Database** _(requires at least one environment)_
   Select an environment; ALIM generates a password, provisions the database/user (see [Databases](/docs/databases)), records it in the registry, and returns the connection string (shown once).

2. **Coolify application** _(requires Coolify configured)_
   Choose a project and server, Git repository and branch, build pack, exposed port, and optional domains. ALIM creates the application and immediately triggers a deploy.

3. **Nginx Proxy Manager** _(requires NPM configured)_
   Provide domains, forward scheme/host/port. ALIM creates a proxy host (SSL options apply only when a certificate is attached).

4. **Cloudflare DNS** _(requires Cloudflare configured and at least one zone)_
   Choose a zone, record type, name, and content, and whether it is proxied. ALIM creates the DNS record.

## Orchestration and error handling

Steps run **in order** (`database → coolify → npm → dns`), and each step is independent: a failure is caught and reported but does **not** stop the remaining steps. Each returns a status of `success`, `failed`, or `skipped` with a detail or error.

The overall run is `ok` only if no enabled step failed; partial success is shown per step on the results screen. On completion, `/registry` and `/dashboard` are revalidated so new resources appear immediately.

The run records a single `deployment.run` entry in the [Audit Log](/docs/audit-log), with a summary like "ran 3/4 steps" and the per-step outcomes in metadata.

## Relationship to the other modules

The wizard does not reimplement anything — it calls the same provisioning, Coolify, NPM, and Cloudflare services the individual modules use. Anything you can do here, you can also do (with more control) from the dedicated module page.
