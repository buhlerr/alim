# Coolify API Response Shapes — Live Recon

**Date:** 2026-06-09
**Status:** LIVE DATA OBTAINED — all GETs succeeded (credentials resolved from encrypted `Setting` table).
**Instance:** Internal Coolify deployment (credentials resolved via AES-256-GCM decrypt of `coolify.baseUrl` / `coolify.apiToken` settings).

---

## HTTP Call Results

| Endpoint | HTTP Status | Notes |
|---|---|---|
| `GET /api/v1/servers` | 200 | 3 servers returned |
| `GET /api/v1/servers/{uuid}` | 200 | Full server detail |
| `GET /api/v1/servers/{uuid}/validate` | 201 | Async validation started |
| `GET /api/v1/servers/{uuid}/resources` | 200 | Empty array `[]` — no resources on the mgmt-01 host |
| `GET /api/v1/applications` | 200 | 12 applications returned |
| `GET /api/v1/applications/{uuid}` | 200 | Full app detail |
| `GET /api/v1/applications/{uuid}/storages` | 200 | Object with two empty arrays |

---

## Server List — `GET /api/v1/servers`

Response is an **array** of server objects.

### Top-level fields on each server object

```
uuid          string   — e.g. "qs8wklza1y90hhpndon9kcac"
name          string   — e.g. "aspyre-bom-mgmt-01"
ip            string   — e.g. "host.docker.internal" or "192.168.100.11"
description   string
port          number   — SSH port (22)
user          string   — SSH user ("root")
is_coolify_host  boolean
is_reachable  boolean  — TOP-LEVEL field present in list response
is_usable     boolean  — TOP-LEVEL field present in list response
proxy         object   — proxy config/status
settings      object   — nested settings (also contains is_reachable, is_usable)
```

Observed servers:
- `aspyre-bom-mgmt-01` — `ip: "host.docker.internal"` (the Coolify host itself)
- `aspyre-bom-host-01` — `ip: "192.168.100.11"`
- `aspyre-bom-host-02` — `ip: "192.168.100.12"`

### Plan assumption check: server `ip` field
**CONFIRMED** — the field name is `ip` (matches plan assumption).

---

## Server Detail — `GET /api/v1/servers/{uuid}`

Same shape as list entry plus additional fields:

```
uuid, name, ip, port, user                    (same as list)
description, team_id, private_key_id
proxy                                          object
settings                                       object (nested)
  settings.is_reachable                        boolean
  settings.is_usable                           boolean
server_metadata                                object
  server_metadata.cpus                         number
  server_metadata.memory_bytes                 number
  server_metadata.os                           string
  server_metadata.arch                         string
  server_metadata.kernel                       string
is_coolify_host, is_validating
validation_logs, swarm_cluster
cloud_provider_token_id, hetzner_server_id
created_at, updated_at, deleted_at
```

**Note:** `is_reachable` / `is_usable` appear both at the top-level of the list response AND nested inside `settings` in the detail response. In the detail response the top-level versions are `undefined`; they are only inside `settings`. Use `server.settings.is_reachable` / `server.settings.is_usable` when working with detail responses.

---

## Server Validate — `GET /api/v1/servers/{uuid}/validate`

HTTP 201 (not 200). Body:

```json
{ "message": "Validation started." }
```

This endpoint triggers an async validation — it does not return a pass/fail immediately. The result is eventually stored in `validation_logs` on the server object.

---

## Server Resources — `GET /api/v1/servers/{uuid}/resources`

HTTP 200. Body is a plain **array** (`[]`). When resources are present each entry is expected to have:

```
name    string
uuid    string
type    string   (e.g. "application")
status  string
```

The server queried (`aspyre-bom-mgmt-01`, the Coolify management host) had no deployed resources, so the array was empty. No live resource entries were captured for field confirmation.

---

## Application List — `GET /api/v1/applications`

Response is an **array** of application objects (12 in this instance).

