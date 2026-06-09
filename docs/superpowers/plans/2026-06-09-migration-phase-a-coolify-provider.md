# Migration Phase A: Real Coolify API Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `MockCoolifyProvider` with a real `CoolifyPlatformProvider` that drives migrations through the official Coolify API, with no SSH and no orchestrator/planner/UI/state-machine redesign.

**Architecture:** A new `coolifyPlatformProvider` implements the existing `PlatformProvider` interface by mapping Coolify API responses (via the existing `coolifyService`, extended with new endpoints) to the migration domain types. Deploy is blocking and polls Coolify deployment status. Host capacity becomes advisory: only `host_exists` and `reachable` block a migration. The final change is one line: `platformProvider = coolifyPlatformProvider`.

**Tech Stack:** Next.js 15, TypeScript, Vitest, the existing `coolify/` service + client, Prisma (unchanged this phase).

**Reference spec:** `docs/superpowers/specs/2026-06-09-migration-real-providers-roadmap-design.md` (Phase A).

## Scope and caveats (read first)

- **Applications only this phase.** `listResources` returns Coolify applications, so the wizard only offers applications. Services and databases arrive in Phase B (resource-type support). `inspectResource` hardcodes `type: "application"`.
- **Volume data is still mocked.** Phase A swaps only `PlatformProvider`. `VolumeTransferService` stays `mockVolumeTransfer` until Phase F. So a volumeless application migrates for real end to end; a volume-bearing application will pass its archive/transfer/restore steps via the mock (no real data movement) until Phase F. `inspectResource` still detects volumes (via `/storages`) so the plan preview and step skipping are correct.
- **`switch_endpoints` stays a no-op** (cutover is deferred per the roadmap).
- **Response-shape risk.** Coolify JSON field names vary by version. Task 1 captures the real shapes from the live instance; the types in later tasks are based on documented Coolify and MUST be reconciled with Task 1 findings.

**Conventions:** services are `import "server-only"` singleton objects; service tests `vi.mock("./client")` and assert `coolifyFetch` calls; provider/validation tests `vi.mock` their dependency module. Run one test file with `npx vitest run <path>`. `new Date()` / `Date.now()` are fine in app code.

---

## Task 1: Live Coolify reconnaissance (read-only, no production code)

**Files:**
- Create: `docs/superpowers/notes/coolify-api-shapes.md` (captured real response shapes)

This de-risks every later task. It performs READ-ONLY GETs against the live Coolify the user configured in Settings and records the actual JSON field names. No writes, no deploys, no deletes.

- [ ] **Step 1: Write a read-only recon script and run it**

Create a throwaway script (do not commit the script) and run it with `node`:

```js
// recon.mjs  (delete after use; do NOT commit)
import fs from "node:fs";
// load .env
for (const line of fs.readFileSync(".env","utf8").split("\n")) {
  const m = line.match(/^([A-Za-z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g,"");
}
// resolve Coolify creds: env fallback OR the encrypted Settings store.
// If creds are only in Settings, read COOLIFY_BASE_URL / COOLIFY_API_TOKEN from env for this recon;
// otherwise ask the user to export them for this one script run.
const base = (process.env.COOLIFY_BASE_URL || "").replace(/\/+$/,"");
const token = process.env.COOLIFY_API_TOKEN || "";
if (!base || !token) { console.error("Set COOLIFY_BASE_URL and COOLIFY_API_TOKEN in env for recon"); process.exit(1); }
const api = (p) => fetch(`${base}/api/v1${p}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }).then(r => r.json());
const out = {};
out.servers = await api("/servers");
const serverUuid = out.servers?.[0]?.uuid;
if (serverUuid) {
  out.serverDetail = await api(`/servers/${serverUuid}`);
  out.serverValidate = await api(`/servers/${serverUuid}/validate`);
  out.serverResources = await api(`/servers/${serverUuid}/resources`);
}
out.applications = await api("/applications");
const appUuid = out.applications?.[0]?.uuid;
if (appUuid) {
  out.appDetail = await api(`/applications/${appUuid}`);
  out.appStorages = await api(`/applications/${appUuid}/storages`);
}
console.log(JSON.stringify(out, null, 2));
```

Run: `COOLIFY_BASE_URL=... COOLIFY_API_TOKEN=... node recon.mjs > /tmp/coolify-recon.json`
Expected: real JSON for servers, server detail/validate/resources, applications, app detail, app storages.

- [ ] **Step 2: Record the field names that matter**

Create `docs/superpowers/notes/coolify-api-shapes.md` documenting, from the recon output, the EXACT field names for:
- server: the `ip` field name (e.g. `ip`), `uuid`, `name`.
- server validate: shape (a `{reachable}` flag, a message string, or HTTP 200 only).
- server resources: each entry's `name`, `uuid`, `type`/`status` fields.
- application list + detail: `uuid`, `name`, `fqdn`, `git_repository`, `git_branch`, `build_pack`, `ports_exposes`, and how project/environment/server are referenced (`project_uuid`? `environment_name`? `server_uuid`? nested objects?).
- app storages: each entry's `name`, `mount_path`/`host_path`.
- deploy + deployment: capture the POST `/deploy?uuid=` response shape and a `GET /deployments/{uuid}` shape if a recent deployment uuid is available (note the `status` vocabulary: queued/in_progress/finished/failed).

Note any field that differs from the assumptions in Tasks 2 to 6 so later tasks can be adjusted.

- [ ] **Step 3: Delete the recon script and commit the notes**

```bash
rm -f recon.mjs
git add docs/superpowers/notes/coolify-api-shapes.md
git commit -m "docs(migration): capture live Coolify API response shapes for Phase A"
```

If the live instance is unreachable, record that and proceed using the documented shapes in the tasks below; flag the types as unverified in the notes file.

---

## Task 2: Extend Coolify types

**Files:**
- Modify: `src/services/coolify/types.ts`

Add response types for the new endpoints and extend existing ones. Adjust field names to match Task 1 findings.

- [ ] **Step 1: Add/extend types in `src/services/coolify/types.ts`**

Replace the `CoolifyApplication` and `CoolifyServer` interfaces with the extended versions below, and append the new interfaces:

```ts
export interface CoolifyApplication {
  uuid: string;
  name: string;
  /** Coolify lifecycle status string, e.g. "running:healthy". */
  status?: string;
  fqdn?: string | null;
  git_repository?: string | null;
  git_branch?: string | null;
  build_pack?: string | null;
  ports_exposes?: string | null;
  description?: string | null;
  // Targeting fields used by createResource inference. Verify exact names (Task 1).
  project_uuid?: string | null;
  environment_name?: string | null;
  server_uuid?: string | null;
}

