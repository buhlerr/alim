# Migration Engine Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the foundation for migrating Coolify resources between servers — a single canonical migration workflow, a separate non-destructive clone workflow, full job tracking, validation, and a 7-step wizard — with every external integration mocked behind a swappable interface.

**Architecture:** `MigrationJob` (+ `MigrationStep`, `MigrationLog`, `MigrationArtifact`) is the DB source of truth. A pure `planner` emits a fixed step sequence; a `MigrationOrchestratorService` advances exactly one idempotent step per call; an `ApprovalService` owns the approval/rollback gate. All platform/volume work goes through the `PlatformProvider` and `VolumeTransferService` interfaces, implemented this phase by deterministic mocks. The UI polls server actions and drives the orchestrator one step at a time.

**Tech Stack:** Next.js 15 (App Router, server actions), Prisma 6 + PostgreSQL, Zod, Vitest, Tailwind + shadcn/Radix UI, Lucide icons.

**Reference spec:** `docs/superpowers/specs/2026-06-09-migration-engine-foundation-design.md`

**Conventions to follow (already in this codebase):**
- Services are singleton objects of async methods, `import "server-only"` at the top of server-only files.
- Client-safe constants/types live in `src/lib/*`; server-only logic in `src/services/*`.
- Tests are Vitest, colocated as `*.test.ts`. `server-only`/`client-only` are stubbed by `vitest.config.ts`. Prisma is mocked with `vi.mock("@/lib/prisma", ...)`.
- Statuses are `String` columns with TS unions + constant maps in `src/lib`.
- Server actions return `ActionResult<T> = { ok, error?, fieldErrors?, data? }`.
- Run a single test file with: `npx vitest run src/path/to/file.test.ts`.

---

## Task 1: Prisma schema + migration

**Files:**
- Modify: `prisma/schema.prisma` (append four models)

- [ ] **Step 1: Append the four models to `prisma/schema.prisma`**

Add at the end of the file:

```prisma
/// A clone or migration of a Coolify resource from one server to another.
/// The single source of truth for an in-flight or completed operation; all
/// progress is recoverable from this row plus its steps/logs/artifacts.
model MigrationJob {
  id                      String    @id @default(cuid())
  migrationType           String    @map("migration_type") // "clone" | "migrate"
  sourceResourceId        String    @map("source_resource_id")
  sourceResourceName      String    @map("source_resource_name")
  destinationResourceName String    @map("destination_resource_name")
  sourceHost              String    @map("source_host")
  sourceHostName          String    @map("source_host_name")
  destinationHost         String    @map("destination_host")
  destinationHostName     String    @map("destination_host_name")
  status                  String    @default("pending")
  exposure                String // "internal" | "public"
  validationUrl           String?   @map("validation_url")
  npmEnabled              Boolean   @default(false) @map("npm_enabled")
  cloudflareEnabled       Boolean   @default(false) @map("cloudflare_enabled")
  currentStepKey          String?   @map("current_step_key")
  // The exact source config the destination is provisioned from, captured at
  // execution start so the validated resource IS the promoted resource.
  sourceResourceSnapshot  Json      @map("source_resource_snapshot")
  errorMessage            String?   @map("error_message")
  createdAt               DateTime  @default(now()) @map("created_at")
  updatedAt               DateTime  @updatedAt @map("updated_at")
  approvedAt              DateTime? @map("approved_at")
  completedAt             DateTime? @map("completed_at")

  steps     MigrationStep[]
  logs      MigrationLog[]
  artifacts MigrationArtifact[]

  @@index([status])
  @@index([createdAt])
  @@map("migration_jobs")
}

/// One row per workflow step. Enables resumability: on restart the orchestrator
/// finds the first non-final step and continues. `attemptNumber` increments when
/// a step left "running" by a crash is retried.
model MigrationStep {
  id            String       @id @default(cuid())
  jobId         String       @map("job_id")
  job           MigrationJob @relation(fields: [jobId], references: [id], onDelete: Cascade)
  key           String
  label         String
  order         Int          @map("step_order")
  status        String       @default("pending") // pending|running|success|failed|skipped
  attemptNumber Int          @default(1) @map("attempt_number")
  detail        String?
  startedAt     DateTime?    @map("started_at")
  finishedAt    DateTime?    @map("finished_at")

  @@unique([jobId, key])
  @@index([jobId])
  @@map("migration_steps")
}

/// Persistent, append-only log lines for a job (and optionally a step). Drives
/// the live log stream and survives reloads.
model MigrationLog {
  id        String       @id @default(cuid())
  jobId     String       @map("job_id")
  job       MigrationJob @relation(fields: [jobId], references: [id], onDelete: Cascade)
  stepKey   String?      @map("step_key")
  level     String       @default("info") // info|warn|error
  message   String
  createdAt DateTime     @default(now()) @map("created_at")

  @@index([jobId, createdAt])
  @@map("migration_logs")
}

/// Tracked outputs created during a run (destination resource id, volume
/// archives, validation URL). Rollback reads these to know what to compensate.
model MigrationArtifact {
  id        String       @id @default(cuid())
  jobId     String       @map("job_id")
  job       MigrationJob @relation(fields: [jobId], references: [id], onDelete: Cascade)
  type      String
  reference String
  metadata  Json?
  createdAt DateTime     @default(now()) @map("created_at")

  @@index([jobId])
  @@map("migration_artifacts")
}
```

- [ ] **Step 2: Create and apply the migration**

Run: `npx prisma migrate dev --name migration_engine`
Expected: a new folder under `prisma/migrations/` and "Your database is now in sync". This also regenerates the Prisma client.

If the database is unreachable, generate the SQL without applying and apply later:
Run: `npx prisma migrate dev --name migration_engine --create-only` then `npx prisma generate`.

- [ ] **Step 3: Verify the client typechecks**

Run: `npx tsc --noEmit`
Expected: no errors referencing `MigrationJob`/`MigrationStep`/`MigrationLog`/`MigrationArtifact`.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(migration): add MigrationJob/Step/Log/Artifact schema"
```

---

## Task 2: Client-safe constants & helpers (`src/lib/migration.ts`)

**Files:**
- Create: `src/lib/migration.ts`
- Test: `src/lib/migration.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/migration.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  classifyExposure,
  defaultFlags,
  isSslipDomain,
  buildSslipUrl,
  isTerminalStatus,
} from "./migration";

describe("isSslipDomain", () => {
  it("recognizes sslip.io hosts (with or without scheme/path)", () => {
    expect(isSslipDomain("abc123.192.168.100.11.sslip.io")).toBe(true);
    expect(isSslipDomain("https://abc.10.0.0.1.sslip.io/path")).toBe(true);
    expect(isSslipDomain("layerr.aspyrelabs.com")).toBe(false);
  });
});

describe("classifyExposure", () => {
  it("is internal when there are no domains", () => {
    expect(classifyExposure([])).toBe("internal");
  });
  it("is internal when all domains are sslip.io", () => {
    expect(classifyExposure(["a.10.0.0.1.sslip.io"])).toBe("internal");
  });
  it("is public when any domain is custom", () => {
    expect(classifyExposure(["a.10.0.0.1.sslip.io", "app.example.com"])).toBe("public");
  });
});

describe("defaultFlags", () => {
  it("turns NPM + Cloudflare on for public, off for internal", () => {
    expect(defaultFlags("public")).toEqual({ npmEnabled: true, cloudflareEnabled: true });
    expect(defaultFlags("internal")).toEqual({ npmEnabled: false, cloudflareEnabled: false });
  });
});

describe("buildSslipUrl", () => {
  it("builds an https sslip.io url from a subdomain and host ip", () => {
    expect(buildSslipUrl("abc123", "192.168.100.11")).toBe(
      "https://abc123.192.168.100.11.sslip.io",
    );
  });
});

