---
title: Cloudflare
description: Manage Cloudflare tunnels and routes, DNS records, and TLS/SSL settings.
category: Modules
order: 5
---

The Cloudflare module (`/cloudflare`) is a client for the Cloudflare API. It manages DNS, Cloudflare Tunnels, and zone-level TLS.

## Capabilities

- **Zones** — list the zones (domains) on your account.
- **Tunnels** — create API-managed tunnels (`config_src: "cloudflare"`), list active tunnels, and delete them.
- **Tunnel routes (ingress rules)** — map a public hostname (with optional path prefix) to a service URL such as `http://localhost:3000` or `https://10.0.0.5:8443`. A trailing `http_status:404` catch-all is preserved automatically.
- **DNS records** — full CRUD for `A, AAAA, CNAME, TXT, MX, NS` records, with the Cloudflare proxy toggle (orange/grey cloud) and TTL control (`1` = automatic).
- **TLS/SSL** — set the zone SSL mode (`off`, `flexible`, `full`, `strict`) and toggle **Always Use HTTPS**.

## Configuration

Configure on [Settings](/docs/settings) (encrypted), or via environment variables:

| Setting key | Env fallback | Purpose |
| --- | --- | --- |
| `cloudflare.apiToken` | `CLOUDFLARE_API_TOKEN` | API token (encrypted at rest). Required. |
| `cloudflare.accountId` | `CLOUDFLARE_ACCOUNT_ID` | Account ID. Required only for tunnel operations. |

Only the token is needed for DNS and zone/TLS operations; the account ID is additionally required for the account-scoped tunnel endpoints. The token is never returned to the browser.

## API surface

Base URL `https://api.cloudflare.com/client/v4`:

- `GET /user/tokens/verify` — verify the token (used by the Settings test).
- `GET /zones` — list zones.
- `GET|POST /accounts/{accountId}/cfd_tunnel`, `DELETE …/{tunnelId}` — tunnels.
- `GET|PUT /accounts/{accountId}/cfd_tunnel/{tunnelId}/configurations` — ingress rules.
- `GET|POST /zones/{zoneId}/dns_records`, `PUT|DELETE …/{id}` — DNS records.
- `GET|PATCH /zones/{zoneId}/settings/ssl` and `…/settings/always_use_https` — TLS.

## Validation highlights

- API token required; account ID required at runtime for tunnels.
- Tunnel name 1–100 chars.
- DNS type restricted to `A, AAAA, CNAME, TXT, MX, NS`; name and content required; TTL ≥ 1.
- SSL mode one of `off`, `flexible`, `full`, `strict`.

## Audit

Cloudflare mutations record `cloudflare.config.save`, `cloudflare.tunnel.{create,delete}`, `cloudflare.tunnel.route_update`, `cloudflare.dns.{create,update,delete}`, and `cloudflare.tls.update` in the [Audit Log](/docs/audit-log).