export interface CoolifyServer {
  uuid: string;
  name: string;
  // Present on GET /servers. Verify the field name (Task 1).
  ip?: string | null;
  description?: string | null;
}

export interface CoolifyServerValidation {
  /** Some versions return a flag, others a message, others only HTTP 200. */
  reachable?: boolean;
  message?: string;
}

export interface CoolifyServerResource {
  uuid: string;
  name: string;
  type?: string;
  status?: string;
}

export interface CoolifyStorage {
  uuid?: string;
  name: string;
  mount_path?: string | null;
  host_path?: string | null;
}

export interface CoolifyDeployment {
  uuid?: string;
  deployment_uuid?: string;
  /** queued | in_progress | finished | failed | cancelled (verify vocabulary). */
  status?: string;
  application_uuid?: string;
}

export interface CoolifyDeployResponse {
  deployments?: Array<{ deployment_uuid?: string; resource_uuid?: string; message?: string }>;
  message?: string;
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (Existing `CreateApplicationRequest` already carries `ports_exposes`; the new fields are additive and optional.)

- [ ] **Step 3: Commit**

```bash
git add src/services/coolify/types.ts
git commit -m "feat(coolify): response types for servers, storages, deployments"
```

---

## Task 3: Extend the Coolify service

**Files:**
- Modify: `src/services/coolify/service.ts`
- Modify: `src/services/coolify/service.test.ts`

Add the new endpoint methods and change `deploy` to return the deployment response. Use GET for start/stop per documented Coolify behavior; if Task 1 shows POST, switch the method.

- [ ] **Step 1: Write failing tests in `src/services/coolify/service.test.ts`**

Append these tests inside the existing `describe("coolifyService", ...)` block:

```ts
it("getServer GETs /servers/:uuid", async () => {
  fetchMock.mockResolvedValue({ uuid: "s1", name: "Server 1", ip: "10.0.0.1" });
  await coolifyService.getServer("s1");
  expect(fetchMock).toHaveBeenCalledWith({ path: "/servers/s1" });
});

it("validateServer GETs /servers/:uuid/validate", async () => {
  fetchMock.mockResolvedValue({ reachable: true });
  await coolifyService.validateServer("s1");
  expect(fetchMock).toHaveBeenCalledWith({ path: "/servers/s1/validate" });
});

it("listServerResources GETs /servers/:uuid/resources", async () => {
  fetchMock.mockResolvedValue([{ uuid: "a", name: "app" }]);
  const r = await coolifyService.listServerResources("s1");
  expect(fetchMock).toHaveBeenCalledWith({ path: "/servers/s1/resources" });
  expect(r).toEqual([{ uuid: "a", name: "app" }]);
});

it("listStorages GETs /applications/:uuid/storages", async () => {
  fetchMock.mockResolvedValue([{ name: "data", mount_path: "/data" }]);
  await coolifyService.listStorages("a1");
  expect(fetchMock).toHaveBeenCalledWith({ path: "/applications/a1/storages" });
});

it("getDeployment GETs /deployments/:uuid", async () => {
  fetchMock.mockResolvedValue({ uuid: "d1", status: "finished" });
  await coolifyService.getDeployment("d1");
  expect(fetchMock).toHaveBeenCalledWith({ path: "/deployments/d1" });
});

it("startApplication hits /applications/:uuid/start", async () => {
  fetchMock.mockResolvedValue(undefined);
  await coolifyService.startApplication("a1");
  expect(fetchMock).toHaveBeenCalledWith({ path: "/applications/a1/start" });
});

it("stopApplication hits /applications/:uuid/stop", async () => {
  fetchMock.mockResolvedValue(undefined);
  await coolifyService.stopApplication("a1");
  expect(fetchMock).toHaveBeenCalledWith({ path: "/applications/a1/stop" });
});

it("deleteApplication DELETEs /applications/:uuid with cleanup flags", async () => {
  fetchMock.mockResolvedValue(undefined);
  await coolifyService.deleteApplication("a1");
  expect(fetchMock).toHaveBeenCalledWith({
    path: "/applications/a1",
    method: "DELETE",
    query: { delete_configurations: true, delete_volumes: false, docker_cleanup: true },
  });
});

it("deploy returns the deployment response", async () => {
  fetchMock.mockResolvedValue({ deployments: [{ deployment_uuid: "d1" }] });
  const res = await coolifyService.deploy("a1");
  expect(fetchMock).toHaveBeenCalledWith({ path: "/deploy", query: { uuid: "a1" } });
  expect(res.deployments?.[0]?.deployment_uuid).toBe("d1");
});
```

- [ ] **Step 2: Run the tests, verify they FAIL**

Run: `npx vitest run src/services/coolify/service.test.ts`
Expected: FAIL (methods not defined; `deploy` return type mismatch).

- [ ] **Step 3: Implement the new methods in `src/services/coolify/service.ts`**

Update the imports to include the new types, change `deploy`'s return type, and add the new methods. Replace the existing `deploy` method and add the rest before the closing `}` of `coolifyService`:

```ts
  async deploy(uuid: string): Promise<CoolifyDeployResponse> {
    return coolifyFetch<CoolifyDeployResponse>({
      path: "/deploy",
      query: { uuid },
    });
  },

  async getServer(uuid: string): Promise<CoolifyServer> {
    return coolifyFetch<CoolifyServer>({ path: `/servers/${uuid}` });
  },

  async validateServer(uuid: string): Promise<CoolifyServerValidation> {
    return coolifyFetch<CoolifyServerValidation>({ path: `/servers/${uuid}/validate` });
  },

  async listServerResources(uuid: string): Promise<CoolifyServerResource[]> {
    return coolifyFetch<CoolifyServerResource[]>({ path: `/servers/${uuid}/resources` });
  },

  async listStorages(uuid: string): Promise<CoolifyStorage[]> {
    return coolifyFetch<CoolifyStorage[]>({ path: `/applications/${uuid}/storages` });
  },

  async getDeployment(uuid: string): Promise<CoolifyDeployment> {
    return coolifyFetch<CoolifyDeployment>({ path: `/deployments/${uuid}` });
  },

  async startApplication(uuid: string): Promise<void> {
    await coolifyFetch<void>({ path: `/applications/${uuid}/start` });
  },

  async stopApplication(uuid: string): Promise<void> {
    await coolifyFetch<void>({ path: `/applications/${uuid}/stop` });
  },

  async deleteApplication(uuid: string): Promise<void> {
    await coolifyFetch<void>({
      path: `/applications/${uuid}`,
      method: "DELETE",
      query: { delete_configurations: true, delete_volumes: false, docker_cleanup: true },
    });
  },
```

Add the new type imports to the top `import { ... } from "./types"` block: `CoolifyDeployResponse`, `CoolifyDeployment`, `CoolifyServerValidation`, `CoolifyServerResource`, `CoolifyStorage`.

- [ ] **Step 4: Run the tests, verify they PASS**

Run: `npx vitest run src/services/coolify/service.test.ts`
Expected: PASS. Also `npx tsc --noEmit` clean (the `deploy` return change is a superset; `deploy.ts` ignores the result).

- [ ] **Step 5: Commit**

```bash
git add src/services/coolify/service.ts src/services/coolify/service.test.ts
git commit -m "feat(coolify): server/storage/deployment/lifecycle service methods"
```

---

## Task 4: Advisory host capacity

**Files:**
- Modify: `src/services/migration/types.ts`
- Modify: `src/services/migration/validation.ts`
- Modify: `src/services/migration/validation.test.ts`

Make disk/memory advisory and non-blocking. Add `metricsAvailable` to `HostCapacity` and `advisory` to `CheckResult`.

- [ ] **Step 1: Add `metricsAvailable` to `HostCapacity` in `src/services/migration/types.ts`**

Replace the `HostCapacity` interface:

```ts
export interface HostCapacity {
  hostId: string;
  reachable: boolean;
  freeMemoryMb: number;
  freeDiskMb: number;
  /** False when metrics are not measured (e.g. API-only, no SSH). */
  metricsAvailable?: boolean;
}
```

- [ ] **Step 2: Update the validation test in `src/services/migration/validation.test.ts`**

Replace the first test ("passes all five checks...") and add two advisory tests. The default `getHostCapacity` mock in `beforeEach` returns capacity numbers but no `metricsAvailable`; update it to `metricsAvailable: true` for the measured cases, and add an unmeasured case:

In `beforeEach`, change the `getHostCapacity` mock to:
```ts
  p.getHostCapacity.mockResolvedValue({
    hostId: "server-3",
    reachable: true,
    freeMemoryMb: 8192,
    freeDiskMb: 102400,
    metricsAvailable: true,
  });
```

Replace the test `"fails when free disk is below the required estimate"` with:
```ts
  it("marks disk/memory advisory and does NOT block when metrics are low but present", async () => {
    p.getHostCapacity.mockResolvedValue({
      hostId: "server-3",
      reachable: true,
      freeMemoryMb: 1,
      freeDiskMb: 1,
      metricsAvailable: true,
    });
    const report = await validationService.validate({
      sourceResourceId: "app-n8n",
      destinationHost: "server-3",
      destinationResourceName: "n8n",
    });
    const disk = report.checks.find((c) => c.key === "disk");
    expect(disk?.advisory).toBe(true);
    expect(report.ok).toBe(true); // advisory checks never block
  });

  it("shows disk/memory as not-measured when metrics are unavailable (API-only)", async () => {
    p.getHostCapacity.mockResolvedValue({
      hostId: "server-3",
      reachable: true,
      freeMemoryMb: 0,
      freeDiskMb: 0,
      metricsAvailable: false,
    });
    const report = await validationService.validate({
      sourceResourceId: "app-n8n",
      destinationHost: "server-3",
      destinationResourceName: "n8n",
    });
    const disk = report.checks.find((c) => c.key === "disk");
    expect(disk?.advisory).toBe(true);
    expect(disk?.pass).toBe(true);
    expect(disk?.detail).toMatch(/not measured/i);
    expect(report.ok).toBe(true);
  });
```

Also update the still-present first test to assert that only the blocking checks gate `ok` (replace its body):
```ts
  it("passes blocking checks for a reachable host with no duplicate (capacity advisory)", async () => {
    const report = await validationService.validate({
      sourceResourceId: "app-n8n",
      destinationHost: "server-3",
      destinationResourceName: "n8n",
    });
    expect(report.ok).toBe(true);
    expect(report.checks.map((c) => c.key)).toEqual([
      "host_exists",
      "host_reachable",
      "disk",
      "memory",
      "duplicate_name",
    ]);
    expect(report.checks.find((c) => c.key === "host_exists")?.advisory).toBeFalsy();
    expect(report.checks.find((c) => c.key === "disk")?.advisory).toBe(true);
  });
```

- [ ] **Step 3: Run the tests, verify they FAIL**

Run: `npx vitest run src/services/migration/validation.test.ts`
Expected: FAIL (advisory field undefined; `ok` still gated by disk/memory).

- [ ] **Step 4: Update `src/services/migration/validation.ts`**

Add `advisory?: boolean` to `CheckResult`, make the disk/memory checks advisory and capacity-aware, and compute `ok` from blocking checks only. Replace the `CheckResult` interface and the disk/memory push blocks and the return:

```ts
export interface CheckResult {
  key: "host_exists" | "host_reachable" | "disk" | "memory" | "duplicate_name";
  label: string;
  pass: boolean;
  detail: string;
  /** Advisory checks inform the user but never block a migration. */
  advisory?: boolean;
}
```

Replace the disk and memory `checks.push(...)` blocks with:
```ts
    const measured = capacity.metricsAvailable === true;
    const requiredDisk = volumes.reduce((sum, v) => sum + v.estimatedSizeMb, 0) + BASE_DISK_MB;
    checks.push({
      key: "disk",
      label: "Free disk (advisory)",
      advisory: true,
      pass: !measured || capacity.freeDiskMb >= requiredDisk,
      detail: measured
        ? `Needs ~${requiredDisk} MB; host has ${capacity.freeDiskMb} MB free.`
        : "Not measured (requires SSH access).",
    });

    checks.push({
      key: "memory",
      label: "Free memory (advisory)",
      advisory: true,
      pass: !measured || capacity.freeMemoryMb >= BASE_MEMORY_MB,
      detail: measured
        ? `Needs ~${BASE_MEMORY_MB} MB; host has ${capacity.freeMemoryMb} MB free.`
        : "Not measured (requires SSH access).",
    });
```

Replace the return's `ok` line:
```ts
    return {
      ok: checks.filter((c) => !c.advisory).every((c) => c.pass),
      checks,
      volumes,
      exposure,
      defaults: defaultFlags(exposure),
      source,
    };
```

- [ ] **Step 5: Run the tests, verify they PASS**

Run: `npx vitest run src/services/migration/validation.test.ts`
Expected: PASS. Also run `npx vitest run src/services/migration/orchestrator.test.ts` to confirm the orchestrator's validate handler is unaffected.

- [ ] **Step 6: Commit**

```bash
git add src/services/migration/types.ts src/services/migration/validation.ts src/services/migration/validation.test.ts
git commit -m "feat(migration): make host disk/memory checks advisory (non-blocking)"
```

---

## Task 5: CoolifyPlatformProvider read and capacity methods

**Files:**
- Create: `src/services/migration/coolify-provider.ts`
- Test: `src/services/migration/coolify-provider.test.ts`

Implement the read methods first. The provider depends on `coolifyService`; tests mock it.

- [ ] **Step 1: Write failing tests in `src/services/migration/coolify-provider.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/coolify/service", () => ({
  coolifyService: {
    listServers: vi.fn(),
    validateServer: vi.fn(),
    listApplications: vi.fn(),
    getApplication: vi.fn(),
    listEnvVars: vi.fn(),
    listStorages: vi.fn(),
    listServerResources: vi.fn(),
    createApplication: vi.fn(),
    setEnvVar: vi.fn(),
    deploy: vi.fn(),
    getDeployment: vi.fn(),
    updateApplication: vi.fn(),
    startApplication: vi.fn(),
    stopApplication: vi.fn(),
    deleteApplication: vi.fn(),
  },
}));

import { coolifyService } from "@/services/coolify/service";
import { coolifyPlatformProvider } from "./coolify-provider";

const cs = coolifyService as unknown as Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("coolifyPlatformProvider read methods", () => {
  it("listHosts maps servers to {id,name,ip}", async () => {
    cs.listServers.mockResolvedValue([{ uuid: "s1", name: "Server 1", ip: "10.0.0.1" }]);
    expect(await coolifyPlatformProvider.listHosts()).toEqual([
      { id: "s1", name: "Server 1", ip: "10.0.0.1" },
    ]);
  });

  it("getHostCapacity reports reachable with metricsAvailable false", async () => {
    cs.validateServer.mockResolvedValue({ reachable: true });
    const cap = await coolifyPlatformProvider.getHostCapacity("s1");
    expect(cap).toEqual({
      hostId: "s1",
      reachable: true,
      freeMemoryMb: 0,
      freeDiskMb: 0,
      metricsAvailable: false,
    });
  });

  it("getHostCapacity reports unreachable when validate throws", async () => {
    cs.validateServer.mockRejectedValue(new Error("nope"));
    const cap = await coolifyPlatformProvider.getHostCapacity("s1");
    expect(cap.reachable).toBe(false);
    expect(cap.metricsAvailable).toBe(false);
  });

  it("listResources maps applications and resolves host names", async () => {
    cs.listServers.mockResolvedValue([{ uuid: "s1", name: "Server 1", ip: "10.0.0.1" }]);
    cs.listApplications.mockResolvedValue([
      { uuid: "a1", name: "web", fqdn: "web.example.com", server_uuid: "s1", environment_name: "production" },
    ]);
    const res = await coolifyPlatformProvider.listResources();
    expect(res[0]).toMatchObject({
      id: "a1",
      name: "web",
      hostId: "s1",
      hostName: "Server 1",
      domains: ["web.example.com"],
    });
  });

  it("inspectResource composes app + envs + storages into a ResourceInfo", async () => {
    cs.getApplication.mockResolvedValue({
      uuid: "a1", name: "web", fqdn: "web.example.com,web.10.0.0.1.sslip.io",
      git_repository: "https://github.com/x/y", git_branch: "main",
      build_pack: "nixpacks", ports_exposes: "3000",
      project_uuid: "p1", environment_name: "production", server_uuid: "s1",
    });
    cs.listEnvVars.mockResolvedValue([{ key: "NODE_ENV", value: "production" }]);
    cs.listStorages.mockResolvedValue([{ name: "web_data", mount_path: "/data" }]);
    const info = await coolifyPlatformProvider.inspectResource("a1");
    expect(info.id).toBe("a1");
    expect(info.type).toBe("application");
    expect(info.domains).toEqual(["web.example.com", "web.10.0.0.1.sslip.io"]);
    expect(info.envVars).toEqual([{ key: "NODE_ENV", value: "production" }]);
    expect(info.volumes).toEqual([{ name: "web_data", estimatedSizeMb: 0 }]);
    expect(info.buildConfig).toMatchObject({
      git_repository: "https://github.com/x/y",
      git_branch: "main",
      build_pack: "nixpacks",
      ports_exposes: "3000",
      project_uuid: "p1",
      environment_name: "production",
    });
  });

  it("resourceExistsOnHost matches by name among server resources", async () => {
    cs.listServerResources.mockResolvedValue([{ uuid: "a1", name: "web" }]);
    expect(await coolifyPlatformProvider.resourceExistsOnHost("s1", "web")).toBe(true);
    expect(await coolifyPlatformProvider.resourceExistsOnHost("s1", "other")).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

Run: `npx vitest run src/services/migration/coolify-provider.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Create `src/services/migration/coolify-provider.ts` with the read methods + stubs**

```ts
import "server-only";
import { randomBytes } from "node:crypto";
import { coolifyService } from "@/services/coolify/service";
import type { PlatformProvider } from "./provider";
import { MigrationError } from "./types";
import type {
  CreateResourceSpec,
  HostCapacity,
  HostSummary,
  MigrationJobLike,
  ResourceInfo,
  ResourceSummary,
  VolumeInfo,
} from "./types";

const DEPLOY_TIMEOUT_MS = 10 * 60 * 1000;
const DEPLOY_POLL_MS = 5_000;

function splitDomains(fqdn: string | null | undefined): string[] {
  if (!fqdn) return [];
  return fqdn.split(",").map((d) => d.trim()).filter(Boolean);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const coolifyPlatformProvider: PlatformProvider = {
  async listHosts(): Promise<HostSummary[]> {
    const servers = await coolifyService.listServers();
    return servers.map((s) => ({ id: s.uuid, name: s.name, ip: s.ip ?? "" }));
  },

  async getHostCapacity(hostId: string): Promise<HostCapacity> {
    let reachable = false;
    try {
      const v = await coolifyService.validateServer(hostId);
      // A successful validate call implies reachable unless it says otherwise.
      reachable = v.reachable ?? true;
    } catch {
      reachable = false;
    }
    return { hostId, reachable, freeMemoryMb: 0, freeDiskMb: 0, metricsAvailable: false };
  },

  async listResources(): Promise<ResourceSummary[]> {
    const [apps, servers] = await Promise.all([
      coolifyService.listApplications(),
      coolifyService.listServers(),
    ]);
    const nameByUuid = new Map(servers.map((s) => [s.uuid, s.name]));
    return apps.map((a) => ({
      id: a.uuid,
      name: a.name,
      environment: a.environment_name ?? "",
      hostId: a.server_uuid ?? "",
      hostName: nameByUuid.get(a.server_uuid ?? "") ?? "",
      domains: splitDomains(a.fqdn),
    }));
  },

  async inspectResource(id: string): Promise<ResourceInfo> {
    const app = await coolifyService.getApplication(id);
    const [envs, storages] = await Promise.all([
      coolifyService.listEnvVars(id),
      coolifyService.listStorages(id).catch(() => []),
    ]);
    const volumes: VolumeInfo[] = storages.map((s) => ({
      name: s.name,
      estimatedSizeMb: 0, // size is not exposed via the API; advisory only.
    }));
    return {
      id: app.uuid,
      name: app.name,
      environment: app.environment_name ?? "",
      hostId: app.server_uuid ?? "",
      hostName: "",
      domains: splitDomains(app.fqdn),
      type: "application",
      envVars: envs.map((e) => ({ key: e.key, value: e.value })),
      buildConfig: {
        git_repository: app.git_repository ?? "",
        git_branch: app.git_branch ?? "main",
        build_pack: app.build_pack ?? "nixpacks",
        ports_exposes: app.ports_exposes ?? "3000",
        project_uuid: app.project_uuid ?? "",
        environment_name: app.environment_name ?? "production",
      },
      volumes,
    };
  },

  async resourceExistsOnHost(hostId: string, name: string): Promise<boolean> {
    const resources = await coolifyService.listServerResources(hostId);
    return resources.some((r) => r.name === name);
  },

  // Action methods implemented in Task 6.
  async createResource(_spec: CreateResourceSpec): Promise<{ resourceId: string }> {
    throw new MigrationError("createResource not implemented yet.", "NOT_IMPLEMENTED");
  },
  async deployResource(_id: string): Promise<void> {
    throw new MigrationError("deployResource not implemented yet.", "NOT_IMPLEMENTED");
  },
  async generateValidationUrl(_id: string, _hostIp: string): Promise<string> {
    throw new MigrationError("generateValidationUrl not implemented yet.", "NOT_IMPLEMENTED");
  },
  async stopResource(_id: string): Promise<void> {
    throw new MigrationError("stopResource not implemented yet.", "NOT_IMPLEMENTED");
  },
  async startResource(_id: string): Promise<void> {
    throw new MigrationError("startResource not implemented yet.", "NOT_IMPLEMENTED");
  },
  async switchEndpoints(_job: MigrationJobLike): Promise<void> {
    // Endpoint switching is deferred (roadmap). No-op this phase.
  },
  async deleteResource(_id: string): Promise<void> {
    throw new MigrationError("deleteResource not implemented yet.", "NOT_IMPLEMENTED");
  },
};

// Internal constants used by Task 6 (exported for that task's use).
export const __deployTiming = { DEPLOY_TIMEOUT_MS, DEPLOY_POLL_MS, sleep, splitDomains, randomBytes };
```

(The `__deployTiming` export keeps Task 6's additions self-contained; you will inline these when implementing the action methods and may remove the export afterward.)

- [ ] **Step 4: Run, verify PASS**

Run: `npx vitest run src/services/migration/coolify-provider.test.ts`
Expected: PASS (read methods green; action methods still stubbed and untested).

- [ ] **Step 5: Commit**

```bash
git add src/services/migration/coolify-provider.ts src/services/migration/coolify-provider.test.ts
git commit -m "feat(migration): CoolifyPlatformProvider read + capacity methods"
```

---

## Task 6: CoolifyPlatformProvider action methods

**Files:**
- Modify: `src/services/migration/coolify-provider.ts`
- Modify: `src/services/migration/coolify-provider.test.ts`

Implement create/deploy/url/start/stop/delete. Deploy blocks and polls.

- [ ] **Step 1: Add failing tests for the action methods**

Append to `coolify-provider.test.ts`:

```ts
describe("coolifyPlatformProvider action methods", () => {
  const snapshot = {
    id: "src", name: "web", environment: "production",
    hostId: "s1", hostName: "Server 1", domains: ["web.example.com"],
    type: "application",
    envVars: [{ key: "NODE_ENV", value: "production" }],
    buildConfig: {
      git_repository: "https://github.com/x/y", git_branch: "main",
      build_pack: "nixpacks", ports_exposes: "3000",
      project_uuid: "p1", environment_name: "production",
    },
    volumes: [],
  };

  it("createResource builds from the snapshot and replicates env vars", async () => {
    cs.createApplication.mockResolvedValue({ uuid: "dest1" });
    cs.setEnvVar.mockResolvedValue(undefined);
    const res = await coolifyPlatformProvider.createResource({
      name: "web-copy", destinationHostId: "s2", snapshot,
    } as any);
    expect(res).toEqual({ resourceId: "dest1" });
    expect(cs.createApplication).toHaveBeenCalledWith(expect.objectContaining({
      project_uuid: "p1", server_uuid: "s2", environment_name: "production",
      git_repository: "https://github.com/x/y", git_branch: "main",
      build_pack: "nixpacks", ports_exposes: "3000", name: "web-copy",
    }));
    expect(cs.setEnvVar).toHaveBeenCalledWith("dest1", "NODE_ENV", "production");
  });

  it("createResource throws when project cannot be inferred", async () => {
    await expect(coolifyPlatformProvider.createResource({
      name: "web-copy", destinationHostId: "s2",
      snapshot: { ...snapshot, buildConfig: { ...snapshot.buildConfig, project_uuid: "" } },
    } as any)).rejects.toThrow(/project/i);
  });

  it("deployResource polls until the deployment finishes", async () => {
    cs.deploy.mockResolvedValue({ deployments: [{ deployment_uuid: "d1" }] });
    cs.getDeployment
      .mockResolvedValueOnce({ status: "in_progress" })
      .mockResolvedValueOnce({ status: "finished" });
    await coolifyPlatformProvider.deployResource("dest1");
    expect(cs.deploy).toHaveBeenCalledWith("dest1");
    expect(cs.getDeployment).toHaveBeenCalledTimes(2);
  });

  it("deployResource throws when the deployment fails", async () => {
    cs.deploy.mockResolvedValue({ deployments: [{ deployment_uuid: "d1" }] });
    cs.getDeployment.mockResolvedValue({ status: "failed" });
    await expect(coolifyPlatformProvider.deployResource("dest1")).rejects.toThrow(/deploy/i);
  });

  it("generateValidationUrl returns the Coolify-assigned fqdn when present", async () => {
    cs.getApplication.mockResolvedValue({ uuid: "dest1", name: "web", fqdn: "https://abc.10.0.0.2.sslip.io" });
    const url = await coolifyPlatformProvider.generateValidationUrl("dest1", "10.0.0.2");
    expect(url).toBe("https://abc.10.0.0.2.sslip.io");
  });

  it("stop/start/delete delegate to the service", async () => {
    cs.stopApplication.mockResolvedValue(undefined);
    cs.startApplication.mockResolvedValue(undefined);
    cs.deleteApplication.mockResolvedValue(undefined);
    await coolifyPlatformProvider.stopResource("a1");
    await coolifyPlatformProvider.startResource("a1");
    await coolifyPlatformProvider.deleteResource("a1");
    expect(cs.stopApplication).toHaveBeenCalledWith("a1");
    expect(cs.startApplication).toHaveBeenCalledWith("a1");
    expect(cs.deleteApplication).toHaveBeenCalledWith("a1");
  });
});
```

Set the deploy poll interval short in tests by mocking timers is not needed because the implementation awaits `sleep`; to keep the test fast, the implementation uses a small poll when `getDeployment` resolves quickly. Keep `DEPLOY_POLL_MS` but the test only needs two polls; if the 5s wait makes the test slow, use `vi.useFakeTimers()` in this describe block:

```ts
import { vi } from "vitest";
// At the top of the action describe block:
beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });
afterEach(() => { vi.useRealTimers(); });
```

- [ ] **Step 2: Run, verify FAIL**

Run: `npx vitest run src/services/migration/coolify-provider.test.ts`
Expected: FAIL (action methods throw NOT_IMPLEMENTED).

- [ ] **Step 3: Implement the action methods**

Replace the stub action methods in `coolify-provider.ts` with real implementations (and remove the `__deployTiming` export). Use the `DEPLOY_TIMEOUT_MS`, `DEPLOY_POLL_MS`, `sleep`, `splitDomains`, and `randomBytes` already defined at the top of the file:

```ts
  async createResource(spec: CreateResourceSpec): Promise<{ resourceId: string }> {
    const cfg = spec.snapshot.buildConfig as Record<string, string>;
    if (!cfg.project_uuid) {
      throw new MigrationError(
        "Cannot infer the destination project for this resource. (Explicit targeting arrives in Phase C.)",
        "INFER_FAILED",
      );
    }
    const created = await coolifyService.createApplication({
      project_uuid: cfg.project_uuid,
      server_uuid: spec.destinationHostId,
      environment_name: cfg.environment_name || "production",
      git_repository: cfg.git_repository,
      git_branch: cfg.git_branch || "main",
      build_pack: cfg.build_pack || "nixpacks",
      ports_exposes: cfg.ports_exposes || "3000",
      name: spec.name,
    });
    for (const ev of spec.snapshot.envVars) {
      await coolifyService.setEnvVar(created.uuid, ev.key, ev.value);
    }
    return { resourceId: created.uuid };
  },

  async deployResource(id: string): Promise<void> {
    const res = await coolifyService.deploy(id);
    const deploymentUuid = res.deployments?.[0]?.deployment_uuid;
    if (!deploymentUuid) {
      // Older Coolify returns only a message and cannot be polled; best effort.
      return;
    }
    const deadline = Date.now() + DEPLOY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const dep = await coolifyService.getDeployment(deploymentUuid);
      const status = (dep.status ?? "").toLowerCase();
      if (status.includes("finish") || status === "success" || status === "running") return;
      if (status.includes("fail") || status.includes("error") || status.includes("cancel")) {
        throw new MigrationError(`Coolify deployment ${status || "failed"}.`, "DEPLOY_FAILED");
      }
      await sleep(DEPLOY_POLL_MS);
    }
    throw new MigrationError("Coolify deployment timed out.", "DEPLOY_TIMEOUT");
  },

  async generateValidationUrl(id: string, hostIp: string): Promise<string> {
    const app = await coolifyService.getApplication(id);
    const existing = splitDomains(app.fqdn)[0];
    if (existing) return existing.startsWith("http") ? existing : `https://${existing}`;
    // Fallback: assign a fresh sslip domain and redeploy so it takes effect.
    const url = `https://${randomBytes(4).toString("hex")}.${hostIp}.sslip.io`;
    await coolifyService.updateApplication(id, { domains: url });
    await this.deployResource(id);
    return url;
  },

