---
title: Migrations
description: Clone or migrate Coolify resources between servers, with volume transfer and an approval-gated cutover.
category: Modules
order: 7
---

The Migrations module (`/migrations`) moves or copies a Coolify resource (application, service, or database) from one server to another. It is built around a single canonical, **resumable** workflow with per-step tracking and an approval gate before any destructive cutover.

## Clone vs. migrate

You choose the mode when creating a migration:

- **Clone** — non-destructive. The source keeps running and is never touched; a parallel copy is created on the destination. No volume transfer, no cutover, no approval gate.
- **Migrate** — the source is stopped, its volumes are transferred, the copy is brought up on the destination, and after your approval the public endpoints are switched over and the source is removed.

## The migrate workflow

Each step is tracked in the `MigrationStep` table with a status (`pending → running → success | failed | skipped`), an attempt counter, and timestamps:

1. **Validate** the destination (host exists, reachable, no name collision, capacity).
2. **Stop** the source resource.
3. **Archive** volumes (a `tar.gz` per Docker volume, created on the source host).
4. **Transfer** archives (downloaded to the ALIM server, then uploaded to the destination).
5. **Restore** volumes into new Docker volumes on the destination.
6. **Provision** the destination resource from the captured source snapshot.
7. **Deploy** it and poll until the deployment finishes.
8. **Generate** a temporary validation URL (an sslip.io domain, or an existing FQDN) for manual testing.
9. **Await approval** — the workflow pauses here.
10. **Switch endpoints** — domains are removed from the source and assigned to the destination, which is redeployed.
11. **Delete** the source resource.
12. **Complete.**

Clone runs a shorter plan (validate → provision → deploy → validation URL → complete) with no volume or cutover steps.

## Source snapshot

At creation, ALIM inspects the source and freezes its full configuration — type, environment variables, build config, volumes, and domains — into `sourceResourceSnapshot`. Every later step uses this snapshot rather than re-reading the source, so the resource that is promoted is exactly the one that was validated. You may optionally override the destination project and environment.

## Validation report

Before execution, ALIM produces a validation report. **Blocking** checks must pass: the destination host is registered, is reachable, and has no resource of the same name. **Advisory** checks (free disk ≥ volume size + 1 GB, free memory ≥ 512 MB) warn but never block.

## Volume transfer over SSH

Volume operations use SSH (`ssh2`) to the source and destination hosts:

- **Archive**: `docker run --rm -v <volume>:/from:ro -v /tmp:/to alpine tar czf /to/<volume>.tar.gz -C /from .`
- **Transfer**: SFTP download from the source, SFTP upload to the destination.
- **Restore**: `docker volume create <volume>` then extract the archive into it.

Paths and volume names are validated against strict patterns, and SSH connections use a 10-second timeout. Capacity is read on demand (`free -b`, `df`) only for the chosen destination, so unreachable hosts don't hang the UI.

### Host credentials

SSH access is stored in the `HostCredential` table: a label, IP/hostname, port, username, and an **encrypted private key** (AES-256-GCM via the [crypto helper](/docs/security)). Credentials can be imported from Coolify — ALIM reads each server's IP and its registered private key and upserts a credential keyed by the Coolify server UUID. Decryption happens only inside the SSH module; the plaintext key is never sent to the browser.

## Approval, rollback, and resumability

- **Approval** — for migrations, the `await_approval` step blocks until you approve the cutover.
- **Rollback** (available before cutover) — deletes the provisioned destination resource, restarts the stopped source, marks remaining steps skipped, and sets the job to `rolled_back`.
- **Resumability** — on restart the orchestrator finds the first non-final step and continues; a step left `running` is retried with an incremented attempt number.

Live logs and artifacts (archives, transfers, the validation URL, the stopped-source marker) are recorded per job and streamed to the UI. Actions record `migration.{create,approve,rollback,complete,retry,delete}` in the [Audit Log](/docs/audit-log).

## Implementation status

Fully implemented: the clone workflow, migrate steps 1–8 and 10–12, real SSH volume archive/transfer/restore, host-credential encryption and import, validation, the approval gate and pre-cutover rollback, the Coolify provider for applications and services, resumability, and audit. Foundational / in progress: database-resource migration, non-Coolify providers (the provider interface is abstract), actual volume-size estimation, and streaming (rather than buffered) transfer.
