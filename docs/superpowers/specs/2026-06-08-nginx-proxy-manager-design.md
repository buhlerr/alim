# Design: Nginx Proxy Manager module

**Date:** 2026-06-08
**Status:** Approved (Phase 3)
**Author:** brainstormed with user

## Context

Phase 3 of Aspyre Infrastructure Manager. A new external-API integration that
mirrors the Coolify module shape (config resolver → typed fetch client →
service → server actions → pages → module registry), with audit instrumentation
and credentials kept in the encrypted Settings store.

The one structural difference from Coolify: NPM authenticates by minting a
**short-lived JWT** from email+password (`POST /api/tokens`), rather than using
a static API token. So the module adds a token-acquisition/caching layer.

## Decisions (from brainstorming)

1. **Resource scope:** broad — Proxy Hosts, Redirection Hosts, Streams (TCP/UDP),
   404/Dead Hosts, plus SSL Certificates and Access Lists in support of them.
2. **SSL:** select an existing certificate on a host, and request a new Let's
   Encrypt certificate inline.
3. **Auth:** store base URL + email + password (encrypted); the client
   auto-mints and caches a JWT, refreshing on expiry / 401.

## Architecture

### Config & auth
- **`src/lib/npm-config.ts`** — `NpmConfig { baseUrl, identity, secret }`,
  `NPM_SETTING_KEYS` (`npm.baseUrl` / `npm.identity` / `npm.secret`),
  `getNpmConfig()` (encrypted Settings first, then `NPM_BASE_URL` /
  `NPM_IDENTITY` / `NPM_SECRET` env fallback), `isNpmConfigured()`. Server-only;
  never returns the secret to the client.
- **`src/services/npm/auth.ts`** — in-memory token cache keyed by
  `baseUrl|identity`. `getToken(config)` returns a cached token if still valid
  (>60s from expiry), otherwise mints via `POST /api/tokens {identity, secret}`
  and caches `{token, expires}`. `clearToken(config)` drops the cache entry.
- **`src/services/npm/client.ts`** — `npmFetch<T>({ path, method, body, query })`:
  resolves config (throws `NpmError("NOT_CONFIGURED")` if absent), obtains a
  token, calls `{baseUrl}/api{path}` with bearer auth, 15s timeout, JSON
  in/out (tolerant of non-JSON bodies). On HTTP 401 it clears the token and
  retries once (transparent expiry handling). Normalizes failures into
  `NpmError` with stable codes — never leaks credentials or raw bodies.

### Domain types & per-resource services (`src/services/npm/`)
- **`types.ts`** — `NpmError` (code + safe message), domain types and request
  types for each resource, and `NpmConnectionResult`.
- **`proxy-hosts.ts`** — list, get, create, update, delete, enable, disable.
  Endpoints `/nginx/proxy-hosts[/{id}][/enable|/disable]`.
- **`redirection-hosts.ts`** — list, create, update, delete, enable, disable.
- **`streams.ts`** — list, create, update, delete, enable, disable.
- **`dead-hosts.ts`** — list, create, update, delete, enable, disable (404 hosts).
- **`certificates.ts`** — list; `requestLetsEncrypt({ domainNames, email })`
  (`POST /nginx/certificates` with provider `letsencrypt`).
- **`access-lists.ts`** — list (read-only; selectable on a proxy host).
- **`service.ts`** — aggregates the per-resource modules into a single
  `npmService` and adds `testConnection()` (mint a token, then `GET /` for the
  version string).

Each resource file is small and independently testable; endpoint paths live
only here.

### Validation, actions, pages
- **`src/lib/npm-validation.ts`** — zod schema per form: NPM config; proxy host
  (domain_names CSV, forward_scheme http|https, forward_host, forward_port,
  certificate_id, ssl_forced, block_exploits, websocket upgrade, caching,
  access_list_id); redirection host (forward_domain_name, forward_http_code
  300/301/302/307/308, preserve_path); stream (incoming_port, forwarding_host,
  forwarding_port, tcp/udp toggles); dead host (domain_names, certificate_id);
  Let's Encrypt request (domain_names, email).
- **`src/app/actions/npm.ts`** — `ActionResult<T>` server actions for config
  save + test, and CRUD/enable/disable per resource, plus cert listing and LE
  request. All audit-instrumented.
- **`/npm`** — tabbed page (Proxy Hosts · Redirections · Streams · 404 ·
  Certificates) built on the existing `tabs` + `dialog` UI. Each tab: a table,
  a create/edit dialog form, enable/disable toggle, and delete-with-confirm.
  Shows a not-configured banner (like Coolify) pointing at Settings when NPM
  isn't configured.
- **Settings** — `src/components/settings/npm-settings-form.tsx` and a new "Nginx
  Proxy Manager" section on `/settings`: base URL prefilled for display,
  password write-only, Save + Test-connection.

### Module registry & audit
- Flip the `npm` module (id `npm`, name "Proxy Hosts") to `available` in
  `src/lib/modules.ts` with a `/npm` nav entry.
- Add audit action constants (`npm.proxy_host.create/update/delete/toggle`,
  `npm.redirection.*`, `npm.stream.*`, `npm.dead_host.*`, `npm.certificate.request`,
  `npm.config.save`) and an `npm_*` target-type family in `src/lib/audit.ts`;
  call `auditService.record` from each mutating action.

## Testing (Vitest, TDD)

- `src/lib/npm-config.test.ts` — settings-first resolution, env fallback, null
  when incomplete.
- `src/services/npm/auth.test.ts` — mints on first call, returns cached token,
  re-mints when expired, `clearToken` forces a re-mint.
- `src/services/npm/client.test.ts` — bearer header + URL construction, 401
  clears token and retries once, error normalization, non-JSON tolerance.
- One service test per resource (mock `npmFetch`) asserting request shape for
  create/update/delete/toggle and cert request.
- `src/lib/npm-validation.test.ts` — accept/reject cases per schema.

## Build order (incremental, each green slice committed)

1. Foundation: config + auth + client + types + Settings UI + test-connection.
2. Proxy Hosts (richest — SSL cert select + LE request + access list select).
3. Certificates (list + LE request) — used by host forms.
4. Redirection Hosts.
5. Streams.
6. 404/Dead Hosts.
7. Module registry flip + audit constants/instrumentation + final verify.

## Out of scope (YAGNI)

- NPM users/permissions, settings, and the NPM-side audit log.
- Custom (uploaded) certificate management and DNS-challenge LE.
- Advanced per-location nginx config editing (a single advanced_config textarea
  is the extent of "advanced" support).