  async stopResource(id: string): Promise<void> {
    await coolifyService.stopApplication(id);
  },

  async startResource(id: string): Promise<void> {
    await coolifyService.startApplication(id);
  },

  async switchEndpoints(_job: MigrationJobLike): Promise<void> {
    // Endpoint switching is deferred (roadmap). No-op this phase.
  },

  async deleteResource(id: string): Promise<void> {
    await coolifyService.deleteApplication(id);
  },
```

Note: `status === "running"` is treated as success because a Coolify app reaching running state means the deploy finished; adjust the success/failure vocabulary to match Task 1's findings.

- [ ] **Step 4: Run, verify PASS**

Run: `npx vitest run src/services/migration/coolify-provider.test.ts`
Expected: PASS (all read + action tests). Also `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add src/services/migration/coolify-provider.ts src/services/migration/coolify-provider.test.ts
git commit -m "feat(migration): CoolifyPlatformProvider create/deploy/url/lifecycle methods"
```

---

## Task 7: Swap the provider, advisory UI, and verify

**Files:**
- Modify: `src/services/migration/provider.ts`
- Modify: `src/services/migration/mock-coolify.ts` (keep, but stop using as default)
- Modify: `src/components/migration/migration-wizard.tsx` (advisory display)

- [ ] **Step 1: Swap the default provider in `src/services/migration/provider.ts`**

Change the import and the export line. Replace:
```ts
import { mockCoolifyProvider } from "./mock-coolify";
```
with:
```ts
import { coolifyPlatformProvider } from "./coolify-provider";
```
and replace:
```ts
export const platformProvider: PlatformProvider = mockCoolifyProvider;
```
with:
```ts
export const platformProvider: PlatformProvider = coolifyPlatformProvider;
```

Leave `mock-coolify.ts` in place (its test still runs and it remains a fallback for local development).

- [ ] **Step 2: Show advisory checks distinctly in the wizard**

In `src/components/migration/migration-wizard.tsx`, in the Step 4 checks map, render advisory checks with a neutral marker instead of a red X. Replace the checks `.map(...)` block with:

```tsx
            {preview.report.checks.map((c) => (
              <div key={c.key} className="flex items-start gap-2 text-sm">
                {c.advisory ? (
                  <Info className="mt-0.5 h-4 w-4 text-muted-foreground" />
                ) : c.pass ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 text-red-500" />
                )}
                <span className={c.advisory ? "text-muted-foreground" : undefined}>
                  <span className="font-medium">{c.label}</span>: {c.detail}
                </span>
              </div>
            ))}