describe("isTerminalStatus", () => {
  it("treats completed/failed/rolled_back as terminal only", () => {
    expect(isTerminalStatus("completed")).toBe(true);
    expect(isTerminalStatus("failed")).toBe(true);
    expect(isTerminalStatus("rolled_back")).toBe(true);
    expect(isTerminalStatus("awaiting_approval")).toBe(false);
    expect(isTerminalStatus("provisioning")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/migration.test.ts`
Expected: FAIL — cannot find module `./migration`.

- [ ] **Step 3: Implement `src/lib/migration.ts`**

```ts
/**
 * Client-safe migration constants, unions, and pure helpers. No server-only
 * imports so wizard/list/detail client components and shared validation can use
 * these freely.
 */

export type MigrationType = "clone" | "migrate";
export const MIGRATION_TYPES: MigrationType[] = ["clone", "migrate"];

export type MigrationStatus =
  | "pending"
  | "validating"
  | "provisioning"
  | "transferring"
  | "deploying"
  | "awaiting_approval"
  | "cutting_over"
  | "completed"
  | "failed"
  | "rolled_back";

export type StepStatus = "pending" | "running" | "success" | "failed" | "skipped";
export type LogLevel = "info" | "warn" | "error";
export type Exposure = "internal" | "public";

const TERMINAL: MigrationStatus[] = ["completed", "failed", "rolled_back"];

export function isTerminalStatus(status: string): boolean {
  return (TERMINAL as string[]).includes(status);
}

export const STATUS_LABELS: Record<MigrationStatus, string> = {
  pending: "Pending",
  validating: "Validating",
  provisioning: "Provisioning",
  transferring: "Transferring",
  deploying: "Deploying",
  awaiting_approval: "Awaiting approval",
  cutting_over: "Cutting over",
  completed: "Completed",
  failed: "Failed",
  rolled_back: "Rolled back",
};

/** Strip scheme + path and report whether the host is an sslip.io address. */
export function isSslipDomain(domain: string): boolean {
  const host = domain
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
  return host === "sslip.io" || host.endsWith(".sslip.io");
}

/**
 * Resources whose only domains are sslip.io (or which have none) are internal;
 * any custom domain makes a resource public.
 */
export function classifyExposure(domains: string[]): Exposure {
  const real = domains.map((d) => d.trim()).filter(Boolean);
  if (real.length === 0) return "internal";
  return real.every(isSslipDomain) ? "internal" : "public";
}

export interface ExposureDefaults {
  npmEnabled: boolean;
  cloudflareEnabled: boolean;
}

export function defaultFlags(exposure: Exposure): ExposureDefaults {
  return exposure === "public"
    ? { npmEnabled: true, cloudflareEnabled: true }
    : { npmEnabled: false, cloudflareEnabled: false };
}

/** e.g. buildSslipUrl("abc123", "192.168.100.11") -> https://abc123.192.168.100.11.sslip.io */
export function buildSslipUrl(subdomain: string, hostIp: string): string {
  return `https://${subdomain}.${hostIp}.sslip.io`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/migration.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/migration.ts src/lib/migration.test.ts
git commit -m "feat(migration): client-safe constants, exposure + sslip helpers"
```

---

## Task 3: Domain types & error (`src/services/migration/types.ts`)

**Files:**
- Create: `src/services/migration/types.ts`

These types are consumed by the provider, store, validation, and orchestrator tasks. No test (pure type declarations + a thin error class mirroring `CoolifyError`).

- [ ] **Step 1: Create `src/services/migration/types.ts`**

```ts
import type { Exposure } from "@/lib/migration";

/** Typed, credential-free error carrying a stable code (mirrors CoolifyError). */
export class MigrationError extends Error {
  constructor(
    message: string,
    public readonly code: string = "MIGRATION_ERROR",
  ) {
    super(message);
    this.name = "MigrationError";
  }
}

export interface HostSummary {
  id: string;
  name: string;
  ip: string;
}

export interface HostCapacity {
  hostId: string;
  reachable: boolean;
  freeMemoryMb: number;
  freeDiskMb: number;
}

export interface VolumeInfo {
  name: string;
  estimatedSizeMb: number;
}

export interface ResourceSummary {
  id: string;
  name: string;
  environment: string;
  hostId: string;
  hostName: string;
  domains: string[];
}

/** Full inspected resource — this is what gets frozen into the job snapshot. */
export interface ResourceInfo extends ResourceSummary {
  type: string; // "application" | "compose"
  envVars: Array<{ key: string; value: string }>;
  buildConfig: Record<string, unknown>;
  volumes: VolumeInfo[];
}

export interface CreateResourceSpec {
  name: string;
  destinationHostId: string;
  snapshot: ResourceInfo;
}

export interface MigrationJobLike {
  id: string;
  sourceResourceId: string;
  destinationResourceName: string;
  destinationHost: string;
  npmEnabled: boolean;
  cloudflareEnabled: boolean;
  exposure: Exposure | string;
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/services/migration/types.ts
git commit -m "feat(migration): domain types + MigrationError"
```

---

## Task 4: Pure planner (`src/services/migration/planner.ts`)

**Files:**
- Create: `src/services/migration/planner.ts`
- Test: `src/services/migration/planner.test.ts`

- [ ] **Step 1: Write the failing test**

`src/services/migration/planner.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildPlan, stepJobStatus, VOLUME_STEP_KEYS } from "./planner";

describe("buildPlan('migrate')", () => {
  it("always emits the exact 12-step canonical sequence", () => {
    expect(buildPlan("migrate").map((s) => s.key)).toEqual([
      "validate",
      "stop_source",
      "archive_volumes",
      "transfer_volumes",
      "restore_volumes",
      "provision",
      "deploy",
      "validation_url",
      "await_approval",
      "switch_endpoints",
      "delete_source",
      "complete",
    ]);
  });
  it("assigns contiguous order starting at 0", () => {
    expect(buildPlan("migrate").map((s) => s.order)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
  });
});

describe("buildPlan('clone')", () => {
  it("emits the 5-step non-destructive sequence with no approval/cutover/delete", () => {
    expect(buildPlan("clone").map((s) => s.key)).toEqual([
      "validate",
      "provision",
      "deploy",
      "validation_url",
      "complete",
    ]);
  });
});

describe("stepJobStatus", () => {
  it("maps steps to job statuses", () => {
    expect(stepJobStatus("validate")).toBe("validating");
    expect(stepJobStatus("stop_source")).toBe("transferring");
    expect(stepJobStatus("archive_volumes")).toBe("transferring");
    expect(stepJobStatus("provision")).toBe("provisioning");
    expect(stepJobStatus("deploy")).toBe("deploying");
    expect(stepJobStatus("validation_url")).toBe("deploying");
    expect(stepJobStatus("await_approval")).toBe("awaiting_approval");
    expect(stepJobStatus("switch_endpoints")).toBe("cutting_over");
    expect(stepJobStatus("delete_source")).toBe("cutting_over");
    expect(stepJobStatus("complete")).toBe("completed");
  });
});

describe("VOLUME_STEP_KEYS", () => {
  it("lists the three runtime-skippable volume steps", () => {
    expect(VOLUME_STEP_KEYS).toEqual([
      "archive_volumes",
      "transfer_volumes",
      "restore_volumes",
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/services/migration/planner.test.ts`
Expected: FAIL — cannot find module `./planner`.

- [ ] **Step 3: Implement `src/services/migration/planner.ts`**

```ts
import type { MigrationStatus, MigrationType } from "@/lib/migration";

export interface StepDef {
  key: string;
  label: string;
  order: number;
}

const MIGRATE_STEPS: Array<Omit<StepDef, "order">> = [
  { key: "validate", label: "Validate Migration" },
  { key: "stop_source", label: "Stop Source Resource" },
  { key: "archive_volumes", label: "Archive Volumes" },
  { key: "transfer_volumes", label: "Transfer Volumes" },
  { key: "restore_volumes", label: "Restore Volumes" },
  { key: "provision", label: "Provision Destination Resource" },
  { key: "deploy", label: "Deploy Destination Resource" },
  { key: "validation_url", label: "Generate Temporary Validation URL" },
  { key: "await_approval", label: "Await User Approval" },
  { key: "switch_endpoints", label: "Switch Public Endpoints" },
  { key: "delete_source", label: "Delete Source Resource" },
  { key: "complete", label: "Complete Migration" },
];

const CLONE_STEPS: Array<Omit<StepDef, "order">> = [
  { key: "validate", label: "Validate Migration" },
  { key: "provision", label: "Provision Destination Resource" },
  { key: "deploy", label: "Deploy Destination Resource" },
  { key: "validation_url", label: "Generate Temporary Validation URL" },
  { key: "complete", label: "Complete Clone" },
];

/** The three steps that auto-skip at runtime when no volumes are detected. */
export const VOLUME_STEP_KEYS = [
  "archive_volumes",
  "transfer_volumes",
  "restore_volumes",
] as const;

/**
 * Pure: the plan depends ONLY on the migration type — never on volumes,
 * exposure, or flags. The shape is always identical for a given type.
 */
export function buildPlan(type: MigrationType): StepDef[] {
  const steps = type === "migrate" ? MIGRATE_STEPS : CLONE_STEPS;
  return steps.map((s, order) => ({ ...s, order }));
}

const STATUS_BY_STEP: Record<string, MigrationStatus> = {
  validate: "validating",
  stop_source: "transferring",
  archive_volumes: "transferring",
  transfer_volumes: "transferring",
  restore_volumes: "transferring",
  provision: "provisioning",
  deploy: "deploying",
  validation_url: "deploying",
  await_approval: "awaiting_approval",
  switch_endpoints: "cutting_over",
  delete_source: "cutting_over",
  complete: "completed",
};

export function stepJobStatus(key: string): MigrationStatus {
  return STATUS_BY_STEP[key] ?? "provisioning";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/services/migration/planner.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/migration/planner.ts src/services/migration/planner.test.ts
git commit -m "feat(migration): pure planner with fixed clone/migrate sequences"
```

---

## Task 5: PlatformProvider + VolumeTransferService (interfaces + mocks)

**Files:**
- Create: `src/services/migration/provider.ts`
- Create: `src/services/migration/mock-coolify.ts`
- Create: `src/services/migration/volume-transfer.ts`
- Test: `src/services/migration/mock-coolify.test.ts`

- [ ] **Step 1: Write the failing test**

`src/services/migration/mock-coolify.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mockCoolifyProvider } from "./mock-coolify";

describe("mockCoolifyProvider", () => {
  it("lists hosts with ip addresses", async () => {
    const hosts = await mockCoolifyProvider.listHosts();
    expect(hosts.length).toBeGreaterThanOrEqual(2);
    expect(hosts[0]).toHaveProperty("ip");
  });

  it("inspects a known resource including domains and volumes", async () => {
    const resources = await mockCoolifyProvider.listResources();
    const info = await mockCoolifyProvider.inspectResource(resources[0].id);
    expect(info.id).toBe(resources[0].id);
    expect(Array.isArray(info.domains)).toBe(true);
    expect(Array.isArray(info.volumes)).toBe(true);
  });

  it("exposes a volumeless resource and a volume-bearing resource", async () => {
    const resources = await mockCoolifyProvider.listResources();
    const infos = await Promise.all(
      resources.map((r) => mockCoolifyProvider.inspectResource(r.id)),
    );
    expect(infos.some((i) => i.volumes.length === 0)).toBe(true);
    expect(infos.some((i) => i.volumes.length > 0)).toBe(true);
  });

  it("reports reachable hosts with capacity", async () => {
    const hosts = await mockCoolifyProvider.listHosts();
    const cap = await mockCoolifyProvider.getHostCapacity(hosts[0].id);
    expect(cap.reachable).toBe(true);
    expect(cap.freeMemoryMb).toBeGreaterThan(0);
    expect(cap.freeDiskMb).toBeGreaterThan(0);
  });

  it("generates an sslip.io validation url", async () => {
    const url = await mockCoolifyProvider.generateValidationUrl("res-1", "192.168.100.11");
    expect(url).toMatch(/^https:\/\/[a-z0-9]+\.192\.168\.100\.11\.sslip\.io$/);
  });

  it("detects no duplicate for an unused name", async () => {
    const hosts = await mockCoolifyProvider.listHosts();
    expect(await mockCoolifyProvider.resourceExistsOnHost(hosts[0].id, "totally-unused-xyz")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/services/migration/mock-coolify.test.ts`
Expected: FAIL — cannot find module `./mock-coolify`.

- [ ] **Step 3: Create the provider interface `src/services/migration/provider.ts`**

```ts
import "server-only";
import type {
  CreateResourceSpec,
  HostCapacity,
  HostSummary,
  MigrationJobLike,
  ResourceInfo,
  ResourceSummary,
} from "./types";
import { mockCoolifyProvider } from "./mock-coolify";

/**
 * Platform-agnostic orchestration boundary. The engine depends ONLY on this
 * interface. A real CoolifyPlatformProvider will implement it in a later phase
 * with zero caller changes; today the default is the deterministic mock.
 */
export interface PlatformProvider {
  listHosts(): Promise<HostSummary[]>;
  getHostCapacity(hostId: string): Promise<HostCapacity>;
  listResources(): Promise<ResourceSummary[]>;
  inspectResource(id: string): Promise<ResourceInfo>;
  resourceExistsOnHost(hostId: string, name: string): Promise<boolean>;
  createResource(spec: CreateResourceSpec): Promise<{ resourceId: string }>;
  deployResource(id: string): Promise<void>;
  generateValidationUrl(id: string, hostIp: string): Promise<string>;
  stopResource(id: string): Promise<void>;
  startResource(id: string): Promise<void>;
  switchEndpoints(job: MigrationJobLike): Promise<void>;
  deleteResource(id: string): Promise<void>;
}

/** The active provider for this phase. Swap this line to go live. */
export const platformProvider: PlatformProvider = mockCoolifyProvider;
```

- [ ] **Step 4: Create the mock `src/services/migration/mock-coolify.ts`**

```ts
import { randomBytes } from "node:crypto";
import type { PlatformProvider } from "./provider";
import type { HostSummary, ResourceInfo, ResourceSummary } from "./types";

/**
 * Deterministic-shape mock of a Coolify control plane. Returns realistic data
 * with small simulated delays. Deliberately includes a volumeless resource and
 * a volume-bearing resource so both the skip path and the volume path exercise.
 */

const HOSTS: HostSummary[] = [
  { id: "server-2", name: "Server 2", ip: "192.168.100.10" },
  { id: "server-3", name: "Server 3", ip: "192.168.100.11" },
];

const RESOURCES: ResourceInfo[] = [
  {
    id: "app-nextjs",
    name: "marketing-site",
    environment: "PRODUCTION",
    hostId: "server-2",
    hostName: "Server 2",
    domains: ["layerr.aspyrelabs.com"],
    type: "application",
    envVars: [{ key: "NODE_ENV", value: "production" }],
    buildConfig: { buildPack: "nixpacks", port: "3000" },
    volumes: [],
  },
  {
    id: "app-n8n",
    name: "n8n",
    environment: "PRODUCTION",
    hostId: "server-2",
    hostName: "Server 2",
    domains: ["n8n.10.0.0.5.sslip.io"],
    type: "compose",
    envVars: [{ key: "N8N_HOST", value: "n8n.local" }],
    buildConfig: { composeFile: "docker-compose.yml" },
    volumes: [
      { name: "n8n_data", estimatedSizeMb: 512 },
      { name: "n8n_files", estimatedSizeMb: 128 },
    ],
  },
];

async function delay(ms = 120): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function token(): string {
  return randomBytes(4).toString("hex");
}

export const mockCoolifyProvider: PlatformProvider = {
  async listHosts() {
    await delay();
    return HOSTS.map((h) => ({ ...h }));
  },

  async getHostCapacity(hostId) {
    await delay();
    const known = HOSTS.some((h) => h.id === hostId);
    return {
      hostId,
      reachable: known,
      freeMemoryMb: known ? 8192 : 0,
      freeDiskMb: known ? 102400 : 0,
    };
  },

  async listResources() {
    await delay();
    return RESOURCES.map<ResourceSummary>((r) => ({
      id: r.id,
      name: r.name,
      environment: r.environment,
      hostId: r.hostId,
      hostName: r.hostName,
      domains: [...r.domains],
    }));
  },

  async inspectResource(id) {
    await delay();
    const found = RESOURCES.find((r) => r.id === id);
    if (!found) {
      // A synthetic but well-formed resource so callers never crash on unknown ids.
      return {
        id,
        name: id,
        environment: "PRODUCTION",
        hostId: "server-2",
        hostName: "Server 2",
        domains: [],
        type: "application",
        envVars: [],
        buildConfig: {},
        volumes: [],
      };
    }
    return JSON.parse(JSON.stringify(found)) as ResourceInfo;
  },

  async resourceExistsOnHost(_hostId, name) {
    await delay();
    // Mock: only the literal "duplicate-name" collides, so tests can force a hit.
    return name === "duplicate-name";
  },

  async createResource(spec) {
    await delay(200);
    return { resourceId: `dest-${spec.name}-${token()}` };
  },

  async deployResource() {
    await delay(200);
  },

  async generateValidationUrl(_id, hostIp) {
    await delay();
    return `https://${token()}.${hostIp}.sslip.io`;
  },

  async stopResource() {
    await delay();
  },

  async startResource() {
    await delay();
  },

  async switchEndpoints() {
    await delay();
  },

  async deleteResource() {
    await delay();
  },
};
```

- [ ] **Step 5: Create the volume-transfer interface + mock `src/services/migration/volume-transfer.ts`**

```ts
import "server-only";
import type { VolumeInfo } from "./types";

/**
 * Transfer abstraction boundary. The first real implementation will use
 * SSH/rsync/tar; this phase ships a logged no-op mock. Each method returns a
 * reference string recorded as a MigrationArtifact.
 */
export interface VolumeTransferService {
  archive(volume: VolumeInfo, sourceHost: string): Promise<string>;
  transfer(volume: VolumeInfo, sourceHost: string, destHost: string): Promise<string>;
  restore(volume: VolumeInfo, destHost: string): Promise<string>;
}

async function delay(ms = 150): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export const mockVolumeTransfer: VolumeTransferService = {
  async archive(volume, sourceHost) {
    await delay();
    return `/tmp/${volume.name}-${sourceHost}.tar.gz`;
  },
  async transfer(volume, sourceHost, destHost) {
    await delay();
    return `${destHost}:/tmp/${volume.name}-from-${sourceHost}.tar.gz`;
  },
  async restore(volume, destHost) {
    await delay();
    return `${destHost}:volume/${volume.name}`;
  },
};

/** The active transfer implementation for this phase. */
export const volumeTransfer: VolumeTransferService = mockVolumeTransfer;
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/services/migration/mock-coolify.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/services/migration/provider.ts src/services/migration/mock-coolify.ts src/services/migration/volume-transfer.ts src/services/migration/mock-coolify.test.ts
git commit -m "feat(migration): PlatformProvider + VolumeTransferService with mocks"
```

---

## Task 6: Migration store (`src/services/migration/store.ts`)

The only file in the module that touches Prisma. Everything stateful goes through it, which keeps the orchestrator/approval unit-testable by mocking this one module.

**Files:**
- Create: `src/services/migration/store.ts`
- Test: `src/services/migration/store.test.ts`

- [ ] **Step 1: Write the failing test**

`src/services/migration/store.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    migrationJob: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    migrationStep: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    migrationLog: { create: vi.fn() },
    migrationArtifact: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { migrationStore } from "./store";

const job = prisma.migrationJob as unknown as Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("migrationStore.createJob", () => {
  it("seeds the steps from the planner for the migration type", async () => {
    job.create.mockResolvedValue({ id: "job-1" });
    await migrationStore.createJob({
      migrationType: "migrate",
      sourceResourceId: "app-n8n",
      sourceResourceName: "n8n",
      destinationResourceName: "n8n",
      sourceHost: "server-2",
      sourceHostName: "Server 2",
      destinationHost: "server-3",
      destinationHostName: "Server 3",
      exposure: "internal",
      npmEnabled: false,
      cloudflareEnabled: false,
      sourceResourceSnapshot: { volumes: [] },
    });
    const arg = job.create.mock.calls[0][0];
    expect(arg.data.steps.create.map((s: { key: string }) => s.key)).toEqual([
      "validate",
      "stop_source",
      "archive_volumes",
      "transfer_volumes",
      "restore_volumes",
      "provision",
      "deploy",
      "validation_url",
      "await_approval",
      "switch_endpoints",
      "delete_source",
      "complete",
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/services/migration/store.test.ts`
Expected: FAIL — cannot find module `./store`.

- [ ] **Step 3: Implement `src/services/migration/store.ts`**

```ts
import "server-only";
import type {
  MigrationArtifact,
  MigrationJob,
  MigrationLog,
  MigrationStep,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildPlan } from "./planner";
import type { Exposure, LogLevel, MigrationType } from "@/lib/migration";

export type {
  MigrationJob as MigrationJobRow,
  MigrationStep as MigrationStepRow,
  MigrationLog as MigrationLogRow,
  MigrationArtifact as MigrationArtifactRow,
};

export interface MigrationJobWithRelations extends MigrationJob {
  steps: MigrationStep[];
  logs: MigrationLog[];
  artifacts: MigrationArtifact[];
}

export interface CreateJobInput {
  migrationType: MigrationType;
  sourceResourceId: string;
  sourceResourceName: string;
  destinationResourceName: string;
  sourceHost: string;
  sourceHostName: string;
  destinationHost: string;
  destinationHostName: string;
  exposure: Exposure;
  npmEnabled: boolean;
  cloudflareEnabled: boolean;
  sourceResourceSnapshot: unknown;
}

export const migrationStore = {
  async createJob(input: CreateJobInput): Promise<MigrationJob> {
    const steps = buildPlan(input.migrationType).map((s) => ({
      key: s.key,
      label: s.label,
      order: s.order,
    }));
    return prisma.migrationJob.create({
      data: {
        migrationType: input.migrationType,
        sourceResourceId: input.sourceResourceId,
        sourceResourceName: input.sourceResourceName,
        destinationResourceName: input.destinationResourceName,
        sourceHost: input.sourceHost,
        sourceHostName: input.sourceHostName,
        destinationHost: input.destinationHost,
        destinationHostName: input.destinationHostName,
        exposure: input.exposure,
        npmEnabled: input.npmEnabled,
        cloudflareEnabled: input.cloudflareEnabled,
        status: "pending",
        sourceResourceSnapshot: input.sourceResourceSnapshot as Prisma.InputJsonValue,
        steps: { create: steps },
      },
    });
  },

  async getJob(id: string): Promise<MigrationJob | null> {
    return prisma.migrationJob.findUnique({ where: { id } });
  },

  async getJobWithRelations(id: string): Promise<MigrationJobWithRelations | null> {
    return prisma.migrationJob.findUnique({
      where: { id },
      include: {
        steps: { orderBy: { order: "asc" } },
        logs: { orderBy: { createdAt: "asc" } },
        artifacts: { orderBy: { createdAt: "asc" } },
      },
    });
  },

  async listJobs(): Promise<MigrationJob[]> {
    return prisma.migrationJob.findMany({ orderBy: { createdAt: "desc" } });
  },

  async updateJob(id: string, patch: Prisma.MigrationJobUpdateInput): Promise<MigrationJob> {
    return prisma.migrationJob.update({ where: { id }, data: patch });
  },

  async getSteps(jobId: string): Promise<MigrationStep[]> {
    return prisma.migrationStep.findMany({ where: { jobId }, orderBy: { order: "asc" } });
  },

  async getStep(jobId: string, key: string): Promise<MigrationStep | null> {
    return prisma.migrationStep.findUnique({ where: { jobId_key: { jobId, key } } });
  },

  async updateStep(
    jobId: string,
    key: string,
    patch: Prisma.MigrationStepUpdateInput,
  ): Promise<MigrationStep> {
    return prisma.migrationStep.update({ where: { jobId_key: { jobId, key } }, data: patch });
  },

  async appendLog(
    jobId: string,
    stepKey: string | null,
    level: LogLevel,
    message: string,
  ): Promise<void> {
    await prisma.migrationLog.create({ data: { jobId, stepKey, level, message } });
  },

  async addArtifact(
    jobId: string,
    type: string,
    reference: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await prisma.migrationArtifact.create({
      data: {
        jobId,
        type,
        reference,
        metadata: metadata == null ? undefined : (metadata as Prisma.InputJsonValue),
      },
    });
  },

  async getArtifact(jobId: string, type: string): Promise<MigrationArtifact | null> {
    return prisma.migrationArtifact.findFirst({
      where: { jobId, type },
      orderBy: { createdAt: "desc" },
    });
  },

  async getArtifacts(jobId: string): Promise<MigrationArtifact[]> {
    return prisma.migrationArtifact.findMany({ where: { jobId }, orderBy: { createdAt: "asc" } });
  },
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/services/migration/store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/migration/store.ts src/services/migration/store.test.ts
git commit -m "feat(migration): Prisma-backed migration store"
```

---

## Task 7: Validation service (`src/services/migration/validation.ts`)

**Files:**
- Create: `src/services/migration/validation.ts`
- Test: `src/services/migration/validation.test.ts`

- [ ] **Step 1: Write the failing test**

`src/services/migration/validation.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./provider", () => ({
  platformProvider: {
    listHosts: vi.fn(),
    getHostCapacity: vi.fn(),
    inspectResource: vi.fn(),
    resourceExistsOnHost: vi.fn(),
  },
}));

import { platformProvider } from "./provider";
import { validationService } from "./validation";

const p = platformProvider as unknown as Record<string, ReturnType<typeof vi.fn>>;

const SOURCE = {
  id: "app-n8n",
  name: "n8n",
  environment: "PRODUCTION",
  hostId: "server-2",
  hostName: "Server 2",
  domains: ["app.example.com"],
  type: "compose",
  envVars: [],
  buildConfig: {},
  volumes: [{ name: "n8n_data", estimatedSizeMb: 512 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  p.listHosts.mockResolvedValue([{ id: "server-3", name: "Server 3", ip: "192.168.100.11" }]);
  p.getHostCapacity.mockResolvedValue({
    hostId: "server-3",
    reachable: true,
    freeMemoryMb: 8192,
    freeDiskMb: 102400,
  });
  p.inspectResource.mockResolvedValue(SOURCE);
  p.resourceExistsOnHost.mockResolvedValue(false);
});

describe("validationService.validate", () => {
  it("passes all five checks for a reachable host with capacity and no duplicate", async () => {
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
    expect(report.checks.every((c) => c.pass)).toBe(true);
  });

  it("classifies a custom-domain resource as public with NPM+CF defaults on", async () => {
    const report = await validationService.validate({
      sourceResourceId: "app-n8n",
      destinationHost: "server-3",
      destinationResourceName: "n8n",
    });
    expect(report.exposure).toBe("public");
    expect(report.defaults).toEqual({ npmEnabled: true, cloudflareEnabled: true });
    expect(report.volumes).toHaveLength(1);
  });

  it("fails when the destination host does not exist", async () => {
    p.listHosts.mockResolvedValue([]);
    const report = await validationService.validate({
      sourceResourceId: "app-n8n",
      destinationHost: "server-9",
      destinationResourceName: "n8n",
    });
    expect(report.ok).toBe(false);
    expect(report.checks.find((c) => c.key === "host_exists")?.pass).toBe(false);
  });

  it("fails when free disk is below the required estimate", async () => {
    p.getHostCapacity.mockResolvedValue({
      hostId: "server-3",
      reachable: true,
      freeMemoryMb: 8192,
      freeDiskMb: 10,
    });
    const report = await validationService.validate({
      sourceResourceId: "app-n8n",
      destinationHost: "server-3",
      destinationResourceName: "n8n",
    });
    expect(report.checks.find((c) => c.key === "disk")?.pass).toBe(false);
    expect(report.ok).toBe(false);
  });

  it("fails the duplicate-name check when the name is taken", async () => {
    p.resourceExistsOnHost.mockResolvedValue(true);
    const report = await validationService.validate({
      sourceResourceId: "app-n8n",
      destinationHost: "server-3",
      destinationResourceName: "duplicate-name",
    });
    expect(report.checks.find((c) => c.key === "duplicate_name")?.pass).toBe(false);
    expect(report.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/services/migration/validation.test.ts`
Expected: FAIL — cannot find module `./validation`.

- [ ] **Step 3: Implement `src/services/migration/validation.ts`**

```ts
import "server-only";
import { classifyExposure, defaultFlags, type Exposure, type ExposureDefaults } from "@/lib/migration";
import { platformProvider } from "./provider";
import type { ResourceInfo, VolumeInfo } from "./types";

export interface ValidateInput {
  sourceResourceId: string;
  destinationHost: string;
  destinationResourceName: string;
}

export interface CheckResult {
  key: "host_exists" | "host_reachable" | "disk" | "memory" | "duplicate_name";
  label: string;
  pass: boolean;
  detail: string;
}

export interface ValidationReport {
  ok: boolean;
  checks: CheckResult[];
  volumes: VolumeInfo[];
  exposure: Exposure;
  defaults: ExposureDefaults;
  source: ResourceInfo;
}

// Headroom required on the destination beyond the volume payload.
const BASE_DISK_MB = 1024;
const BASE_MEMORY_MB = 512;

export const validationService = {
  async validate(input: ValidateInput): Promise<ValidationReport> {
    const source = await platformProvider.inspectResource(input.sourceResourceId);
    const volumes = source.volumes;
    const exposure = classifyExposure(source.domains);

    const hosts = await platformProvider.listHosts();
    const host = hosts.find((h) => h.id === input.destinationHost);

    const checks: CheckResult[] = [];

    const hostExists = Boolean(host);
    checks.push({
      key: "host_exists",
      label: "Destination host exists",
      pass: hostExists,
      detail: hostExists ? `Found ${host!.name}.` : "Destination host is not registered.",
    });

    let capacity = { reachable: false, freeMemoryMb: 0, freeDiskMb: 0 };
    if (hostExists) {
      const cap = await platformProvider.getHostCapacity(input.destinationHost);
      capacity = cap;
    }

    checks.push({
      key: "host_reachable",
      label: "Destination host is reachable",
      pass: hostExists && capacity.reachable,
      detail: capacity.reachable ? "Reachable." : "Host could not be reached.",
    });

    const requiredDisk = volumes.reduce((sum, v) => sum + v.estimatedSizeMb, 0) + BASE_DISK_MB;
    checks.push({
      key: "disk",
      label: "Sufficient free disk",
      pass: hostExists && capacity.freeDiskMb >= requiredDisk,
      detail: `Needs ~${requiredDisk} MB; host has ${capacity.freeDiskMb} MB free.`,
    });

    checks.push({
      key: "memory",
      label: "Sufficient free memory",
      pass: hostExists && capacity.freeMemoryMb >= BASE_MEMORY_MB,
      detail: `Needs ~${BASE_MEMORY_MB} MB; host has ${capacity.freeMemoryMb} MB free.`,
    });

    const duplicate = hostExists
      ? await platformProvider.resourceExistsOnHost(input.destinationHost, input.destinationResourceName)
      : false;
    checks.push({
      key: "duplicate_name",
      label: "No duplicate resource name",
      pass: !duplicate,
      detail: duplicate
        ? `A resource named "${input.destinationResourceName}" already exists on the destination. Rename it.`
        : "Name is available.",
    });

    return {
      ok: checks.every((c) => c.pass),
      checks,
      volumes,
      exposure,
      defaults: defaultFlags(exposure),
      source,
    };
  },
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/services/migration/validation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/migration/validation.ts src/services/migration/validation.test.ts
git commit -m "feat(migration): validation engine (five pre-flight checks)"
```

---

## Task 8: Orchestrator (`src/services/migration/orchestrator.ts`)

**Files:**
- Create: `src/services/migration/orchestrator.ts`
- Test: `src/services/migration/orchestrator.test.ts`

- [ ] **Step 1: Write the failing test**

`src/services/migration/orchestrator.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./store", () => ({
  migrationStore: {
    getJob: vi.fn(),
    getSteps: vi.fn(),
    updateStep: vi.fn(),
    updateJob: vi.fn(),
    appendLog: vi.fn(),
    addArtifact: vi.fn(),
    getArtifact: vi.fn(),
  },
}));
vi.mock("./provider", () => ({
  platformProvider: {
    listHosts: vi.fn(),
    createResource: vi.fn(),
    deployResource: vi.fn(),
    generateValidationUrl: vi.fn(),
    stopResource: vi.fn(),
    deleteResource: vi.fn(),
    switchEndpoints: vi.fn(),
  },
}));
vi.mock("./volume-transfer", () => ({
  volumeTransfer: { archive: vi.fn(), transfer: vi.fn(), restore: vi.fn() },
}));
vi.mock("./validation", () => ({
  validationService: { validate: vi.fn() },
}));

import { migrationStore } from "./store";
import { platformProvider } from "./provider";
import { volumeTransfer } from "./volume-transfer";
import { validationService } from "./validation";
import { migrationOrchestrator } from "./orchestrator";

const store = migrationStore as unknown as Record<string, ReturnType<typeof vi.fn>>;
const provider = platformProvider as unknown as Record<string, ReturnType<typeof vi.fn>>;
const vol = volumeTransfer as unknown as Record<string, ReturnType<typeof vi.fn>>;
const validate = validationService.validate as unknown as ReturnType<typeof vi.fn>;

const SNAPSHOT_NO_VOL = { volumes: [] };
const SNAPSHOT_WITH_VOL = { volumes: [{ name: "n8n_data", estimatedSizeMb: 512 }] };

function jobRow(over: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    status: "pending",
    migrationType: "migrate",
    sourceResourceId: "app-n8n",
    destinationResourceName: "n8n",
    sourceHost: "server-2",
    destinationHost: "server-3",
    npmEnabled: false,
    cloudflareEnabled: false,
    exposure: "internal",
    sourceResourceSnapshot: SNAPSHOT_WITH_VOL,
    ...over,
  };
}

function step(key: string, status = "pending", attemptNumber = 1) {
  return { key, label: key, order: 0, status, attemptNumber };
}

beforeEach(() => {
  vi.clearAllMocks();
  store.updateStep.mockResolvedValue({});
  store.updateJob.mockResolvedValue({});
  store.appendLog.mockResolvedValue(undefined);
  store.addArtifact.mockResolvedValue(undefined);
  store.getArtifact.mockResolvedValue({ reference: "dest-1" });
  provider.listHosts.mockResolvedValue([{ id: "server-3", name: "Server 3", ip: "192.168.100.11" }]);
  provider.createResource.mockResolvedValue({ resourceId: "dest-1" });
  provider.generateValidationUrl.mockResolvedValue("https://abc.192.168.100.11.sslip.io");
  vol.archive.mockResolvedValue("/tmp/a.tar.gz");
  vol.transfer.mockResolvedValue("server-3:/tmp/a.tar.gz");
  vol.restore.mockResolvedValue("server-3:volume/n8n_data");
  validate.mockResolvedValue({ ok: true, checks: [], volumes: [], exposure: "internal", defaults: {}, source: SNAPSHOT_WITH_VOL });
});

describe("migrationOrchestrator.advance — one step at a time", () => {
  it("runs validate, marks it success, and captures the snapshot", async () => {
    store.getJob.mockResolvedValue(jobRow());
    store.getSteps.mockResolvedValue([step("validate"), step("stop_source")]);
    await migrationOrchestrator.advance("job-1");
    expect(validate).toHaveBeenCalledOnce();
    expect(store.updateStep).toHaveBeenCalledWith(
      "job-1",
      "validate",
      expect.objectContaining({ status: "success" }),
    );
  });

  it("fails the job when validation fails", async () => {
    validate.mockResolvedValue({ ok: false, checks: [{ key: "disk", label: "d", pass: false, detail: "low" }], volumes: [], exposure: "internal", defaults: {}, source: SNAPSHOT_WITH_VOL });
    store.getJob.mockResolvedValue(jobRow());
    store.getSteps.mockResolvedValue([step("validate")]);
    await migrationOrchestrator.advance("job-1");
    expect(store.updateStep).toHaveBeenCalledWith("job-1", "validate", expect.objectContaining({ status: "failed" }));
    expect(store.updateJob).toHaveBeenCalledWith("job-1", expect.objectContaining({ status: "failed" }));
  });

  it("skips a volume step when the snapshot has no volumes", async () => {
    store.getJob.mockResolvedValue(jobRow({ sourceResourceSnapshot: SNAPSHOT_NO_VOL }));
    store.getSteps.mockResolvedValue([step("archive_volumes")]);
    await migrationOrchestrator.advance("job-1");
    expect(vol.archive).not.toHaveBeenCalled();
    expect(store.updateStep).toHaveBeenCalledWith("job-1", "archive_volumes", expect.objectContaining({ status: "skipped" }));
  });

  it("runs a volume step when the snapshot has volumes", async () => {
    store.getJob.mockResolvedValue(jobRow());
    store.getSteps.mockResolvedValue([step("archive_volumes")]);
    await migrationOrchestrator.advance("job-1");
    expect(vol.archive).toHaveBeenCalledOnce();
    expect(store.updateStep).toHaveBeenCalledWith("job-1", "archive_volumes", expect.objectContaining({ status: "success" }));
  });

  it("provisions from the snapshot and records the destination artifact", async () => {
    store.getJob.mockResolvedValue(jobRow());
    store.getSteps.mockResolvedValue([step("provision")]);
    await migrationOrchestrator.advance("job-1");
    expect(provider.createResource).toHaveBeenCalledWith(
      expect.objectContaining({ name: "n8n", destinationHostId: "server-3", snapshot: SNAPSHOT_WITH_VOL }),
    );
    expect(store.addArtifact).toHaveBeenCalledWith("job-1", "destination_resource", "dest-1");
  });

  it("stores the validation url on the job", async () => {
    store.getJob.mockResolvedValue(jobRow());
    store.getSteps.mockResolvedValue([step("validation_url")]);
    await migrationOrchestrator.advance("job-1");
    expect(store.updateJob).toHaveBeenCalledWith("job-1", expect.objectContaining({ validationUrl: "https://abc.192.168.100.11.sslip.io" }));
  });

  it("halts at await_approval without running cutover", async () => {
    store.getJob.mockResolvedValue(jobRow());
    store.getSteps.mockResolvedValue([step("await_approval"), step("switch_endpoints")]);
    await migrationOrchestrator.advance("job-1");
    expect(store.updateJob).toHaveBeenCalledWith("job-1", expect.objectContaining({ status: "awaiting_approval" }));
    expect(provider.switchEndpoints).not.toHaveBeenCalled();
  });

  it("is a no-op when the job is awaiting approval", async () => {
    store.getJob.mockResolvedValue(jobRow({ status: "awaiting_approval" }));
    await migrationOrchestrator.advance("job-1");
    expect(store.getSteps).not.toHaveBeenCalled();
  });

  it("is a no-op when the job is terminal", async () => {
    store.getJob.mockResolvedValue(jobRow({ status: "completed" }));
    await migrationOrchestrator.advance("job-1");
    expect(store.getSteps).not.toHaveBeenCalled();
  });

  it("completes the job on the complete step", async () => {
    store.getJob.mockResolvedValue(jobRow({ status: "cutting_over" }));
    store.getSteps.mockResolvedValue([step("complete")]);
    await migrationOrchestrator.advance("job-1");
    expect(store.updateJob).toHaveBeenCalledWith("job-1", expect.objectContaining({ status: "completed" }));
  });

  it("bumps attemptNumber when resuming a step left running by a crash", async () => {
    store.getJob.mockResolvedValue(jobRow({ status: "provisioning" }));
    store.getSteps.mockResolvedValue([step("provision", "running", 1)]);
    await migrationOrchestrator.advance("job-1");
    expect(store.updateStep).toHaveBeenCalledWith(
      "job-1",
      "provision",
      expect.objectContaining({ status: "running", attemptNumber: 2 }),
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/services/migration/orchestrator.test.ts`
Expected: FAIL — cannot find module `./orchestrator`.

- [ ] **Step 3: Implement `src/services/migration/orchestrator.ts`**

```ts
import "server-only";
import { isTerminalStatus } from "@/lib/migration";
import { migrationStore, type MigrationJobRow } from "./store";
import { platformProvider } from "./provider";
import { volumeTransfer } from "./volume-transfer";
import { validationService } from "./validation";
import { stepJobStatus } from "./planner";
import { MigrationError, type ResourceInfo } from "./types";

interface StepOutcome {
  skipped?: boolean;
  detail?: string;
}

function snapshotOf(job: MigrationJobRow): ResourceInfo {
  return job.sourceResourceSnapshot as unknown as ResourceInfo;
}

async function handleValidate(job: MigrationJobRow): Promise<StepOutcome> {
  const report = await validationService.validate({
    sourceResourceId: job.sourceResourceId,
    destinationHost: job.destinationHost,
    destinationResourceName: job.destinationResourceName,
  });
  for (const check of report.checks) {
    await migrationStore.appendLog(
      job.id,
      "validate",
      check.pass ? "info" : "error",
      `${check.label}: ${check.detail}`,
    );
  }
  if (!report.ok) {
    const failed = report.checks.find((c) => !c.pass);
    throw new MigrationError(failed?.detail ?? "Validation failed.", "VALIDATION_FAILED");
  }
  // Freeze the exact validated source as the snapshot the destination is built
  // from, and record detected volumes as artifacts.
  await migrationStore.updateJob(job.id, {
    sourceResourceSnapshot: report.source as unknown as object,
    exposure: report.exposure,
  });
  for (const v of report.volumes) {
    await migrationStore.addArtifact(job.id, "volume", v.name, { sizeMb: v.estimatedSizeMb });
  }
  return { detail: "All validation checks passed." };
}

async function handleStopSource(job: MigrationJobRow): Promise<StepOutcome> {
  await platformProvider.stopResource(job.sourceResourceId);
  await migrationStore.addArtifact(job.id, "source_stopped", job.sourceResourceId);
  return { detail: "Source resource stopped; no further writes permitted." };
}

async function handleVolumeStep(
  job: MigrationJobRow,
  op: "archive" | "transfer" | "restore",
): Promise<StepOutcome> {
  const volumes = snapshotOf(job).volumes ?? [];
  if (volumes.length === 0) {
    return { skipped: true, detail: "No volumes detected — skipped." };
  }
  for (const v of volumes) {
    let ref: string;
    if (op === "archive") ref = await volumeTransfer.archive(v, job.sourceHost);
    else if (op === "transfer") ref = await volumeTransfer.transfer(v, job.sourceHost, job.destinationHost);
    else ref = await volumeTransfer.restore(v, job.destinationHost);
    await migrationStore.addArtifact(job.id, `volume_${op}`, ref, { volume: v.name });
  }
  return { detail: `${volumes.length} volume(s) ${op}d.` };
}

async function handleProvision(job: MigrationJobRow): Promise<StepOutcome> {
  const { resourceId } = await platformProvider.createResource({
    name: job.destinationResourceName,
    destinationHostId: job.destinationHost,
    snapshot: snapshotOf(job),
  });
  await migrationStore.addArtifact(job.id, "destination_resource", resourceId);
  return { detail: `Provisioned destination resource ${resourceId}.` };
}

async function destinationId(job: MigrationJobRow): Promise<string> {
  const art = await migrationStore.getArtifact(job.id, "destination_resource");
  if (!art) throw new MigrationError("Destination resource not found.", "NO_DESTINATION");
  return art.reference;
}

async function handleDeploy(job: MigrationJobRow): Promise<StepOutcome> {
  await platformProvider.deployResource(await destinationId(job));
  return { detail: "Destination resource deployed." };
}

async function handleValidationUrl(job: MigrationJobRow): Promise<StepOutcome> {
  const hosts = await platformProvider.listHosts();
  const ip = hosts.find((h) => h.id === job.destinationHost)?.ip ?? "127.0.0.1";
  const url = await platformProvider.generateValidationUrl(await destinationId(job), ip);
  await migrationStore.updateJob(job.id, { validationUrl: url });
  await migrationStore.addArtifact(job.id, "validation_url", url);
  return { detail: url };
}

async function handleSwitchEndpoints(job: MigrationJobRow): Promise<StepOutcome> {
  await platformProvider.switchEndpoints({
    id: job.id,
    sourceResourceId: job.sourceResourceId,
    destinationResourceName: job.destinationResourceName,
    destinationHost: job.destinationHost,
    npmEnabled: job.npmEnabled,
    cloudflareEnabled: job.cloudflareEnabled,
    exposure: job.exposure,
  });
  return { detail: "Public endpoints switched to the destination." };
}

async function handleDeleteSource(job: MigrationJobRow): Promise<StepOutcome> {
  await platformProvider.deleteResource(job.sourceResourceId);
  return { detail: "Source resource deleted." };
}

async function runHandler(job: MigrationJobRow, key: string): Promise<StepOutcome> {
  switch (key) {
    case "validate":
      return handleValidate(job);
    case "stop_source":
      return handleStopSource(job);
    case "archive_volumes":
      return handleVolumeStep(job, "archive");
    case "transfer_volumes":
      return handleVolumeStep(job, "transfer");
    case "restore_volumes":
      return handleVolumeStep(job, "restore");
    case "provision":
      return handleProvision(job);
    case "deploy":
      return handleDeploy(job);
    case "validation_url":
      return handleValidationUrl(job);
    case "switch_endpoints":
      return handleSwitchEndpoints(job);
    case "delete_source":
      return handleDeleteSource(job);
    case "complete":
      return { detail: "Migration complete." };
    default:
      throw new MigrationError(`Unknown step "${key}".`, "UNKNOWN_STEP");
  }
}

export const migrationOrchestrator = {
  /** Advance exactly one step. Idempotent and resumable from DB state. */
  async advance(jobId: string): Promise<MigrationJobRow> {
    const job = await migrationStore.getJob(jobId);
    if (!job) throw new MigrationError("Migration job not found.", "NOT_FOUND");
    if (isTerminalStatus(job.status) || job.status === "awaiting_approval") return job;

    const steps = await migrationStore.getSteps(jobId);
    const next = steps.find((s) => s.status === "pending" || s.status === "running");
    if (!next) return job;

    const attemptNumber = next.status === "running" ? next.attemptNumber + 1 : next.attemptNumber;
    await migrationStore.updateStep(jobId, next.key, {
      status: "running",
      attemptNumber,
      startedAt: new Date(),
    });
    await migrationStore.updateJob(jobId, {
      status: stepJobStatus(next.key),
      currentStepKey: next.key,
    });
    await migrationStore.appendLog(jobId, next.key, "info", `Starting: ${next.label}`);

    // Approval gate: stop here; ApprovalService advances past this.
    if (next.key === "await_approval") {
      await migrationStore.appendLog(jobId, next.key, "info", "Awaiting user approval before cutover.");
      return (await migrationStore.getJob(jobId)) as MigrationJobRow;
    }

    try {
      const outcome = await runHandler(job, next.key);
      await migrationStore.updateStep(jobId, next.key, {
        status: outcome.skipped ? "skipped" : "success",
        detail: outcome.detail ?? null,
        finishedAt: new Date(),
      });
      await migrationStore.appendLog(
        jobId,
        next.key,
        "info",
        outcome.detail ?? `${outcome.skipped ? "Skipped" : "Done"}: ${next.label}`,
      );
      if (next.key === "complete") {
        await migrationStore.updateJob(jobId, {
          status: "completed",
          completedAt: new Date(),
          errorMessage: null,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Step failed unexpectedly.";
      await migrationStore.updateStep(jobId, next.key, {
        status: "failed",
        detail: message,
        finishedAt: new Date(),
      });
      await migrationStore.updateJob(jobId, { status: "failed", errorMessage: message });
      await migrationStore.appendLog(jobId, next.key, "error", message);
    }

    return (await migrationStore.getJob(jobId)) as MigrationJobRow;
  },
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/services/migration/orchestrator.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/services/migration/orchestrator.ts src/services/migration/orchestrator.test.ts
git commit -m "feat(migration): orchestrator step driver (one step/advance, resumable)"
```

---

## Task 9: Approval service (`src/services/migration/approval.ts`)

**Files:**
- Create: `src/services/migration/approval.ts`
- Test: `src/services/migration/approval.test.ts`

- [ ] **Step 1: Write the failing test**

`src/services/migration/approval.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./store", () => ({
  migrationStore: {
    getJob: vi.fn(),
    getSteps: vi.fn(),
    updateStep: vi.fn(),
    updateJob: vi.fn(),
    appendLog: vi.fn(),
    getArtifact: vi.fn(),
  },
}));
vi.mock("./provider", () => ({
  platformProvider: { deleteResource: vi.fn(), startResource: vi.fn() },
}));

import { migrationStore } from "./store";
import { platformProvider } from "./provider";
import { approvalService } from "./approval";
import { MigrationError } from "./types";

const store = migrationStore as unknown as Record<string, ReturnType<typeof vi.fn>>;
const provider = platformProvider as unknown as Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  vi.clearAllMocks();
  store.updateStep.mockResolvedValue({});
  store.updateJob.mockResolvedValue({});
  store.appendLog.mockResolvedValue(undefined);
  store.getArtifact.mockResolvedValue({ reference: "dest-1" });
  store.getSteps.mockResolvedValue([
    { key: "await_approval", status: "success" },
    { key: "switch_endpoints", status: "pending" },
    { key: "delete_source", status: "pending" },
  ]);
});

describe("approvalService.approve", () => {
  it("transitions awaiting_approval -> cutting_over and stamps approvedAt", async () => {
    store.getJob.mockResolvedValueOnce({ id: "job-1", status: "awaiting_approval", sourceResourceId: "src" });
    store.getJob.mockResolvedValueOnce({ id: "job-1", status: "cutting_over" });
    await approvalService.approve("job-1");
    expect(store.updateStep).toHaveBeenCalledWith("job-1", "await_approval", expect.objectContaining({ status: "success" }));
    expect(store.updateJob).toHaveBeenCalledWith("job-1", expect.objectContaining({ status: "cutting_over" }));
  });

  it("rejects approval when not awaiting approval", async () => {
    store.getJob.mockResolvedValue({ id: "job-1", status: "deploying" });
    await expect(approvalService.approve("job-1")).rejects.toBeInstanceOf(MigrationError);
  });
});

describe("approvalService.rollback", () => {
  it("deletes destination, restarts source, skips remaining steps, sets rolled_back", async () => {
    store.getJob.mockResolvedValueOnce({ id: "job-1", status: "awaiting_approval", sourceResourceId: "src" });
    store.getJob.mockResolvedValueOnce({ id: "job-1", status: "rolled_back" });
    await approvalService.rollback("job-1");
    expect(provider.deleteResource).toHaveBeenCalledWith("dest-1");
    expect(provider.startResource).toHaveBeenCalledWith("src");
    expect(store.updateStep).toHaveBeenCalledWith("job-1", "switch_endpoints", expect.objectContaining({ status: "skipped" }));
    expect(store.updateStep).toHaveBeenCalledWith("job-1", "delete_source", expect.objectContaining({ status: "skipped" }));
    expect(store.updateJob).toHaveBeenCalledWith("job-1", expect.objectContaining({ status: "rolled_back" }));
  });

  it("rejects rollback once cutover has started", async () => {
    store.getJob.mockResolvedValue({ id: "job-1", status: "cutting_over", sourceResourceId: "src" });
    await expect(approvalService.rollback("job-1")).rejects.toBeInstanceOf(MigrationError);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/services/migration/approval.test.ts`
Expected: FAIL — cannot find module `./approval`.

- [ ] **Step 3: Implement `src/services/migration/approval.ts`**

```ts
import "server-only";
import { migrationStore, type MigrationJobRow } from "./store";
import { platformProvider } from "./provider";
import { MigrationError } from "./types";

export const approvalService = {
  /** Authorize production cutover. Valid only from awaiting_approval. */
  async approve(jobId: string): Promise<MigrationJobRow> {
    const job = await migrationStore.getJob(jobId);
    if (!job) throw new MigrationError("Migration job not found.", "NOT_FOUND");
    if (job.status !== "awaiting_approval") {
      throw new MigrationError("Migration is not awaiting approval.", "INVALID_STATE");
    }
    await migrationStore.updateStep(jobId, "await_approval", {
      status: "success",
      finishedAt: new Date(),
    });
    await migrationStore.updateJob(jobId, { status: "cutting_over", approvedAt: new Date() });
    await migrationStore.appendLog(jobId, "await_approval", "info", "Cutover approved by user.");
    return (await migrationStore.getJob(jobId)) as MigrationJobRow;
  },

  /**
   * Compensating rollback. Valid only from awaiting_approval — once cutover has
   * begun, reversal requires a new opposite-direction migration.
   */
  async rollback(jobId: string): Promise<MigrationJobRow> {
    const job = await migrationStore.getJob(jobId);
    if (!job) throw new MigrationError("Migration job not found.", "NOT_FOUND");
    if (job.status !== "awaiting_approval") {
      throw new MigrationError(
        "Rollback is only available while awaiting approval.",
        "INVALID_STATE",
      );
    }
    await migrationStore.appendLog(jobId, null, "warn", "Rolling back migration.");

    const dest = await migrationStore.getArtifact(jobId, "destination_resource");
    if (dest) {
      await platformProvider.deleteResource(dest.reference);
      await migrationStore.appendLog(jobId, null, "info", `Deleted destination resource ${dest.reference}.`);
    }

    await platformProvider.startResource(job.sourceResourceId);
    await migrationStore.appendLog(jobId, null, "info", "Restarted source resource.");

    const steps = await migrationStore.getSteps(jobId);
    for (const s of steps) {
      if (s.status === "pending" || s.status === "running") {
        await migrationStore.updateStep(jobId, s.key, { status: "skipped", finishedAt: new Date() });
      }
    }

    await migrationStore.updateJob(jobId, { status: "rolled_back", completedAt: new Date() });
    return (await migrationStore.getJob(jobId)) as MigrationJobRow;
  },
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/services/migration/approval.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/migration/approval.ts src/services/migration/approval.test.ts
git commit -m "feat(migration): approval service (approve gate + compensating rollback)"
```

---

## Task 10: Validation schema + audit constants

**Files:**
- Create: `src/lib/migration-validation.ts`
- Test: `src/lib/migration-validation.test.ts`
- Modify: `src/lib/audit.ts` (add migration actions + target type + labels)

- [ ] **Step 1: Write the failing schema test**

`src/lib/migration-validation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createMigrationSchema } from "./migration-validation";

const VALID = {
  migrationType: "migrate",
  sourceResourceId: "app-n8n",
  destinationHost: "server-3",
  destinationResourceName: "n8n-copy",
};

describe("createMigrationSchema", () => {
  it("accepts a well-formed migrate input", () => {
    expect(createMigrationSchema.safeParse(VALID).success).toBe(true);
  });
  it("accepts clone as a migration type", () => {
    expect(createMigrationSchema.safeParse({ ...VALID, migrationType: "clone" }).success).toBe(true);
  });
  it("rejects an unknown migration type", () => {
    expect(createMigrationSchema.safeParse({ ...VALID, migrationType: "copy" }).success).toBe(false);
  });
  it("rejects a missing resource", () => {
    expect(createMigrationSchema.safeParse({ ...VALID, sourceResourceId: "" }).success).toBe(false);
  });
  it("rejects an invalid destination name", () => {
    expect(createMigrationSchema.safeParse({ ...VALID, destinationResourceName: "bad name!" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/migration-validation.test.ts`
Expected: FAIL — cannot find module `./migration-validation`.

- [ ] **Step 3: Implement `src/lib/migration-validation.ts`**

```ts
import { z } from "zod";

/** Wizard submission schema. Maps a valid form into a create-migration call. */
export const createMigrationSchema = z.object({
  migrationType: z.enum(["clone", "migrate"]),
  sourceResourceId: z.string().trim().min(1, "Select a resource"),
  destinationHost: z.string().trim().min(1, "Select a destination host"),
  destinationResourceName: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(100)
    .regex(/^[a-z0-9][a-z0-9-]*$/i, "Use letters, numbers and hyphens"),
  npmEnabled: z.boolean().optional(),
  cloudflareEnabled: z.boolean().optional(),
});

export type CreateMigrationInput = z.infer<typeof createMigrationSchema>;
```

- [ ] **Step 4: Run the schema test to verify it passes**

Run: `npx vitest run src/lib/migration-validation.test.ts`
Expected: PASS.

- [ ] **Step 5: Add audit constants in `src/lib/audit.ts`**

In `AUDIT_ACTIONS`, add after `DEPLOYMENT_RUN: "deployment.run",`:

```ts
  MIGRATION_CREATE: "migration.create",
  MIGRATION_APPROVE: "migration.approve",
  MIGRATION_ROLLBACK: "migration.rollback",
  MIGRATION_COMPLETE: "migration.complete",
```

In `AUDIT_TARGET_TYPES`, add after `DEPLOYMENT: "deployment",`:

```ts
  MIGRATION: "migration",
```

In the `labels` map inside `actionLabel`, add after the `DEPLOYMENT_RUN` entry (find the existing `[AUDIT_ACTIONS.DEPLOYMENT_RUN]: ...` line — the file's tail; if not present, add these alongside the other entries):

```ts
    [AUDIT_ACTIONS.MIGRATION_CREATE]: "Created migration",
    [AUDIT_ACTIONS.MIGRATION_APPROVE]: "Approved migration cutover",
    [AUDIT_ACTIONS.MIGRATION_ROLLBACK]: "Rolled back migration",
    [AUDIT_ACTIONS.MIGRATION_COMPLETE]: "Completed migration",
```

- [ ] **Step 6: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/migration-validation.ts src/lib/migration-validation.test.ts src/lib/audit.ts
git commit -m "feat(migration): create-migration schema + audit constants"
```

---

## Task 11: Server actions (`src/app/actions/migration.ts`)

**Files:**
- Create: `src/app/actions/migration.ts`

No unit test (thin orchestration layer over already-tested services, following the existing `actions/deploy.ts` pattern). Verified by typecheck + the UI tasks + final build.

- [ ] **Step 1: Implement `src/app/actions/migration.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";

import { createMigrationSchema } from "@/lib/migration-validation";
import { migrationStore } from "@/services/migration/store";
import type { MigrationJobWithRelations } from "@/services/migration/store";
import { migrationOrchestrator } from "@/services/migration/orchestrator";
import { approvalService } from "@/services/migration/approval";
import { validationService, type ValidationReport } from "@/services/migration/validation";
import { platformProvider } from "@/services/migration/provider";
import { buildPlan, type StepDef } from "@/services/migration/planner";
import { defaultFlags, type MigrationType } from "@/lib/migration";
import type { HostCapacity, HostSummary, ResourceSummary } from "@/services/migration/types";
import { auditService } from "@/services/audit";
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from "@/lib/audit";

export interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  data?: T;
}

export interface MigrationHostInfo extends HostSummary {
  capacity: HostCapacity;
}

export interface MigrationOptions {
  resources: ResourceSummary[];
  hosts: MigrationHostInfo[];
}

/** Wizard data: candidate resources + destination hosts with capacities. */
export async function getMigrationOptionsAction(): Promise<MigrationOptions> {
  const [resources, hosts] = await Promise.all([
    platformProvider.listResources(),
    platformProvider.listHosts(),
  ]);
  const hostInfos = await Promise.all(
    hosts.map(async (h) => ({ ...h, capacity: await platformProvider.getHostCapacity(h.id) })),
  );
  return { resources, hosts: hostInfos };
}

export interface MigrationPreview {
  report: ValidationReport;
  plan: StepDef[];
}

/** Step 4/5: run validation + volume detection + exposure + plan preview. */
export async function validateMigrationAction(input: {
  migrationType: MigrationType;
  sourceResourceId: string;
  destinationHost: string;
  destinationResourceName: string;
}): Promise<ActionResult<MigrationPreview>> {
  const parsed = createMigrationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const report = await validationService.validate({
    sourceResourceId: parsed.data.sourceResourceId,
    destinationHost: parsed.data.destinationHost,
    destinationResourceName: parsed.data.destinationResourceName,
  });
  return { ok: true, data: { report, plan: buildPlan(parsed.data.migrationType) } };
}

/** Step 6: persist the job (+ seeded steps + frozen snapshot) and return its id. */
export async function createMigrationAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createMigrationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const data = parsed.data;

  const report = await validationService.validate({
    sourceResourceId: data.sourceResourceId,
    destinationHost: data.destinationHost,
    destinationResourceName: data.destinationResourceName,
  });
  if (!report.ok) {
    const failed = report.checks.find((c) => !c.pass);
    return { ok: false, error: failed?.detail ?? "Validation failed." };
  }

  const hosts = await platformProvider.listHosts();
  const destHost = hosts.find((h) => h.id === data.destinationHost);
  const fallback = defaultFlags(report.exposure);

  const job = await migrationStore.createJob({
    migrationType: data.migrationType,
    sourceResourceId: data.sourceResourceId,
    sourceResourceName: report.source.name,
    destinationResourceName: data.destinationResourceName,
    sourceHost: report.source.hostId,
    sourceHostName: report.source.hostName,
    destinationHost: data.destinationHost,
    destinationHostName: destHost?.name ?? data.destinationHost,
    exposure: report.exposure,
    npmEnabled: data.npmEnabled ?? fallback.npmEnabled,
    cloudflareEnabled: data.cloudflareEnabled ?? fallback.cloudflareEnabled,
    sourceResourceSnapshot: report.source,
  });

  await auditService.record({
    action: AUDIT_ACTIONS.MIGRATION_CREATE,
    targetType: AUDIT_TARGET_TYPES.MIGRATION,
    targetId: job.id,
    summary: `Created ${data.migrationType} of ${report.source.name} to ${destHost?.name ?? data.destinationHost}`,
  });

  revalidatePath("/migrations");
  return { ok: true, data: { id: job.id } };
}

/** Step 6: advance one step; returns the refreshed job for the poll loop. */
export async function advanceMigrationAction(
  jobId: string,
): Promise<ActionResult<MigrationJobWithRelations>> {
  await migrationOrchestrator.advance(jobId);
  const job = await migrationStore.getJobWithRelations(jobId);
  if (!job) return { ok: false, error: "Migration job not found." };
  if (job.status === "completed") {
    await auditService.record({
      action: AUDIT_ACTIONS.MIGRATION_COMPLETE,
      targetType: AUDIT_TARGET_TYPES.MIGRATION,
      targetId: job.id,
      summary: `Completed ${job.migrationType} of ${job.sourceResourceName}`,
    });
  }
  revalidatePath(`/migrations/${jobId}`);
  return { ok: true, data: job };
}

/** Poll source for the detail page. */
export async function getMigrationJobAction(
  jobId: string,
): Promise<ActionResult<MigrationJobWithRelations>> {
  const job = await migrationStore.getJobWithRelations(jobId);
  if (!job) return { ok: false, error: "Migration job not found." };
  return { ok: true, data: job };
}

export async function approveMigrationAction(
  jobId: string,
): Promise<ActionResult<MigrationJobWithRelations>> {
  try {
    await approvalService.approve(jobId);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Approval failed." };
  }
  await auditService.record({
    action: AUDIT_ACTIONS.MIGRATION_APPROVE,
    targetType: AUDIT_TARGET_TYPES.MIGRATION,
    targetId: jobId,
    summary: "Approved migration cutover",
  });
  revalidatePath(`/migrations/${jobId}`);
  const job = await migrationStore.getJobWithRelations(jobId);
  return { ok: true, data: job! };
}

export async function rollbackMigrationAction(
  jobId: string,
): Promise<ActionResult<MigrationJobWithRelations>> {
  try {
    await approvalService.rollback(jobId);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Rollback failed." };
  }
  await auditService.record({
    action: AUDIT_ACTIONS.MIGRATION_ROLLBACK,
    targetType: AUDIT_TARGET_TYPES.MIGRATION,
    targetId: jobId,
    summary: "Rolled back migration",
  });
  revalidatePath(`/migrations/${jobId}`);
  const job = await migrationStore.getJobWithRelations(jobId);
  return { ok: true, data: job! };
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/actions/migration.ts
git commit -m "feat(migration): server actions (options, validate, create, advance, approve, rollback)"
```

---

## Task 12: Migrations list page

**Files:**
- Create: `src/app/migrations/page.tsx`
- Create: `src/components/migration/migration-status-badge.tsx`
- Create: `src/components/migration/migration-list.tsx`

- [ ] **Step 1: Create the status badge `src/components/migration/migration-status-badge.tsx`**

```tsx
import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, type MigrationStatus } from "@/lib/migration";
import { cn } from "@/lib/utils";

const TONE: Record<MigrationStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  validating: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  provisioning: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  transferring: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  deploying: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  awaiting_approval: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  cutting_over: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  completed: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  failed: "bg-red-500/15 text-red-600 dark:text-red-400",
  rolled_back: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
};

export function MigrationStatusBadge({ status }: { status: string }) {
  const s = status as MigrationStatus;
  return (
    <Badge variant="outline" className={cn("border-transparent", TONE[s] ?? TONE.pending)}>
      {STATUS_LABELS[s] ?? status}
    </Badge>
  );
}
```

- [ ] **Step 2: Create the list `src/components/migration/migration-list.tsx`**

```tsx
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { MigrationJobRow } from "@/services/migration/store";
import { MigrationStatusBadge } from "./migration-status-badge";

export function MigrationList({ jobs }: { jobs: MigrationJobRow[] }) {
  if (jobs.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
        No migrations yet. Start one with “New Migration”.
      </div>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Resource</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Route</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {jobs.map((job) => (
          <TableRow key={job.id} className="cursor-pointer">
            <TableCell>
              <Link href={`/migrations/${job.id}`} className="font-medium hover:underline">
                {job.sourceResourceName}
                {job.destinationResourceName !== job.sourceResourceName
                  ? ` → ${job.destinationResourceName}`
                  : ""}
              </Link>
            </TableCell>
            <TableCell className="capitalize">{job.migrationType}</TableCell>
            <TableCell className="text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 text-xs">
                {job.sourceHostName}
                <ArrowRight className="h-3 w-3" />
                {job.destinationHostName}
              </span>
            </TableCell>
            <TableCell>
              <MigrationStatusBadge status={job.status} />
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {new Date(job.createdAt).toLocaleString()}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 3: Create the page `src/app/migrations/page.tsx`**

```tsx
import Link from "next/link";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { migrationStore } from "@/services/migration/store";
import { MigrationList } from "@/components/migration/migration-list";

export const dynamic = "force-dynamic";

export default async function MigrationsPage() {
  const jobs = await migrationStore.listJobs();
  return (
    <div>
      <PageHeader
        title="Migrations"
        description="Move or clone Coolify resources between servers with validation, manual approval, and resumable progress."
        action={
          <Button asChild>
            <Link href="/migrations/new">
              <Plus className="h-4 w-4" />
              New Migration
            </Link>
          </Button>
        }
      />
      <MigrationList jobs={jobs} />
    </div>
  );
}
```

- [ ] **Step 4: Verify it renders & typechecks**

Run: `npx tsc --noEmit`
Expected: no errors. (Page render is verified in the final build step.)

- [ ] **Step 5: Commit**

```bash
git add src/app/migrations/page.tsx src/components/migration/migration-status-badge.tsx src/components/migration/migration-list.tsx
git commit -m "feat(migration): migrations list page"
```

---

## Task 13: New migration wizard

**Files:**
- Create: `src/app/migrations/new/page.tsx`
- Create: `src/components/migration/migration-wizard.tsx`

- [ ] **Step 1: Create the wizard loader page `src/app/migrations/new/page.tsx`**

```tsx
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { getMigrationOptionsAction } from "@/app/actions/migration";
import { MigrationWizard } from "@/components/migration/migration-wizard";

export const dynamic = "force-dynamic";

export default function NewMigrationPage() {
  return (
    <div>
      <PageHeader
        title="New Migration"
        description="Select a resource, choose clone or migrate, pick a destination, validate, review the plan, and execute."
      />
      <Suspense fallback={<ListSkeleton rows={5} />}>
        <Loader />
      </Suspense>
    </div>
  );
}

async function Loader() {
  const options = await getMigrationOptionsAction();
  return <MigrationWizard options={options} />;
}
```

- [ ] **Step 2: Create the wizard `src/components/migration/migration-wizard.tsx`**

This is the multi-step form (Steps 1–6). It gathers selections, runs validation (Step 4), shows the plan (Step 5), then creates the job and routes to the detail page (Step 6 lives on the detail page).

```tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, XCircle, ArrowRight } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import type {
  MigrationOptions,
  MigrationPreview,
} from "@/app/actions/migration";
import {
  validateMigrationAction,
  createMigrationAction,
} from "@/app/actions/migration";
import type { MigrationType } from "@/lib/migration";

export function MigrationWizard({ options }: { options: MigrationOptions }) {
  const router = useRouter();
  const [step, setStep] = React.useState(1);
  const [sourceResourceId, setSourceResourceId] = React.useState(options.resources[0]?.id ?? "");
  const [migrationType, setMigrationType] = React.useState<MigrationType>("migrate");
  const [destinationHost, setDestinationHost] = React.useState("");
  const [destinationResourceName, setDestinationResourceName] = React.useState("");
  const [preview, setPreview] = React.useState<MigrationPreview | null>(null);
  const [npmEnabled, setNpmEnabled] = React.useState(false);
  const [cloudflareEnabled, setCloudflareEnabled] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const source = options.resources.find((r) => r.id === sourceResourceId);
  // Cannot migrate onto the same host the source lives on.
  const destinations = options.hosts.filter((h) => h.id !== source?.hostId);

  React.useEffect(() => {
    if (source && !destinationResourceName) setDestinationResourceName(source.name);
  }, [source, destinationResourceName]);

  async function runValidation() {
    setBusy(true);
    const res = await validateMigrationAction({
      migrationType,
      sourceResourceId,
      destinationHost,
      destinationResourceName,
    });
    setBusy(false);
    if (!res.ok || !res.data) {
      toast.error(res.error ?? "Validation could not run. Check the fields.");
      return;
    }
    setPreview(res.data);
    setNpmEnabled(res.data.report.defaults.npmEnabled);
    setCloudflareEnabled(res.data.report.defaults.cloudflareEnabled);
    setStep(4);
  }

  async function execute() {
    setBusy(true);
    const res = await createMigrationAction({
      migrationType,
      sourceResourceId,
      destinationHost,
      destinationResourceName,
      npmEnabled,
      cloudflareEnabled,
    });
    setBusy(false);
    if (!res.ok || !res.data) {
      toast.error(res.error ?? "Could not create the migration.");
      return;
    }
    router.push(`/migrations/${res.data.id}`);
  }

  const validationOk = preview?.report.ok ?? false;

  return (
    <div className="space-y-6">
      {/* Step 1: Resource */}
      <Card>
        <CardHeader>
          <CardTitle>1 · Select resource</CardTitle>
          <CardDescription>The Coolify resource to {migrationType}.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select value={sourceResourceId} onValueChange={(v) => { setSourceResourceId(v); setPreview(null); }}>
            <SelectTrigger><SelectValue placeholder="Choose a resource" /></SelectTrigger>
            <SelectContent>
              {options.resources.map((r) => (
                <SelectItem key={r.id} value={r.id}>{r.name} — {r.environment}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {source ? (
            <p className="text-xs text-muted-foreground">
              Host: {source.hostName} · Domains: {source.domains.join(", ") || "none"}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* Step 2: Type */}
      <Card>
        <CardHeader>
          <CardTitle>2 · Migration type</CardTitle>
          <CardDescription>Clone is a non-destructive copy. Migrate moves and cuts over after approval.</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={migrationType} onValueChange={(v) => { setMigrationType(v as MigrationType); setPreview(null); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="migrate">Migrate (move + cutover)</SelectItem>
              <SelectItem value="clone">Clone (copy only)</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Step 3: Destination */}
      <Card>
        <CardHeader>
          <CardTitle>3 · Destination host</CardTitle>
          <CardDescription>Where the {migrationType === "clone" ? "copy" : "resource"} will run.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select value={destinationHost} onValueChange={(v) => { setDestinationHost(v); setPreview(null); }}>
            <SelectTrigger><SelectValue placeholder="Choose a destination host" /></SelectTrigger>
            <SelectContent>
              {destinations.map((h) => (
                <SelectItem key={h.id} value={h.id}>
                  {h.name} — {h.capacity.freeMemoryMb} MB RAM, {h.capacity.freeDiskMb} MB disk free
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="space-y-1.5">
            <Label htmlFor="destName">Destination resource name</Label>
            <Input
              id="destName"
              value={destinationResourceName}
              onChange={(e) => { setDestinationResourceName(e.target.value); setPreview(null); }}
            />
          </div>
          <Button
            onClick={runValidation}
            disabled={busy || !sourceResourceId || !destinationHost || !destinationResourceName}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Validate
          </Button>
        </CardContent>
      </Card>

      {/* Step 4: Validation results */}
      {preview ? (
        <Card>
          <CardHeader>
            <CardTitle>4 · Validation</CardTitle>
            <CardDescription>
              Exposure: <span className="font-medium capitalize">{preview.report.exposure}</span> ·
              Volumes detected: {preview.report.volumes.length}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {preview.report.checks.map((c) => (
              <div key={c.key} className="flex items-start gap-2 text-sm">
                {c.pass ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 text-red-500" />
                )}
                <span>
                  <span className="font-medium">{c.label}</span> — {c.detail}
                </span>
              </div>
            ))}
            {migrationType === "migrate" ? (
              <div className="space-y-2 pt-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={npmEnabled} onCheckedChange={(v) => setNpmEnabled(Boolean(v))} />
                  Update NPM on cutover
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={cloudflareEnabled} onCheckedChange={(v) => setCloudflareEnabled(Boolean(v))} />
                  Update Cloudflare on cutover
                </label>
              </div>
            ) : null}
            <Button variant="secondary" disabled={!validationOk} onClick={() => setStep(5)}>
              Review plan
              <ArrowRight className="h-4 w-4" />
            </Button>
            {!validationOk ? (
              <p className="text-xs text-red-500">Fix the failing checks above (rename the destination if it is a duplicate) and re-validate.</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* Step 5: Plan */}
      {preview && step >= 5 ? (
        <Card>
          <CardHeader>
            <CardTitle>5 · Migration plan</CardTitle>
            <CardDescription>Exactly what will happen, in order.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {preview.plan.map((s) => {
                const willSkip =
                  ["archive_volumes", "transfer_volumes", "restore_volumes"].includes(s.key) &&
                  preview.report.volumes.length === 0;
                return (
                  <li key={s.key} className={willSkip ? "text-muted-foreground" : ""}>
                    {s.label}
                    {willSkip ? " (will be skipped — no volumes)" : ""}
                  </li>
                );
              })}
            </ol>
            <Button onClick={execute} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Execute {migrationType}
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/migrations/new/page.tsx src/components/migration/migration-wizard.tsx
git commit -m "feat(migration): new migration wizard (steps 1-6)"
```

---

## Task 14: Job detail page (execution + approval)

**Files:**
- Create: `src/app/migrations/[id]/page.tsx`
- Create: `src/components/migration/migration-job-view.tsx`

- [ ] **Step 1: Create the detail page `src/app/migrations/[id]/page.tsx`**

```tsx
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { getMigrationJobAction } from "@/app/actions/migration";
import { MigrationJobView } from "@/components/migration/migration-job-view";

export const dynamic = "force-dynamic";

export default async function MigrationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await getMigrationJobAction(id);
  if (!res.ok || !res.data) notFound();
  const job = res.data;
  return (
    <div>
      <PageHeader
        title={`${job.sourceResourceName} → ${job.destinationResourceName}`}
        description={`${job.migrationType} · ${job.sourceHostName} → ${job.destinationHostName}`}
      />
      <MigrationJobView initialJob={job} />
    </div>
  );
}
```

- [ ] **Step 2: Create the job view `src/components/migration/migration-job-view.tsx`**

Drives execution: while the job is non-terminal and not awaiting approval, it calls `advanceMigrationAction` in a loop (one step per call); it renders step progress, the live log, and the approval panel.

```tsx
"use client";

import * as React from "react";
import {
  CheckCircle2,
  Circle,
  Loader2,
  MinusCircle,
  XCircle,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  advanceMigrationAction,
  approveMigrationAction,
  rollbackMigrationAction,
  getMigrationJobAction,
} from "@/app/actions/migration";
import type { MigrationJobWithRelations } from "@/services/migration/store";
import { isTerminalStatus } from "@/lib/migration";
import { MigrationStatusBadge } from "./migration-status-badge";

function StepIcon({ status }: { status: string }) {
  if (status === "success") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === "failed") return <XCircle className="h-4 w-4 text-red-500" />;
  if (status === "skipped") return <MinusCircle className="h-4 w-4 text-muted-foreground" />;
  if (status === "running") return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
  return <Circle className="h-4 w-4 text-muted-foreground/40" />;
}

export function MigrationJobView({
  initialJob,
}: {
  initialJob: MigrationJobWithRelations;
}) {
  const [job, setJob] = React.useState(initialJob);
  const [acting, setActing] = React.useState(false);
  // Guards against overlapping advance calls in the effect loop.
  const advancing = React.useRef(false);

  const driving =
    !isTerminalStatus(job.status) && job.status !== "awaiting_approval";

  React.useEffect(() => {
    if (!driving) return;
    let cancelled = false;

    async function tick() {
      if (advancing.current) return;
      advancing.current = true;
      const res = await advanceMigrationAction(job.id);
      advancing.current = false;
      if (cancelled) return;
      if (res.ok && res.data) setJob(res.data);
    }

    const timer = setInterval(tick, 1200);
    void tick();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [driving, job.id]);

  async function refresh() {
    const res = await getMigrationJobAction(job.id);
    if (res.ok && res.data) setJob(res.data);
  }

  async function approve() {
    setActing(true);
    const res = await approveMigrationAction(job.id);
    setActing(false);
    if (!res.ok || !res.data) {
      toast.error(res.error ?? "Approval failed.");
      return;
    }
    setJob(res.data); // status -> cutting_over; the effect resumes advancing
  }

  async function rollback() {
    setActing(true);
    const res = await rollbackMigrationAction(job.id);
    setActing(false);
    if (!res.ok || !res.data) {
      toast.error(res.error ?? "Rollback failed.");
      return;
    }
    setJob(res.data);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <MigrationStatusBadge status={job.status} />
        {driving ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Executing…
          </span>
        ) : null}
        <Button variant="ghost" size="sm" onClick={refresh}>Refresh</Button>
      </div>

      {job.errorMessage ? (
        <Card className="border-red-500/40">
          <CardContent className="pt-6 text-sm text-red-500">{job.errorMessage}</CardContent>
        </Card>
      ) : null}

      {/* Approval panel */}
      {job.status === "awaiting_approval" ? (
        <Card className="border-amber-500/40">
          <CardHeader>
            <CardTitle>Approval required</CardTitle>
            <CardDescription>
              Validate the migrated resource, then authorize production cutover. The source
              remains intact until you approve.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {job.validationUrl ? (
              <Button asChild variant="secondary">
                <a href={job.validationUrl} target="_blank" rel="noreferrer">
                  Open validation URL <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            ) : null}
            <div className="flex gap-2">
              <Button onClick={approve} disabled={acting}>
                {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Approve cutover
              </Button>
              <Button variant="destructive" onClick={rollback} disabled={acting}>
                Rollback migration
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Progress */}
      <Card>
        <CardHeader><CardTitle>Progress</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {job.steps.map((s) => (
            <div key={s.key} className="flex items-start gap-2 text-sm">
              <StepIcon status={s.status} />
              <span className="flex-1">
                <span className="font-medium">{s.label}</span>
                {s.detail ? <span className="text-muted-foreground"> — {s.detail}</span> : null}
                {s.attemptNumber > 1 ? (
                  <span className="text-xs text-muted-foreground"> (attempt {s.attemptNumber})</span>
                ) : null}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Logs */}
      <Card>
        <CardHeader><CardTitle>Logs</CardTitle></CardHeader>
        <CardContent>
          <div className="max-h-80 overflow-y-auto rounded-md bg-muted/50 p-3 font-mono text-xs">
            {job.logs.length === 0 ? (
              <p className="text-muted-foreground">No logs yet.</p>
            ) : (
              job.logs.map((l) => (
                <div
                  key={l.id}
                  className={
                    l.level === "error"
                      ? "text-red-500"
                      : l.level === "warn"
                        ? "text-amber-500"
                        : "text-foreground/80"
                  }
                >
                  [{new Date(l.createdAt).toLocaleTimeString()}] {l.stepKey ? `${l.stepKey}: ` : ""}
                  {l.message}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/migrations/[id]/page.tsx" src/components/migration/migration-job-view.tsx
git commit -m "feat(migration): job detail view (execution loop, logs, approval panel)"
```

---

## Task 15: Navigation + module registry + final verification

**Files:**
- Modify: `src/lib/modules.ts` (add `migration` module)
- Modify: `src/components/main-nav.tsx` (add sidebar entry)

- [ ] **Step 1: Register the module in `src/lib/modules.ts`**

Add `ArrowLeftRight` to the lucide import block at the top, then add this entry to the `MODULES` array (after the `deployment` entry, in the `platform` group):

```ts
  {
    id: "migration",
    name: "Migrations",
    description: "Move or clone Coolify resources between servers, with approval-gated cutover.",
    icon: ArrowLeftRight,
    href: "/migrations",
    status: "available",
    group: "infrastructure",
    nav: [{ href: "/migrations", label: "Migrations", icon: ArrowLeftRight }],
  },
```

- [ ] **Step 2: Add the sidebar entry in `src/components/main-nav.tsx`**

Add `ArrowLeftRight` to the lucide import block, then add to the `Infrastructure` section's `items` array (after the Cloudflare entry):

```ts
      { href: "/migrations", label: "Migrations", icon: ArrowLeftRight },
```

- [ ] **Step 3: Run the full test suite**

Run: `npm run test`
Expected: PASS — all existing tests plus the new migration tests (`migration`, `planner`, `mock-coolify`, `store`, `validation`, `orchestrator`, `approval`, `migration-validation`).

- [ ] **Step 4: Lint + typecheck**

Run: `npx tsc --noEmit && npm run lint`
Expected: no type errors; lint clean.

- [ ] **Step 5: Production build (verifies pages compile + server actions wire up)**

Run: `npm run build`
Expected: build succeeds; `/migrations`, `/migrations/new`, `/migrations/[id]` appear in the route output.

- [ ] **Step 6: Commit**

```bash
git add src/lib/modules.ts src/components/main-nav.tsx
git commit -m "feat(migration): add Migrations to nav + module registry"
```

---

## Self-Review

**Spec coverage** (each spec section → task):
- Schema (`MigrationJob`/`Step`/`Log`/`Artifact`, `attemptNumber`, `sourceResourceSnapshot`) → Task 1.
- Client-safe constants, exposure classification, default flags, sslip URL → Task 2.
- Domain types + `MigrationError` → Task 3.
- Pure planner, fixed 12-step migrate + 5-step clone sequences, always-present volume steps, `stepJobStatus` → Task 4.
- `PlatformProvider` + `MockCoolifyProvider`, `VolumeTransferService` + mock → Task 5.
- Store / source-of-truth persistence + resumability primitives → Task 6.
- ValidationService (five checks, duplicate hard-fail, exposure, volumes) → Task 7.
- Orchestrator (one step/advance, runtime volume skip, snapshot freeze, artifacts, await_approval gate, failure handling, attempt bump on crash-resume, complete) → Task 8.
- ApprovalService (approve gate → cutting_over; compensating rollback; reject outside awaiting_approval) → Task 9.
- Create-migration schema + audit constants → Task 10.
- Server actions (options, validate, create, advance, get, approve, rollback) → Task 11.
- UI: list (Task 12), wizard Steps 1–6 (Task 13), detail/execution/approval Step 7 (Task 14), nav/module (Task 15).
- Mocked-only / out-of-scope (real Coolify, SSH, NPM, Cloudflare; cutover no-op) → enforced by the mock provider/transfer and the `switchEndpoints` no-op in Task 5.

**Placeholder scan:** none — every code step contains complete, runnable code.

**Type consistency:** `migrationStore` method names (`getJob`, `getJobWithRelations`, `getSteps`, `getStep`, `updateStep`, `updateJob`, `appendLog`, `addArtifact`, `getArtifact`, `getArtifacts`, `createJob`, `listJobs`) are identical across the store (Task 6), orchestrator (Task 8), approval (Task 9), and actions (Task 11). `PlatformProvider` method names match between the interface (Task 5), mock (Task 5), validation (Task 7), orchestrator (Task 8), and approval (Task 9). `ValidationReport`/`CheckResult` shapes match between validation (Task 7), its consumers (Task 8, 11), and the wizard (Task 13). Step keys are the single set defined in the planner (Task 4) and referenced everywhere by string. `MigrationJobWithRelations` is defined once (Task 6) and consumed by actions + UI.

## Notes for the implementer

- **Order is intentional:** in the migrate sequence `restore_volumes` runs *before* `provision`. Volume data lands on the destination host filesystem first; the resource that mounts it is provisioned next. Do not reorder.
- **`new Date()` is fine here** — that restriction applies only to Workflow scripts, not application code.
- **Resumability** comes for free: the orchestrator finds the first non-final step from DB state each `advance`, so a reload/crash mid-run continues correctly; a step left `running` by a crash is retried with an incremented `attemptNumber`.
- **`failed` is terminal** — a failed job does not auto-retry. (Crash-recovery of a still-`running` step is the only automatic retry path.) A manual "retry failed job" action is intentionally out of scope for this phase.