### Key plan-relevant fields

```
uuid             string   — e.g. "edzy8wjmtj78dyqr9iyeda3j"
name             string   — e.g. "aasimpathan-app-prod"
fqdn             string   — comma-separated URLs, e.g. "http://aasimpathan.in,http://www.aasimpathan.in"
git_repository   string   — "owner/repo" format, e.g. "aasimenator/aasimpathan-app"
git_branch       string   — e.g. "main"
build_pack       string   — e.g. "nixpacks"
ports_exposes    string   — port as a string, e.g. "5001", "3000", "8080"
status           string   — e.g. "running:healthy", "running:unknown"
environment_id   number   — integer FK (e.g. 8, 7, 6, 3)
destination_id   number   — integer FK (e.g. 1)
destination_type string   — e.g. "App\\Models\\StandaloneDocker"
destination      object   — inline StandaloneDocker object (see below)
server_status    boolean  — true/false
```

### `destination` object (inline on every app in both list and detail)

```
destination.id            number
destination.uuid          string
destination.name          string
destination.network       string
destination.server_id     number
destination.server        object  — FULL server object inline (see Server fields above)
  destination.server.uuid   string  — the server's uuid
  destination.server.name   string
  destination.server.ip     string
```

### Plan assumption mismatches — CRITICAL

| Plan assumed field | Actual field | Present? | Notes |
|---|---|---|---|
| `project_uuid` | — | **NOT PRESENT** | No project uuid on application objects |
| `environment_name` | — | **NOT PRESENT** | No environment name string on application objects |
| `server_uuid` | — | **NOT PRESENT** | No top-level server_uuid on application objects |
| `ip` (server) | `ip` | CONFIRMED | Correct on the server object |
| `ports_exposes` | `ports_exposes` | **CONFIRMED** | Present as a string field on every app |

**How project/environment/server are actually referenced on an application:**

- **Project:** No `project_uuid` field on the application object. There is only `repository_project_id` (integer, the GitHub/Git repo ID). The application does not carry a Coolify project UUID.
- **Environment:** Referenced by `environment_id` (integer), **not** `environment_name` (string). There is no environment name string at all on the application object.
- **Server:** NOT via `server_uuid` directly. Server is accessed through the nested `destination.server.uuid` path. The `destination` object (type `StandaloneDocker`) is the join between an app and its server.

---

## Application Detail — `GET /api/v1/applications/{uuid}`

Same shape as list entry plus the following additional or confirmed fields:

```
docker_compose          string/null
dockerfile              string/null
dockerfile_location     string
start_command           string/null
build_command           string/null
install_command         string/null
health_check_*          various health-check config fields
limits_*                CPU/memory limit fields
custom_labels           string
ports_mappings          string
```

The `destination.server` nested object is present in the detail response and includes the full server shape (uuid, name, ip, port, proxy, settings, server_metadata, etc.).

---

## Application Storages — `GET /api/v1/applications/{uuid}/storages`

HTTP 200. Response is an **object** (not an array) with two keys:

```json
{
  "persistent_storages": [],
  "file_storages": []
}
```

The queried app had no storages. When entries are present, the expected fields per the Coolify schema are:

```
persistent_storages[].name         string
persistent_storages[].mount_path   string
persistent_storages[].host_path    string   (nullable)
file_storages[].name               string
file_storages[].mount_path         string
file_storages[].content            string
```

No live storage entries were captured to confirm field names — the above is inferred from Coolify's documented schema. The shape of the wrapper object (`{ persistent_storages, file_storages }`) is confirmed live.

---

## Summary: Plan Field Assumptions vs Reality