```

Add `Info` to the lucide-react import at the top of the file (the existing import line is `import { CheckCircle2, Loader2, XCircle, ArrowRight } from "lucide-react";`):
```tsx
import { CheckCircle2, Info, Loader2, XCircle, ArrowRight } from "lucide-react";
```

- [ ] **Step 3: Full verification**

Run: `npm test`
Expected: all pass (existing suites plus the new coolify-provider and updated validation/service tests).

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/services/migration/provider.ts src/components/migration/migration-wizard.tsx
git commit -m "feat(migration): use real CoolifyPlatformProvider; advisory capacity in wizard"
```

- [ ] **Step 5: Live integration smoke test (manual, against the user's Coolify)**

This cannot be unit-tested; it requires the running app and the live Coolify. With the dev server running and Coolify configured in Settings:

1. Open `/migrations/new`. Confirm Step 1 lists real Coolify applications and Step 3 lists real servers.
2. Choose a SAFE, volumeless test application, migration type **Clone** (non-destructive), and a destination server.
3. Validate: confirm `host_exists` and `reachable` pass and disk/memory show as advisory ("Not measured").
4. Review the plan and Execute. Watch `/migrations/[id]`: validate, provision, deploy (this blocks while polling), and validation_url should complete; the job reaches `completed` for a clone and surfaces the validation URL.
5. Open the validation URL and confirm the cloned app responds.
6. Delete the test clone from Coolify to clean up.

Record any field-name mismatches discovered here and fix the corresponding type/service/provider line (these are the verification points flagged throughout). Do NOT test Migrate (destructive cutover/delete) against a real resource until you are confident; cutover is a no-op this phase but `delete_source` will really delete.

---

## Self-Review

**Spec coverage (Phase A section):**
- listHosts, listResources, inspectResource, resourceExistsOnHost, createResource (inference), deployResource (blocking poll), generateValidationUrl (after deploy), stopResource, startResource, deleteResource: Tasks 5 and 6.
- getHostCapacity reachability only + advisory capacity: Tasks 4, 5.
- switchEndpoints no-op: Tasks 5, 6.
- Validation URL only after successful deploy: orchestrator order is unchanged (deploy step precedes validation_url); `generateValidationUrl` reads the deployed app's fqdn. Covered.
- Provider swap success criterion (one line): Task 7 Step 1.
- No orchestrator/planner/state-machine change: confirmed, none of those files are touched.

**Placeholder scan:** none. Every code step is complete. The only deliberately-flagged uncertainty is response field names, addressed by the Task 1 recon and the per-method verify notes.

**Type consistency:** `coolifyService` method names (`listServers`, `validateServer`, `listServerResources`, `listStorages`, `getDeployment`, `startApplication`, `stopApplication`, `deleteApplication`, `getServer`, `deploy` returning `CoolifyDeployResponse`) are identical across Task 3 (definition) and Tasks 5 and 6 (callers). `HostCapacity.metricsAvailable` and `CheckResult.advisory` are defined in Task 4 and consumed in Tasks 4, 5, and 7. `coolifyPlatformProvider` satisfies the unchanged `PlatformProvider` interface from the foundation.

## Notes for the implementer

- **Applications-only and volumes-mocked** are intentional Phase A limitations (Phase B adds resource types; Phase F adds real volume transfer). Do not try to wire real volume transfer here.
- **deployResource blocks for minutes.** That is by design and fine on the always-on Node server. Do not split it into multiple steps (that would change the planner/state machine).
- **Field-name verification is the main risk.** Treat Task 1 as load-bearing; reconcile the types against it before trusting the provider against the live instance.
