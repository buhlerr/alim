---
title: Secrets
description: An encrypted vault for API tokens, passwords, connection strings, and SSH keys.
category: Modules
order: 8
---

The Secrets module (`/secrets`) is a user-managed encrypted vault for arbitrary credentials. Values are encrypted at rest with AES-256-GCM and revealed only through an explicit action.

## What a secret holds

Each secret (`Secret` table) has:

- **name** — unique, indexed.
- **description** — optional.
- **category** — a free label such as "API Token", "Password", "Connection String", "SSH Key".
- **encryptedValue** — the ciphertext (never returned by list operations).
- **lastRevealedAt** — stamped each time the secret is decrypted, so access is visible.

## Operations

- **List** returns metadata only (id, name, description, category, last-revealed, timestamps) — never the value.
- **Create** encrypts the plaintext and stores it. Names must be unique.
- **Update** changes metadata; if you supply a new value it is re-encrypted, and if you leave the value blank the stored ciphertext is preserved (so you can edit a description without re-entering the secret).
- **Delete** removes the secret.
- **Reveal** is the only decryption path: it fetches the row, decrypts the value, stamps `lastRevealedAt`, and returns the plaintext to your browser. It returns nothing (rather than erroring) if the secret is missing or cannot be decrypted — for example after `ENCRYPTION_KEY` has been rotated.

## Requirements

Secrets require `ENCRYPTION_KEY` to be configured. If it is not, the Secrets page shows a warning and the vault is unavailable. See [Configuration](/docs/configuration) and [Security](/docs/security).

## Audit

Every operation records an entry in the [Audit Log](/docs/audit-log): `secret.create` (with the category), `secret.update` (noting whether the value changed, without revealing it), `secret.delete`, and **`secret.reveal`** — so you can audit who accessed which secret and when. The plaintext value is never written to the audit log.

## Secrets vs. Settings

The Secrets vault is distinct from the [Settings](/docs/settings) store. Settings hold ALIM's own integration credentials and per-environment connection strings (used by the app internally); Secrets are a general-purpose vault you manage for your own use. Both encrypt values with the same AES-256-GCM helper.