| Field | Plan Assumed | Actual | Action Needed |
|---|---|---|---|
| `server.ip` | `ip` | `ip` | None — confirmed |
| `server.uuid` | `uuid` | `uuid` | None — confirmed |
| `server.name` | `name` | `name` | None — confirmed |
| `server.is_reachable` | assumed top-level | Top-level in list; `settings.is_reachable` in detail | Read from `settings.is_reachable` in detail context |
| `app.project_uuid` | `project_uuid` | **ABSENT** | Remove from types; no project UUID on app |
| `app.environment_name` | `environment_name` | **ABSENT** | Remove; use `environment_id` (integer) |
| `app.server_uuid` | `server_uuid` | **ABSENT** | Remove; use `destination.server.uuid` |
| `app.ports_exposes` | `ports_exposes` | `ports_exposes` (string) | None — confirmed, note it's a string not array |
| `app.fqdn` | `fqdn` | `fqdn` (comma-sep string) | None — confirmed, parse comma-split to get multiple URLs |
| `app.build_pack` | `build_pack` | `build_pack` | None — confirmed |
| `app.git_repository` | `git_repository` | `git_repository` | None — confirmed |
| `app.git_branch` | `git_branch` | `git_branch` | None — confirmed |
| storages wrapper | flat array | `{ persistent_storages, file_storages }` | Update storage fetch to unwrap the object |
| `validate` HTTP status | assumed 200 | **201** | Handle 201 as success |

---

## Project / environment resolution

**Date:** 2026-06-09
**Status:** CONFIRMED via live API — all calls succeeded.

### The problem

An application object carries only `environment_id` (an integer). It has **no** `project_uuid`, **no** `environment_name`, and **no** `server_uuid` at the top level. Given a source app's `environment_id`, the migration must resolve its containing project UUID and environment name in order to create the destination copy inside the same project + environment.

### Resolution algorithm (confirmed with live data)

```
1. GET /api/v1/projects
   → returns array of { id, uuid, name, description }
   → environments are NOT embedded (environments field absent in list response)

2. For each project in the list:
   GET /api/v1/projects/{project.uuid}
   → returns { id, uuid, name, description, team_id, created_at, updated_at, environments[] }
   → environments[] items: { id, name, project_id, created_at, updated_at, description, uuid }

3. Find the environment where environment.id === app.environment_id
   → that environment's parent project.uuid  = the project_uuid
   → that environment.name                   = the environment name
   → that environment.uuid                   = the environment uuid (needed for some API calls)
```

**Confirmed live cross-reference (all 12 apps, 4 projects, 8 environment rows):**

| env_id | env_name | env_uuid | project_uuid | project_name |
|--------|----------|----------|--------------|--------------|
| 3 | prod | qps5bd0g2g22lbjkd1rgoq7r | nub0mqi0hqp26dwfke6s2sea | aspyre-labs-internal |
| 4 | dev | u1usf18bi45zpqaduid5ooav | nub0mqi0hqp26dwfke6s2sea | aspyre-labs-internal |
| 5 | stg | i1ys7uo82z44gri7i6ty0eze | nub0mqi0hqp26dwfke6s2sea | aspyre-labs-internal |
| 6 | prod | miosuiutax41kcd7fhta9ee6 | vwx6p1lsw50zfqv0vlflqhkq | aspyre-labs-external-prod |
| 7 | dev | lv3008qolyqhdkr5uky1no6n | sdvwyfrwn895sl6xs3ee6fgp | aspyre-labs-external-dev |
| 8 | prod | tmh0zxoh3dy7qxah60ucqmsc | hcxbz95nfpwx44t5qdi0qbn8 | personal |

**No simpler path exists.** There is no reverse-lookup endpoint like `GET /environments/{id}`. The only way to resolve from `environment_id` to project is to iterate all projects and their detail responses.

### Field name summary for resolution code

| Step | Endpoint | Match field | Extract fields |
|------|----------|-------------|----------------|
| List projects | `GET /projects` | — | `project.uuid`, `project.name` |
| Get project detail | `GET /projects/{project.uuid}` | `environment.id === app.environment_id` | `project.uuid`, `environment.name`, `environment.uuid` |
| Alternative (sparse) | `GET /projects/{project.uuid}/environments` | `environment.id === app.environment_id` | `environment.id`, `environment.uuid`, `environment.name` only — no `project_id` |

