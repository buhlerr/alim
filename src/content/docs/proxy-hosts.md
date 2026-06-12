---
title: Proxy Hosts
description: Manage Nginx Proxy Manager — proxy hosts, redirections, streams, 404 hosts, and certificates.
category: Modules
order: 4
---

The Proxy Hosts module (`/npm`) is a client for [Nginx Proxy Manager](https://nginxproxymanager.com) (NPM). It manages reverse-proxy configuration and Let's Encrypt certificates.

## Capabilities

- **Proxy hosts** — forward HTTP(S) traffic to an upstream, with SSL/TLS termination, HTTP/2, HSTS, exploit blocking, caching, WebSocket upgrade, access-list binding, and custom advanced Nginx config. Supports multiple domains per host.
- **Redirection hosts** — HTTP 3xx redirects (`300, 301, 302, 307, 308`), with scheme selection (`auto`/`http`/`https`), preserve-path, and optional SSL.
- **Streams** — raw TCP/UDP port forwarding (databases, SSH, game servers). At least one of TCP/UDP must be enabled.
- **Dead (404) hosts** — domains that serve a default 404 without forwarding, with optional SSL and HTTP/2.
- **Certificates** — request Let's Encrypt certificates for a set of domains, and delete them; expiry is tracked.
- **Access lists** — listed (read-only) for binding to proxy hosts.

Each proxy/redirection/stream/dead host can be enabled or disabled (toggled) without deleting it.

## Configuration

Configure on [Settings](/docs/settings) (encrypted), or via environment variables:

| Setting key | Env fallback | Purpose |
| --- | --- | --- |
| `npm.baseUrl` | `NPM_BASE_URL` | NPM API base URL (no trailing `/api`). |
| `npm.identity` | `NPM_IDENTITY` | Admin email address. |
| `npm.secret` | `NPM_SECRET` | Admin password (encrypted at rest). |

Settings take precedence. ALIM mints a short-lived JWT (`POST /tokens`) automatically for each request; cached tokens are cleared when credentials change. On update, a blank password keeps the existing one.

## API surface

Calls are made under `/api`. For each resource type there is the standard set — for example proxy hosts:

- `GET /nginx/proxy-hosts`, `GET /nginx/proxy-hosts/{id}`
- `POST /nginx/proxy-hosts`, `PUT /nginx/proxy-hosts/{id}`, `DELETE /nginx/proxy-hosts/{id}`
- `POST /nginx/proxy-hosts/{id}/enable|disable`

…and equivalents under `/nginx/redirection-hosts`, `/nginx/streams`, `/nginx/dead-hosts`. Certificates use `GET|POST /nginx/certificates` and `DELETE /nginx/certificates/{id}`; access lists use `GET /nginx/access-lists`.

## Validation highlights

- **Proxy host** — at least one domain; forward scheme `http`/`https`; forward host non-empty; forward port `1–65535`; SSL options only apply when a certificate is attached; advanced config up to 20,000 chars.
- **Redirection** — forward HTTP code in `{300, 301, 302, 307, 308}`.
- **Stream** — incoming/forwarding ports `1–65535`; at least one of TCP/UDP.
- **Certificate** — at least one domain plus a valid ACME email.

## Audit

NPM mutations record granular actions — `npm.config.save`, `npm.proxy_host.{create,update,delete,toggle}`, and the equivalents for redirections, streams, dead hosts, plus `npm.certificate.request` / `npm.certificate.delete` — in the [Audit Log](/docs/audit-log).
