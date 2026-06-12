---
title: Authentication
description: The gate — password and reverse-proxy modes, sessions, and the security caveats.
category: Reference
order: 1
---

ALIM is **secure by default**: every route is gated by a single middleware choke point, and there is no unauthenticated ("none") mode. You choose how the gate authenticates with `AUTH_MODE`.

## Modes

| Mode | Behavior |
| --- | --- |
| `password` _(default)_ | A single **shared password** gate with a signed, HTTP-only session cookie. |
| `proxy` | Trust an identity **header** set by a reverse proxy that already authenticated the user (Cloudflare Access, Authelia, Authentik, oauth2-proxy, …). No password is used. |
| `both` | Accept **either** (OR semantics): SSO via the proxy normally, with the shared password as a **break-glass** fallback when the proxy is misconfigured or bypassed. |

## The gate

The middleware (`src/middleware.ts`) runs before every request except the public allowlist (`/login` and `/api/health`) and static assets. For each request it:

1. Loads and validates the auth config (fails **closed** if invalid — see below).
2. Resolves identity: if the mode includes `proxy`, it reads `AUTH_PROXY_HEADER` (and, if set, requires the `AUTH_PROXY_SHARED_SECRET` to be present in the `x-alim-proxy-secret` header); otherwise/next it verifies the signed session cookie.
3. If no identity resolves, it **redirects** browser navigations to `/login?next=…` and returns **401** for API or non-GET requests.
4. On success it forwards the resolved username to the app on the `x-alim-user` request header (overwriting any client-supplied value, so it can't be spoofed).

Because `both` is OR, a missing or broken proxy header simply falls through to the password session — that is the break-glass path.

## Password sessions

The login form takes a **username** (prefilled with `AUTH_ADMIN_USERNAME`, default `admin`) and the **password**. The username is **attribution only** — it is recorded in the [Audit Log](/docs/audit-log) so operators can identify themselves, but it is not a second credential; the shared `AUTH_PASSWORD` is the only credential.

On success, ALIM issues a stateless signed cookie (`alim_session`):

- The payload (`{ sub, mode, iat, exp }`) is signed with HMAC-SHA256 using `AUTH_SECRET` (falling back to `ENCRYPTION_KEY`), via the Web Crypto API so the same verification runs on the edge runtime and in Node.
- The cookie is `HttpOnly`, `SameSite=Lax`, `Path=/`, with `Secure` set when the request arrived over HTTPS, and a lifetime of `AUTH_SESSION_TTL` (default 7 days).
- The password is compared in constant time.

Signing out (the control in the command bar) clears the cookie.

## Reverse-proxy mode

In `proxy` (or `both`) mode, ALIM trusts the identity in `AUTH_PROXY_HEADER` (default `X-Forwarded-User`; commonly an email). Configure your proxy to authenticate the user and set that header.

> **Security caveat.** Header trust is only safe if ALIM is reachable **exclusively** through the proxy. If the app's port is also directly reachable, anyone who can reach it can forge the header. When that is a risk, set `AUTH_PROXY_SHARED_SECRET`: the proxy must then also send that value in the `x-alim-proxy-secret` header, and requests without it are rejected.

In `proxy`-only mode the `/login` page is informational (there is no password); in `both` mode it offers the password form as the break-glass fallback.

## Fail-closed

If a password-bearing mode (`password` or `both`) is configured **without** `AUTH_PASSWORD`, or without a signing secret (`AUTH_SECRET` or `ENCRYPTION_KEY`), or with an invalid `AUTH_MODE`, configuration loading throws and the gate denies **every** gated request (returning 503) until it is fixed. It never silently opens up.

## Identity in the audit log

Server code reads the authenticated username via `getCurrentActor()` (`src/lib/auth/server.ts`), which reads the `x-alim-user` header the middleware set. This is what the [Audit Log](/docs/audit-log) and the provisioned-database `createdBy` field record — the real proxy email in proxy mode, or the entered username (default `admin`) in password mode.

## Configuration reference

See [Configuration](/docs/configuration) for the full `AUTH_*` table. The relevant variables are `AUTH_MODE`, `AUTH_PASSWORD`, `AUTH_SECRET`, `AUTH_ADMIN_USERNAME`, `AUTH_SESSION_TTL`, `AUTH_PROXY_HEADER`, and `AUTH_PROXY_SHARED_SECRET`.
