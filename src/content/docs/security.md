---
title: Security
description: The security model — authentication, encryption at rest, and injection protections.
category: Reference
order: 4
---

ALIM manages powerful capabilities (running SQL, provisioning databases, holding credentials), so its security model matters. This page summarizes how it protects access, data, and inputs.

## Authentication

Every route is gated; there is no unauthenticated mode. Access is enforced at a single middleware choke point, with a shared password and/or a trusted reverse-proxy identity, and the config fails **closed** if misconfigured. See [Authentication](/docs/authentication) for the full model, including the reverse-proxy spoofing caveat and `AUTH_PROXY_SHARED_SECRET`.

## Encryption at rest

ALIM encrypts sensitive values with **AES-256-GCM** (`src/lib/crypto.ts`):

- **Algorithm**: `aes-256-gcm`, a 256-bit key, a random 12-byte IV per encryption, and a 16-byte authentication tag.
- **Key**: `ENCRYPTION_KEY`, a 32-byte key supplied as base64 (44 chars) or hex (64 chars). The app validates the length on startup.
- **Format**: ciphertext is stored as `base64(iv).base64(tag).base64(ciphertext)`.
- **Authentication**: decryption verifies the GCM tag, so tampered or corrupted ciphertext fails rather than returning garbage.

What is encrypted: the [Secrets](/docs/secrets) vault, integration credentials and per-environment connection strings in [Settings](/docs/settings), and SSH private keys in `HostCredential`. `isEncryptionConfigured()` gates the Secrets/Settings UI when no key is set.

**Key rotation:** existing ciphertext stays valid only under the same key. After rotating `ENCRYPTION_KEY`, previously stored values read back as "not set" (decryption returns null rather than throwing) and must be re-entered. Because `AUTH_SECRET` falls back to `ENCRYPTION_KEY`, rotating the key also invalidates existing sessions unless you set `AUTH_SECRET` separately.

## No stored database passwords

Passwords for the databases ALIM provisions are **never stored**. A new connection string (with its password) is generated in memory, shown once on the success screen, and discarded. Everywhere else, connection strings are masked (`…:****@…`). To recover access, re-provision the database to reset the password.

## SQL safety

- **Identifiers** (database and role names) are validated against `^[a-z][a-z0-9_]*$` and double-quoted before use, so they cannot break out of their quoting — defense in depth even if validation were bypassed.
- **Values** use parameterized queries; the one exception, the `PASSWORD` literal (which cannot be a bind parameter), is explicitly escaped for quotes and backslashes.
- The [SQL Console](/docs/sql-console) classifies every statement and blocks or confirms writes per environment policy, re-checking authoritatively on the server. Console queries run with a statement timeout.

## Input validation

All form and action input is validated on the server with **Zod** schemas (`src/lib/*-validation.ts`) before any service is called. Validation failures return per-field errors and never reach the database or an external API.

## Credential isolation

- Connection strings and integration tokens live in environment variables or the encrypted Settings store and are **never** sent to the browser — the UI only sees masked or derived metadata.
- Errors from PostgreSQL and integrations are mapped to messages that never echo credentials.
- Server-only modules import `"server-only"` so they can't be pulled into client bundles.

## Auditability

Every state-changing action is recorded in an append-only [Audit Log](/docs/audit-log) with the authenticated actor — including sensitive operations like `secret.reveal`. Audit writes are best-effort and decoupled (no foreign keys), so they neither block nor are blocked by the operations they record.

## Operational guidance

- Always set a strong, unique `ENCRYPTION_KEY` and a strong `AUTH_PASSWORD` (or use proxy auth).
- Terminate TLS in front of ALIM; the session cookie is marked `Secure` when the request is HTTPS.
- In proxy mode, ensure ALIM is reachable **only** through the proxy, or set `AUTH_PROXY_SHARED_SECRET`.
- Keep `DATABASE_URL` and the admin target connection strings off the public network.
