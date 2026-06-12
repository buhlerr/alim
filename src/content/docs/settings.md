---
title: Settings
description: Define environments and store integration credentials and connection strings, encrypted.
category: Modules
order: 9
---

The Settings page (`/settings`) is where you define your **environments** and store the **credentials** ALIM uses to talk to your databases and integrations. All secret values are encrypted at rest with AES-256-GCM.

## Environments

Environments are user-defined and drive the rest of the app. Each (`Environment` table) has:

| Field | Notes |
| --- | --- |
| `key` | Stable identifier (e.g. `PRODUCTION`), slugified from the name on creation; **never changes**. |
| `name` | Display name; freely editable. |
| `description` | Optional. |
| `color` | Badge color in the UI. |
| `abbreviation` | Short form used when deriving database/user names (defaults to a lowercased slug). |
| `sortOrder` | Ordering in menus and the sidebar. |
| `readOnly` | When true, blocks all writes in the [SQL Console](/docs/sql-console). |
| `requireWriteConfirm` | When true, write queries require typed confirmation. |

Operations: **create** (auto-slugs the key, appending `_2`, `_3`… on collision, and appends to the end of the order), **update** (everything except the key), **reorder** (transactional re-ranking), and **delete**.

> An environment that is referenced by a provisioned database or query history **cannot be deleted** — the foreign keys use `onDelete: Restrict`. Remove the dependent records first.

The `readOnly` and `requireWriteConfirm` flags are enforced by the SQL Console's [write-safety policy](/docs/sql-console).

## Connection strings

For each environment you can store the admin (superuser) connection string used to provision databases. The full string — including the password — is **write-only**: it is encrypted and saved, the plaintext is discarded, and it is never echoed back to the browser (the UI only ever shows a masked form). If no encrypted value is saved for one of the original environments, ALIM falls back to the matching `POSTGRES_*_URL` environment variable.

## Integration credentials

Settings stores the credentials for the three integrations, each with a **Test connection** button:

| Integration | Setting keys |
| --- | --- |
| [Coolify](/docs/coolify) | `coolify.baseUrl`, `coolify.apiToken` |
| [Proxy Hosts / NPM](/docs/proxy-hosts) | `npm.baseUrl`, `npm.identity`, `npm.secret` |
| [Cloudflare](/docs/cloudflare) | `cloudflare.accountId`, `cloudflare.apiToken` |

Non-secret values (base URLs, identity, account ID) check Settings first then fall back to the matching environment variable. Secret values (tokens, passwords) are encrypted; leaving a secret field blank on save keeps the existing value. See [Configuration](/docs/configuration) for the full precedence rules.

## How storage works

Settings live in the `Setting` table as encrypted key/value pairs (`set`, `get`, `has`, `delete`). The same `Setting` store also holds per-environment connection strings under keys like `postgres.<ENV_KEY>.url`. Encryption uses the AES-256-GCM helper described in [Security](/docs/security); a stable `ENCRYPTION_KEY` is required for any of this to persist across restarts.

Saving integration config records `coolify.config.save` / `npm.config.save` / `cloudflare.config.save`, and environment changes record `environment.{create,update,delete,reorder}`, in the [Audit Log](/docs/audit-log) — always without logging the secret values themselves.
