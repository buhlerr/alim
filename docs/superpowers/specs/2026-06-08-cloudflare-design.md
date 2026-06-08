# Design: Cloudflare module

**Date:** 2026-06-08
**Status:** Approved (Phase 4) — user pre-authorized full build, broad coverage.
**Author:** designed against the established Coolify/NPM module shape.

## Context

Phase 4 of Aspyre Infrastructure Manager. Mirrors the Coolify/NPM module shape
(config resolver → typed fetch client → service → server actions → pages →
module registry) with audit instrumentation and credentials in the encrypted
Settings store. No new Prisma model (credentials live in the `Setting` table).

Auth is the simplest of the integrations so far: a **scoped API token** sent as
a Bearer header (like Coolify), plus an **account ID** for tunnel endpoints.
The distinguishing trait is Cloudflare's response envelope:
`{ success, errors[], messages[], result }` — the client unwraps `result` and
raises on `success === false`.

## Scope (broad coverage)

- **Tunnels** (Cloudflare Tunnel / `cfd_tunnel`): list, create, delete, and
  view/edit public-hostname routes (the tunnel `configurations` ingress list).
- **DNS records** (per zone): list, create, update, delete.
- **TLS/SSL settings** (per zone): SSL mode (off/flexible/full/strict) and
  Always-Use-HTTPS.
- **Zones**: list (to populate the zone picker for DNS/TLS).

## Architecture

### Config & client
- **`src/lib/cloudflare-config.ts`** — `CloudflareConfig { apiToken, accountId }`,
  `CLOUDFLARE_SETTING_KEYS` (`cloudflare.apiToken` / `cloudflare.accountId`),
  `getCloudflareConfig()` (encrypted Settings first, then `CLOUDFLARE_API_TOKEN`
  / `CLOUDFLARE_ACCOUNT_ID` env fallback), `isCloudflareConfigured()`. Only the
  token is required; `accountId` is optional (tunnel features need it).
  Server-only; never returns the token to the client.
- **`src/services/cloudflare/types.ts`** — `CloudflareError` (stable code + safe
  message), the `CloudflareEnvelope<T>` shape, domain/request types, and
  `CloudflareConnectionResult`.
- **`src/services/cloudflare/client.ts`** — `cfFetch<T>({ path, method, body,
  query })` against `https://api.cloudflare.com/client/v4`, Bearer auth, 15s
  timeout. Unwraps the envelope: returns `result`, throws `CloudflareError` with
  the first `errors[].message` when `success` is false; normalizes network/HTTP
  failures (401 → INVALID_TOKEN, 403 → FORBIDDEN, etc.). Never leaks the token.

### Per-resource services (`src/services/cloudflare/`)
- **`zones.ts`** — `list()`.
- **`tunnels.ts`** — `list()`, `create(name)`, `remove(id)`, `getConfig(id)`,
  `putConfig(id, ingress)`. Endpoints under `/accounts/{accountId}/cfd_tunnel`.
  `accountId` resolved from config; throws a friendly `CloudflareError` if unset.
- **`dns.ts`** — `list(zoneId)`, `create(zoneId, req)`, `update(zoneId, id, req)`,
  `remove(zoneId, id)`.
- **`tls.ts`** — `getSettings(zoneId)` (SSL mode + always_use_https),
  `setSslMode(zoneId, value)`, `setAlwaysUseHttps(zoneId, on)`.
- **`service.ts`** — aggregates into `cloudflareService` and adds
  `testConnection()` (`GET /user/tokens/verify`, falling back to `GET /zones`).

### Validation, actions, pages
- **`src/lib/cloudflare-validation.ts`** — zod schemas: config (apiToken,
  accountId optional); tunnel create (name); tunnel route (hostname, service URL,
  e.g. `http://localhost:3000`); DNS record (type enum A/AAAA/CNAME/TXT/MX,
  name, content, proxied, ttl); TLS (ssl mode enum, always_use_https bool).
- **`src/app/actions/cloudflare.ts`** — `ActionResult<T>` actions for config
  save/test, zones list, tunnel CRUD + route add/remove, DNS CRUD, and TLS
  reads/writes. All audit-instrumented with new `cloudflare.*` action constants
  and `cf_*` target types in `src/lib/audit.ts`.
- **`/cloudflare`** — tabbed page (Tunnels · DNS · TLS) on the existing `tabs` +
  `dialog` UI. DNS and TLS tabs include a zone picker. Not-configured banner
  pointing at Settings.
- **Settings** — `cloudflare-settings-form.tsx` + a "Cloudflare" section on
  `/settings` (token write-only, account ID prefilled, Test-connection).

### Module registry & audit
- Flip the `cloudflare` module to `available` in `src/lib/modules.ts` with a
  `/cloudflare` nav entry.
- Add `cloudflare.*` audit action constants (config.save, tunnel.create/delete,
  tunnel.route.update, dns.create/update/delete, tls.update) + `cf_tunnel`,
  `cf_dns_record`, `cf_zone` target types and labels.

## Testing (Vitest, TDD)

- `cloudflare-config.test.ts` — settings-first resolution, env fallback, token
  required / account optional.
- `client.test.ts` — Bearer header + URL build, envelope unwrap, `success:false`
  → CloudflareError, HTTP/network normalization, query params.
- `service.test.ts` — one test per resource (mock `cfFetch`) asserting request
  shape; `testConnection` ok + failure.
- `cloudflare-validation.test.ts` — accept/reject per schema.

## Build order (incremental, each green slice committed)

1. Foundation: config + types + client. 2. Resource services + aggregator.
3. Validation + audit constants + server actions. 4. Pages + settings UI.
5. Module registry flip + final verify.

## Out of scope (YAGNI)

- Page Rules, WAF/firewall, Workers, R2, Access policies, Load Balancing.
- Tunnel connector/`cloudflared` install orchestration (we manage the
  cloud-side tunnel + routes; running the connector is the operator's job).
- Origin certificate issuance and custom hostnames.