**Note:** `GET /projects/{uuid}/environments` returns a smaller shape `{ id, uuid, name }` — it omits `project_id`, `created_at`, `updated_at`, `description`. The detail endpoint `GET /projects/{uuid}` returns the full shape including `project_id` (integer). Either endpoint works for the lookup since you already know `project.uuid` from the outer loop.

---

## `destination` subtree shape (confirmed)

Present on every application object in both list (`GET /applications`) and detail (`GET /applications/{uuid}`) responses.

```
destination.id            number   — e.g. 1
destination.uuid          string   — e.g. "g8qkdb521x7flolt27bczwh6"
destination.name          string   — e.g. "coolify"
destination.network       string   — e.g. "coolify"  (Docker network name)
destination.server_id     number   — integer FK to server
destination.created_at    string
destination.updated_at    string
destination.server        object   — FULL server object inline (see Server fields above)
  destination.server.uuid   string
  destination.server.name   string
  destination.server.ip     string
  (+ all other server fields)
```

**Key:** `destination.uuid` is the `StandaloneDocker` destination UUID (NOT the server UUID). When creating a new application on a specific server via `POST /applications`, Coolify requires either `server_uuid` + `project_uuid` + `environment_name` **or** the destination uuid — exact required body fields need to be verified against the Coolify OpenAPI spec. The `destination.network` field (`"coolify"`) is the Docker network name and is likely required or defaulted when creating a new app on a given server.

---

## `GET /deployments` — item shape and status vocabulary

**Live result:** `GET /api/v1/deployments` returned HTTP 200 with an **empty array `[]`** — this Coolify instance has no deployment history recorded (apps are running but were deployed before the API was set up or history was cleared).

**No live deployment items were captured.** `GET /applications/{uuid}/deployments` returned HTTP 404 (not a valid endpoint on this Coolify version).

### Expected schema (from Coolify OpenAPI documentation, not live-confirmed)

```
deployment_uuid      string   — unique deployment identifier (NOT "uuid")
application_uuid     string   — which app was deployed
status               string   — see vocabulary below
commit_message       string
branch               string
created_at           string
updated_at           string
logs                 string   — streaming/stored build logs (may be large)
```

### Status vocabulary (from Coolify source / docs — not live-observed)

```
queued       — waiting in queue
in_progress  — currently running
finished     — completed successfully
failed       — build or deploy failed
cancelled    — manually cancelled
```

**Cannot confirm field names or status values from live data** — the instance has zero deployment records. The field names `deployment_uuid` and `application_uuid` appear in Coolify's OpenAPI spec but were not live-verified here. When live deployments are available, re-run `GET /deployments` and confirm.

---

## POST-time destination/network uuid requirement

**Finding:** When creating a new application (`POST /applications`), Coolify's required body likely includes:
- `server_uuid` — the target server's UUID (from `destination.server.uuid`)
- `project_uuid` — resolved via the algorithm above
- `environment_name` — resolved via the algorithm above (Coolify's POST endpoint uses the **name** string, not the environment integer id)
- `destination_uuid` — the `StandaloneDocker` destination UUID on the target server (NOT required if only one destination exists per server, but safest to provide)

The `destination.uuid` (`g8qkdb521x7flolt27bczwh6` on host-01, named "coolify") is what connects a server to its Docker network. Each server typically has one `StandaloneDocker` destination. To create an app on a different server, you must obtain that server's `destination.uuid` — which can be found via `GET /servers/{uuid}/destinations` or by looking at an existing app on that server.

**`GET /projects/{uuid}/environments` does NOT return resources** — the array items contain only `{ id, uuid, name }`. Resources (apps, services, databases) are not embedded in the environments list endpoint.
