# Dynamic Environments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded `PRODUCTION/STAGING/DEVELOPMENT` environment enum with user-defined environments (CRUD in Settings: name, description, color, abbreviation, ordering, read-only & write-confirm flags), referenced everywhere via a foreign key, with the existing three seeded so all current data keeps working.

**Architecture:** A new `Environment` table whose stable `key` is referenced by `ProvisionedDatabase.environment` and `QueryHistory.environment` as foreign keys with `onDelete: Restrict` (the DB enforces "block deletion while in use"). The compile-time `Environment` union becomes `type Environment = string`; the live list is loaded at runtime via `environmentsService` (server) and passed to client components as `EnvironmentSummary` objects. Badge colors come from a curated `PALETTE`. Sequencing keeps `npm test` + `npm run build` green at every task.

**Tech Stack:** Next.js 15 (App Router) + React 19 + TypeScript, Prisma 6 (Postgres), Vitest, TailwindCSS + shadcn/ui, Zod, Lucide.

**Spec:** `docs/superpowers/specs/2026-06-07-dynamic-environments-design.md`

**Conventions for the implementer:**
- Run a single test file with `npm test -- <name>` (e.g. `npm test -- environments-service`). Full suite: `npm test`. Lint: `npm run lint`. Types/build: `npm run build`.
- Vitest config already stubs the `server-only` import, so importing server modules in tests is fine.
- `ENCRYPTION_KEY` and `DATABASE_URL` must be set in `.env` for `npm run build`/migrations.
- This is an existing, operational app on `main`. Each task ends green.

---

## File Structure

**Created:**
- `prisma/migrations/<timestamp>_dynamic_environments/migration.sql` — table + seed + enum→FK conversion
- `src/services/environments.ts` — `environmentsService` (CRUD over the Environment table)
- `src/services/environments.test.ts`
- `src/app/actions/environments.ts` — server actions (`create/update/delete/reorder`)
- `src/components/settings/environments-section.tsx` — Settings UI (list + add/edit + delete + reorder)
- `src/lib/environment-palette.ts` — curated color palette (client-safe)
- `src/lib/environment-palette.test.ts`

**Modified (high level):**
- `prisma/schema.prisma` — Environment model + FK relations; enum removed
- `src/lib/environments.ts` — `Environment = string`, `EnvironmentSummary`, re-export palette; legacy constants removed in the final task
- `src/components/environment-badge.tsx` — render from `EnvironmentSummary` + palette
- `src/lib/naming.ts` — derive suffix from an environment's `abbreviation`
- `src/lib/validation.ts` — `environmentSchema` loosened to `z.string()`
- `src/lib/targets.ts` — iterate live environments
- `src/services/registry.ts`, `src/services/query/history.ts` — `Environment` is now `string`
- `src/app/actions/provision.ts`, `src/app/actions/query.ts` — validate env keys against the live list
- `src/lib/query-policy.ts` — per-environment flags instead of hardcoded Production
- Pages: `settings`, `dashboard`, `create`, `query`, `registry` — fetch + pass env summaries
- Components: `registry-table`, `provision-result`, `confirm-dialog`, `query-console`, `create-database-form`, `create-env-set-form` — accept env summaries/list

---

## Task 1: Environment table, migration, seed, and widen the `Environment` type

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_dynamic_environments/migration.sql`
- Modify: `src/lib/environments.ts`

- [ ] **Step 1: Edit the Prisma schema**

In `prisma/schema.prisma`, **delete** the `enum Environment { … }` block. Add the new model (place it after the `datasource`/`generator` blocks):

```prisma
/// User-defined environments. The stable `key` is referenced by other tables
/// via foreign keys with onDelete: Restrict, so an environment in use cannot be
/// deleted. `name`/color/flags are freely editable; `key` never changes.
model Environment {
  key                 String   @id
  name                String
  description         String?
  color               String   @default("slate")
  abbreviation        String?
  sortOrder           Int      @default(0) @map("sort_order")
  readOnly            Boolean  @default(false) @map("read_only")
  requireWriteConfirm Boolean  @default(true) @map("require_write_confirm")
  createdAt           DateTime @default(now()) @map("created_at")
  updatedAt           DateTime @updatedAt @map("updated_at")

  provisionedDatabases ProvisionedDatabase[]
  queryHistory         QueryHistory[]

  @@map("environments")
}
```

In `model ProvisionedDatabase`, replace the line `environment     Environment` with:

```prisma
  environment     String
  environmentRef  Environment @relation(fields: [environment], references: [key], onDelete: Restrict)
```

In `model QueryHistory`, replace `environment     Environment` with:

```prisma
  environment     String
  environmentRef  Environment @relation(fields: [environment], references: [key], onDelete: Restrict)
```

Leave all existing `@@unique`, `@@index`, and `@@map` lines unchanged.

- [ ] **Step 2: Create the migration shell (do not auto-apply)**

Run: `npx prisma migrate dev --create-only --name dynamic_environments`
Expected: a new folder `prisma/migrations/<timestamp>_dynamic_environments/migration.sql` is generated (auto-generated SQL will try to drop the enum and may attempt a destructive column change — we replace it entirely in the next step).

- [ ] **Step 3: Replace the migration SQL with the safe, seeded version**

Overwrite the generated `prisma/migrations/<timestamp>_dynamic_environments/migration.sql` with exactly:

```sql
-- Create the environments table
CREATE TABLE "environments" (
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT 'slate',
    "abbreviation" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "read_only" BOOLEAN NOT NULL DEFAULT false,
    "require_write_confirm" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "environments_pkey" PRIMARY KEY ("key")
);

-- Seed the existing three environments so all current data + behavior is preserved
INSERT INTO "environments"
  ("key","name","description","color","abbreviation","sort_order","read_only","require_write_confirm","updated_at")
VALUES
  ('PRODUCTION','Production','Production workloads.','red','',0,false,true,CURRENT_TIMESTAMP),
  ('STAGING','Staging','Pre-release staging.','amber','staging',1,false,true,CURRENT_TIMESTAMP),
  ('DEVELOPMENT','Development','Development sandbox.','slate','dev',2,false,true,CURRENT_TIMESTAMP);

-- Convert the enum columns to text (existing values are preserved verbatim)
ALTER TABLE "provisioned_databases" ALTER COLUMN "environment" TYPE TEXT USING "environment"::text;
ALTER TABLE "query_history" ALTER COLUMN "environment" TYPE TEXT USING "environment"::text;

-- Drop the now-unused enum type
DROP TYPE "Environment";

-- Add foreign keys (RESTRICT = block deletion of an environment that is in use)
ALTER TABLE "provisioned_databases"
  ADD CONSTRAINT "provisioned_databases_environment_fkey"
  FOREIGN KEY ("environment") REFERENCES "environments"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "query_history"
  ADD CONSTRAINT "query_history_environment_fkey"
  FOREIGN KEY ("environment") REFERENCES "environments"("key") ON DELETE RESTRICT ON UPDATE CASCADE;
```

- [ ] **Step 4: Apply the migration and regenerate the client**

Run: `npx prisma migrate dev`
Expected: the migration applies cleanly; `prisma generate` runs; the three rows exist in `environments`. (If a non-empty database already had rows in `provisioned_databases`/`query_history`, they now satisfy the FK because their values match the seeded keys.)

- [ ] **Step 5: Widen the `Environment` type (keep legacy constants for now)**

In `src/lib/environments.ts`, change only the type alias — keep `ENVIRONMENTS`, `ENVIRONMENT_LABELS`, and `isEnvironment` (later tasks migrate their consumers; the final task removes them). Replace:

```ts
export type Environment = "PRODUCTION" | "STAGING" | "DEVELOPMENT";
```

with:

```ts
/**
 * An environment key. Once a compile-time union; now a runtime-defined string
 * (the `Environment.key` column). The live list comes from `environmentsService`.
 */
export type Environment = string;
```

(The `ENVIRONMENTS`/`ENVIRONMENT_LABELS`/`isEnvironment` declarations below it remain unchanged and still describe the three defaults — they keep existing consumers compiling until they are migrated.)

- [ ] **Step 6: Verify the app still builds and tests pass**

Run: `npm test && npm run build`
Expected: all tests pass; build succeeds. (Behavior is unchanged — only the three seeded environments exist, and every consumer still works against them.)

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/environments.ts
git commit -m "feat: add Environment table with FK relations and seed the three defaults"
```

---

## Task 2: `environmentsService`

**Files:**
- Create: `src/services/environments.ts`
- Test: `src/services/environments.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/services/environments.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    environment: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      aggregate: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import { environmentsService } from "./environments";

const env = prisma.environment as unknown as {
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  aggregate: ReturnType<typeof vi.fn>;
};
const tx = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("environmentsService", () => {
  it("list() orders by sortOrder", async () => {
    env.findMany.mockResolvedValue([]);
    await environmentsService.list();
    expect(env.findMany).toHaveBeenCalledWith({ orderBy: { sortOrder: "asc" } });
  });

  it("create() slugifies the name into a unique uppercase key and appends to the end", async () => {
    env.findUnique.mockResolvedValue(null); // key is free
    env.aggregate.mockResolvedValue({ _max: { sortOrder: 2 } });
    env.create.mockImplementation(async ({ data }: { data: unknown }) => data);
    const created = await environmentsService.create({
      name: "QA EU",
      color: "blue",
    });
    expect(created.key).toBe("QA_EU");
    expect(created.sortOrder).toBe(3);
    expect(created.abbreviation).toBe("qa_eu");
  });

  it("create() de-duplicates a colliding key with a numeric suffix", async () => {
    env.findUnique
      .mockResolvedValueOnce({ key: "QA" }) // QA taken
      .mockResolvedValueOnce(null); // QA_2 free
    env.aggregate.mockResolvedValue({ _max: { sortOrder: 0 } });
    env.create.mockImplementation(async ({ data }: { data: { key: string } }) => data);
    const created = await environmentsService.create({ name: "QA", color: "red" });
    expect(created.key).toBe("QA_2");
  });

  it("update() never changes the key", async () => {
    env.update.mockResolvedValue({});
    await environmentsService.update("PRODUCTION", { name: "Prod", color: "red" });
    const arg = env.update.mock.calls[0][0];
    expect(arg.where).toEqual({ key: "PRODUCTION" });
    expect(arg.data).not.toHaveProperty("key");
  });

  it("delete() returns a friendly error when the environment is in use (P2003)", async () => {
    env.delete.mockRejectedValue({ code: "P2003" });
    const res = await environmentsService.remove("PRODUCTION");
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/in use/i);
  });

  it("delete() returns ok on success", async () => {
    env.delete.mockResolvedValue({});
    expect(await environmentsService.remove("OLD")).toEqual({ ok: true });
  });

  it("reorder() writes sortOrder for each key in order", async () => {
    tx.mockResolvedValue([]);
    await environmentsService.reorder(["DEVELOPMENT", "STAGING", "PRODUCTION"]);
    expect(tx).toHaveBeenCalledTimes(1);
    // builds one update per key
    const ops = tx.mock.calls[0][0];
    expect(ops).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- environments.test`
Expected: FAIL — cannot find module `./environments`.

- [ ] **Step 3: Create `src/services/environments.ts`**

```ts
import "server-only";
import { prisma } from "@/lib/prisma";
import type { Environment as EnvironmentRow } from "@prisma/client";

export interface CreateEnvironmentInput {
  name: string;
  description?: string | null;
  color: string;
  abbreviation?: string | null;
  readOnly?: boolean;
  requireWriteConfirm?: boolean;
}

export interface UpdateEnvironmentInput {
  name?: string;
  description?: string | null;
  color?: string;
  abbreviation?: string | null;
  readOnly?: boolean;
  requireWriteConfirm?: boolean;
}

export interface RemoveResult {
  ok: boolean;
  error?: string;
}

/** Turn a display name into a stable uppercase key stem (A–Z, 0–9, underscore). */
function slugifyKey(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

/** Lowercased slug used as the default db-name abbreviation. */
function slugifyAbbrev(name: string): string {
  return slugifyKey(name).toLowerCase();
}

export const environmentsService = {
  /** All environments, ordered for display. */
  async list(): Promise<EnvironmentRow[]> {
    return prisma.environment.findMany({ orderBy: { sortOrder: "asc" } });
  },

  async get(key: string): Promise<EnvironmentRow | null> {
    return prisma.environment.findUnique({ where: { key } });
  },

  /** Create an environment, generating a unique key and end-of-list sortOrder. */
  async create(input: CreateEnvironmentInput): Promise<EnvironmentRow> {
    const base = slugifyKey(input.name) || "ENV";
    let key = base;
    let n = 2;
    // Find a free key.
    while (await prisma.environment.findUnique({ where: { key } })) {
      key = `${base}_${n++}`;
    }
    const max = await prisma.environment.aggregate({ _max: { sortOrder: true } });
    const sortOrder = (max._max.sortOrder ?? -1) + 1;
    return prisma.environment.create({
      data: {
        key,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        color: input.color,
        abbreviation:
          input.abbreviation != null
            ? input.abbreviation.trim()
            : slugifyAbbrev(input.name),
        sortOrder,
        readOnly: input.readOnly ?? false,
        requireWriteConfirm: input.requireWriteConfirm ?? true,
      },
    });
  },

  /** Update editable fields. The key is immutable and never written. */
  async update(key: string, input: UpdateEnvironmentInput): Promise<EnvironmentRow> {
    return prisma.environment.update({
      where: { key },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined
          ? { description: input.description?.trim() || null }
          : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
        ...(input.abbreviation !== undefined
          ? { abbreviation: input.abbreviation?.trim() || null }
          : {}),
        ...(input.readOnly !== undefined ? { readOnly: input.readOnly } : {}),
        ...(input.requireWriteConfirm !== undefined
          ? { requireWriteConfirm: input.requireWriteConfirm }
          : {}),
      },
    });
  },

  /** Delete; the DB FK (Restrict) blocks deletion of an in-use environment. */
  async remove(key: string): Promise<RemoveResult> {
    try {
      await prisma.environment.delete({ where: { key } });
      return { ok: true };
    } catch (err) {
      if ((err as { code?: string }).code === "P2003") {
        return {
          ok: false,
          error:
            "This environment is in use by provisioned databases or query history and can't be deleted.",
        };
      }
      throw err;
    }
  },

  /** Persist a new ordering: sortOrder follows the given key order. */
  async reorder(keys: string[]): Promise<void> {
    await prisma.$transaction(
      keys.map((key, index) =>
        prisma.environment.update({ where: { key }, data: { sortOrder: index } }),
      ),
    );
  },
};
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- environments.test`
Expected: PASS — all 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/services/environments.ts src/services/environments.test.ts
git commit -m "feat: add environmentsService CRUD over the Environment table"
```

---

## Task 3: Color palette, `EnvironmentSummary`, and dynamic `EnvironmentBadge`

**Files:**
- Create: `src/lib/environment-palette.ts`
- Test: `src/lib/environment-palette.test.ts`
- Modify: `src/lib/environments.ts` (add `EnvironmentSummary`, `toSummary`)
- Modify: `src/components/environment-badge.tsx`
- Modify: `src/components/registry/registry-table.tsx`, `src/components/create/provision-result.tsx`, `src/components/query/confirm-dialog.tsx` (badge now needs a summary)

- [ ] **Step 1: Write the failing palette test**

Create `src/lib/environment-palette.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { PALETTE, PALETTE_KEYS, paletteEntry } from "./environment-palette";

describe("environment palette", () => {
  it("exposes a non-empty set of swatches", () => {
    expect(PALETTE_KEYS.length).toBeGreaterThanOrEqual(8);
  });

  it("every entry has a label and a badgeClass", () => {
    for (const key of PALETTE_KEYS) {
      expect(PALETTE[key].label).toBeTruthy();
      expect(PALETTE[key].badgeClass).toContain("bg-");
    }
  });

  it("paletteEntry falls back to slate for an unknown color", () => {
    expect(paletteEntry("not-a-color")).toBe(PALETTE.slate);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- environment-palette`
Expected: FAIL — cannot find module `./environment-palette`.

- [ ] **Step 3: Create `src/lib/environment-palette.ts`**

```ts
/**
 * Curated environment color palette (client-safe). Each swatch maps to a
 * Tailwind badge class with guaranteed legible contrast and a dot class for the
 * picker. Environments store the swatch KEY (e.g. "red") in `Environment.color`.
 */
export interface PaletteEntry {
  label: string;
  /** Classes for the colored badge. */
  badgeClass: string;
  /** Classes for a small swatch dot in the picker. */
  dotClass: string;
}

export const PALETTE: Record<string, PaletteEntry> = {
  red: { label: "Red", badgeClass: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300", dotClass: "bg-red-500" },
  orange: { label: "Orange", badgeClass: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300", dotClass: "bg-orange-500" },
  amber: { label: "Amber", badgeClass: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300", dotClass: "bg-amber-500" },
  green: { label: "Green", badgeClass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300", dotClass: "bg-emerald-500" },
  teal: { label: "Teal", badgeClass: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300", dotClass: "bg-teal-500" },
  cyan: { label: "Cyan", badgeClass: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300", dotClass: "bg-cyan-500" },
  blue: { label: "Blue", badgeClass: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300", dotClass: "bg-blue-500" },
  violet: { label: "Violet", badgeClass: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300", dotClass: "bg-violet-500" },
  pink: { label: "Pink", badgeClass: "bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-300", dotClass: "bg-pink-500" },
  slate: { label: "Slate", badgeClass: "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200", dotClass: "bg-slate-500" },
};

export const PALETTE_KEYS = Object.keys(PALETTE);

export function paletteEntry(color: string): PaletteEntry {
  return PALETTE[color] ?? PALETTE.slate;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- environment-palette`
Expected: PASS.

- [ ] **Step 5: Add `EnvironmentSummary` + `toSummary` to `src/lib/environments.ts`**

Append to `src/lib/environments.ts` (keep everything already there):

```ts
import type { Environment as EnvironmentRow } from "@prisma/client";

/** Client-safe, non-secret view of an environment passed from server to client. */
export interface EnvironmentSummary {
  key: string;
  name: string;
  description: string | null;
  color: string;
  abbreviation: string | null;
  sortOrder: number;
  readOnly: boolean;
  requireWriteConfirm: boolean;
}

/** Map a Prisma Environment row to the client-safe summary. */
export function toSummary(row: EnvironmentRow): EnvironmentSummary {
  return {
    key: row.key,
    name: row.name,
    description: row.description,
    color: row.color,
    abbreviation: row.abbreviation,
    sortOrder: row.sortOrder,
    readOnly: row.readOnly,
    requireWriteConfirm: row.requireWriteConfirm,
  };
}
```

(`@prisma/client` is a type-only import here; it does not pull server code into client bundles.)

- [ ] **Step 6: Rewrite `EnvironmentBadge` to render from a summary + palette**

Replace the entire contents of `src/components/environment-badge.tsx`:

```tsx
import { paletteEntry } from "@/lib/environment-palette";
import type { EnvironmentSummary } from "@/lib/environments";
import { cn } from "@/lib/utils";

/**
 * Renders an environment label in its configured palette color. Accepts a full
 * `EnvironmentSummary`, or a minimal `{ name, color }` for callers that only
 * have those two fields.
 */
export function EnvironmentBadge({
  environment,
}: {
  environment: Pick<EnvironmentSummary, "name" | "color">;
}) {
  const entry = paletteEntry(environment.color);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold",
        entry.badgeClass,
      )}
    >
      {environment.name}
    </span>
  );
}
```

- [ ] **Step 7: Update the three badge call sites to pass a `{ name, color }` summary**

The badge no longer accepts a bare key string. Update its callers' prop types so they carry name+color.

In `src/components/registry/registry-table.tsx`:
- Change the `RegistryRow` interface field `environment: Environment;` to:
```ts
  environment: { key: string; name: string; color: string };
```
- Remove the now-unused `import type { Environment } from "@/lib/environments";`.
- The two `<EnvironmentBadge environment={row.environment} />` / `={selected.environment}` calls already pass the object — they now pass `{key,name,color}`, which satisfies the badge's `Pick<…,"name"|"color">`. No JSX change needed.

In `src/components/create/provision-result.tsx`:
- Change `ProvisionResultItem.environment: Environment;` to:
```ts
  environment: { key: string; name: string; color: string };
```
- Replace `import type { Environment } from "@/lib/environments";` with nothing (drop it).
- The `<Card key={r.environment}>` line uses the object as a React key — change it to `key={r.environment.key}`.
- `<EnvironmentBadge environment={r.environment} />` is unchanged (object now carries name+color).

In `src/components/query/confirm-dialog.tsx`:
- Change the prop type `environment: Environment;` to:
```ts
  environment: { key: string; name: string; color: string };
```
- Replace `import type { Environment } from "@/lib/environments";` with nothing.
- `<EnvironmentBadge environment={environment} />` unchanged.
- The footer button text `Execute on {environment.toLowerCase()}` must change to `Execute on {environment.name}`.

(The components that *render* these — registry page, create forms, query console — are updated in Tasks 7/8/9 to supply `{key,name,color}` objects. Until then this task will not compile on its own, so it is bundled with those edits below. To keep this task self-contained and green, also apply Step 8.)

- [ ] **Step 8: Keep the tree green — provide name+color at the current call sites**

Because Tasks 7–9 fully migrate the data flow, make minimal interim edits so the build passes now:

In `src/app/registry/page.tsx`, the `rows` map currently sets `environment: r.environment as Environment`. Replace that line with a lookup that resolves name+color from the live environments (add near the top of the function, after `records` is fetched):

```ts
import { environmentsService } from "@/services/environments";
import { toSummary } from "@/lib/environments";
// …
  const envList = (await environmentsService.list()).map(toSummary);
  const envByKey = new Map(envList.map((e) => [e.key, e]));
```

and in the `rows` map set:

```ts
    environment: (() => {
      const e = envByKey.get(r.environment);
      return { key: r.environment, name: e?.name ?? r.environment, color: e?.color ?? "slate" };
    })(),
```

For `provision-result.tsx` and `confirm-dialog.tsx`, their callers (create forms, query console) still pass a bare key today. Apply the matching interim shim in those callers:
- In `create-database-form.tsx` and `create-env-set-form.tsx`, wherever a `ProvisionResultItem` is built from an action result, set `environment: { key: r.environment, name: r.environment, color: "slate" }` (Task 8 replaces this with real summaries).
- In `query-console.tsx`, change `<ConfirmDialog … environment={environment} …>` to `environment={{ key: environment, name: environment, color: "slate" }}` (Task 9 replaces this with the selected env summary).

(These shims are deliberately minimal and are overwritten in Tasks 7–9; they exist only so each task ends green.)

- [ ] **Step 9: Verify build + tests**

Run: `npm test && npm run build`
Expected: green. Badges now render from palette colors; the three seeded environments display in red/amber/slate.

- [ ] **Step 10: Commit**

```bash
git add src/lib/environment-palette.ts src/lib/environment-palette.test.ts src/lib/environments.ts src/components/environment-badge.tsx src/components/registry/registry-table.tsx src/components/create/provision-result.tsx src/components/query/confirm-dialog.tsx src/app/registry/page.tsx src/components/create/create-database-form.tsx src/components/create/create-env-set-form.tsx src/components/query/query-console.tsx
git commit -m "feat: dynamic EnvironmentBadge + color palette + EnvironmentSummary"
```

---

## Task 4: Validation + environment server actions

**Files:**
- Modify: `src/lib/validation.ts`
- Create: `src/app/actions/environments.ts`
- Test: extend `src/lib/validation.test.ts`

- [ ] **Step 1: Loosen `environmentSchema` and add an environment-input schema (write failing test first)**

Add to `src/lib/validation.test.ts`:

```ts
import { environmentInputSchema } from "./validation";

describe("environmentInputSchema", () => {
  it("accepts a valid environment", () => {
    expect(
      environmentInputSchema.safeParse({ name: "QA", color: "blue" }).success,
    ).toBe(true);
  });
  it("rejects a blank name", () => {
    expect(environmentInputSchema.safeParse({ name: "", color: "blue" }).success).toBe(false);
  });
  it("rejects an unknown color", () => {
    expect(environmentInputSchema.safeParse({ name: "QA", color: "octarine" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- validation.test`
Expected: FAIL — `environmentInputSchema` is not exported.

- [ ] **Step 3: Update `src/lib/validation.ts`**

Change `environmentSchema` (currently `z.enum(ENVIRONMENTS …)`) to a plain string, and add the input schema. Replace:

```ts
export const environmentSchema = z.enum(
  ENVIRONMENTS as [string, ...string[]],
);
```

with:

```ts
// An environment key. Existence against the live list is verified in actions.
export const environmentSchema = z.string().min(1, "Environment is required");
```

Add the `import { PALETTE_KEYS } from "./environment-palette";` near the top, and append:

```ts
/** Input for creating/updating an environment from the Settings UI. */
export const environmentInputSchema = z.object({
  name: z.string().min(1, "Name is required").max(60, "Name is too long"),
  description: z.string().max(500).optional().or(z.literal("")),
  color: z.enum(PALETTE_KEYS as [string, ...string[]]),
  abbreviation: z
    .string()
    .max(30)
    .regex(/^[a-z0-9_]*$/, "Lowercase letters, numbers, and underscores only")
    .optional()
    .or(z.literal("")),
  readOnly: z.boolean().optional(),
  requireWriteConfirm: z.boolean().optional(),
});
export type EnvironmentInput = z.infer<typeof environmentInputSchema>;
```

(Remove the now-unused `ENVIRONMENTS` import from `validation.ts` only if it is no longer referenced; `createDatabaseSchema`/`createEnvSetSchema` still use `environmentSchema`, which no longer needs `ENVIRONMENTS`.)

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- validation.test`
Expected: PASS.

- [ ] **Step 5: Create `src/app/actions/environments.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";

import { environmentInputSchema } from "@/lib/validation";
import { environmentsService } from "@/services/environments";

export interface EnvActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

function revalidateAll() {
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/create");
  revalidatePath("/query");
  revalidatePath("/registry");
}

export async function createEnvironmentAction(input: unknown): Promise<EnvActionResult> {
  const parsed = environmentInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  try {
    await environmentsService.create({
      name: parsed.data.name,
      description: parsed.data.description || null,
      color: parsed.data.color,
      abbreviation: parsed.data.abbreviation ? parsed.data.abbreviation : undefined,
      readOnly: parsed.data.readOnly,
      requireWriteConfirm: parsed.data.requireWriteConfirm,
    });
    revalidateAll();
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not create the environment." };
  }
}

export async function updateEnvironmentAction(
  key: string,
  input: unknown,
): Promise<EnvActionResult> {
  const parsed = environmentInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  try {
    await environmentsService.update(key, {
      name: parsed.data.name,
      description: parsed.data.description || null,
      color: parsed.data.color,
      abbreviation: parsed.data.abbreviation ?? "",
      readOnly: parsed.data.readOnly,
      requireWriteConfirm: parsed.data.requireWriteConfirm,
    });
    revalidateAll();
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not update the environment." };
  }
}

export async function deleteEnvironmentAction(key: string): Promise<EnvActionResult> {
  const res = await environmentsService.remove(key);
  if (res.ok) revalidateAll();
  return res;
}

export async function reorderEnvironmentsAction(keys: string[]): Promise<EnvActionResult> {
  try {
    await environmentsService.reorder(keys);
    revalidateAll();
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not reorder environments." };
  }
}
```

- [ ] **Step 6: Verify build + tests**

Run: `npm test && npm run build`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add src/lib/validation.ts src/lib/validation.test.ts src/app/actions/environments.ts
git commit -m "feat: environment validation schema and CRUD server actions"
```

---

## Task 5: Environments Settings section (list + add/edit + delete + reorder)

**Files:**
- Create: `src/components/settings/environments-section.tsx`
- Modify: `src/app/settings/page.tsx`

- [ ] **Step 1: Create the Environments section component**

Create `src/components/settings/environments-section.tsx`:

```tsx
"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { EnvironmentBadge } from "@/components/environment-badge";
import { PALETTE, PALETTE_KEYS } from "@/lib/environment-palette";
import { cn } from "@/lib/utils";
import type { EnvironmentSummary } from "@/lib/environments";
import {
  createEnvironmentAction,
  deleteEnvironmentAction,
  reorderEnvironmentsAction,
  updateEnvironmentAction,
} from "@/app/actions/environments";

type Draft = {
  name: string;
  description: string;
  color: string;
  abbreviation: string;
  readOnly: boolean;
  requireWriteConfirm: boolean;
};

const EMPTY: Draft = {
  name: "",
  description: "",
  color: "blue",
  abbreviation: "",
  readOnly: false,
  requireWriteConfirm: true,
};

export function EnvironmentsSection({ environments }: { environments: EnvironmentSummary[] }) {
  const [editingKey, setEditingKey] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        {environments.map((env, i) => (
          <EnvRow
            key={env.key}
            env={env}
            isFirst={i === 0}
            isLast={i === environments.length - 1}
            editing={editingKey === env.key}
            onEdit={() => setEditingKey(env.key)}
            onCancel={() => setEditingKey(null)}
            allKeys={environments.map((e) => e.key)}
          />
        ))}
      </div>

      {adding ? (
        <Card>
          <CardContent className="pt-6">
            <EnvForm
              initial={EMPTY}
              submitLabel="Create environment"
              onCancel={() => setAdding(false)}
              onSubmit={async (draft) => {
                const res = await createEnvironmentAction(draft);
                if (res.ok) {
                  toast.success("Environment created.");
                  setAdding(false);
                } else {
                  toast.error(res.error ?? "Could not create.");
                }
                return res;
              }}
            />
          </CardContent>
        </Card>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          <Plus /> Add environment
        </Button>
      )}
    </div>
  );
}

function EnvRow({
  env,
  isFirst,
  isLast,
  editing,
  onEdit,
  onCancel,
  allKeys,
}: {
  env: EnvironmentSummary;
  isFirst: boolean;
  isLast: boolean;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  allKeys: string[];
}) {
  const [busy, setBusy] = React.useState(false);

  async function move(dir: -1 | 1) {
    const idx = allKeys.indexOf(env.key);
    const next = [...allKeys];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setBusy(true);
    try {
      const res = await reorderEnvironmentsAction(next);
      if (!res.ok) toast.error(res.error ?? "Could not reorder.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const res = await deleteEnvironmentAction(env.key);
      if (res.ok) toast.success(`Deleted ${env.name}.`);
      else toast.error(res.error ?? "Could not delete.");
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <Card>
        <CardContent className="pt-6">
          <EnvForm
            initial={{
              name: env.name,
              description: env.description ?? "",
              color: env.color,
              abbreviation: env.abbreviation ?? "",
              readOnly: env.readOnly,
              requireWriteConfirm: env.requireWriteConfirm,
            }}
            submitLabel="Save changes"
            onCancel={onCancel}
            onSubmit={async (draft) => {
              const res = await updateEnvironmentAction(env.key, draft);
              if (res.ok) {
                toast.success("Environment updated.");
                onCancel();
              } else {
                toast.error(res.error ?? "Could not update.");
              }
              return res;
            }}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
      <div className="flex min-w-0 items-center gap-3">
        <EnvironmentBadge environment={env} />
        <span className="truncate text-sm text-muted-foreground">{env.description}</span>
        {env.readOnly ? (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide">Read-only</span>
        ) : null}
        {env.requireWriteConfirm ? (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide">Confirm writes</span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="icon" onClick={() => move(-1)} disabled={isFirst || busy} aria-label="Move up">
          <ChevronUp className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => move(1)} disabled={isLast || busy} aria-label="Move down">
          <ChevronDown className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onEdit} disabled={busy} aria-label="Edit">
          <Pencil className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={remove} disabled={busy} aria-label="Delete">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

function EnvForm({
  initial,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  initial: Draft;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (draft: Draft) => Promise<{ ok: boolean; fieldErrors?: Record<string, string[]> }>;
}) {
  const [draft, setDraft] = React.useState<Draft>(initial);
  const [pending, setPending] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setFieldErrors({});
    try {
      const res = await onSubmit(draft);
      if (!res.ok && res.fieldErrors) setFieldErrors(res.fieldErrors);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. QA" autoFocus />
          {fieldErrors.name ? <p className="text-xs text-destructive">{fieldErrors.name[0]}</p> : null}
        </div>
        <div className="space-y-1.5">
          <Label>Name suffix (for db/user names)</Label>
          <Input
            value={draft.abbreviation}
            onChange={(e) => set("abbreviation", e.target.value)}
            placeholder="e.g. qa (blank = no suffix)"
            className="font-mono"
          />
          {fieldErrors.abbreviation ? <p className="text-xs text-destructive">{fieldErrors.abbreviation[0]}</p> : null}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Description</Label>
        <Textarea value={draft.description} onChange={(e) => set("description", e.target.value)} rows={2} />
      </div>

      <div className="space-y-1.5">
        <Label>Color</Label>
        <div className="flex flex-wrap gap-2">
          {PALETTE_KEYS.map((key) => (
            <button
              type="button"
              key={key}
              onClick={() => set("color", key)}
              aria-label={PALETTE[key].label}
              className={cn(
                "h-7 w-7 rounded-full ring-offset-2 transition",
                PALETTE[key].dotClass,
                draft.color === key ? "ring-2 ring-foreground" : "",
              )}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={draft.readOnly} onCheckedChange={(c) => set("readOnly", c === true)} />
          Read-only (block SQL writes)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={draft.requireWriteConfirm} onCheckedChange={(c) => set("requireWriteConfirm", c === true)} />
          Require confirmation for writes
        </label>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          {submitLabel}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Wire it into the Settings page (first section)**

In `src/app/settings/page.tsx`:
- Add imports:
```tsx
import { Layers } from "lucide-react";
import { EnvironmentsSection } from "@/components/settings/environments-section";
import { environmentsService } from "@/services/environments";
import { toSummary } from "@/lib/environments";
```
- After `const targets = await getAllTargetInfo();` add:
```tsx
  const environments = (await environmentsService.list()).map(toSummary);
```
- Immediately after the `<PageHeader … />` and before the existing PostgreSQL servers `<div>`, insert:
```tsx
      <div className="mb-10">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <Layers className="h-4 w-4" /> Environments
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Define the environments your infrastructure uses. Everything else —
          databases, connections, and modules — is organized by these.
        </p>
        <EnvironmentsSection environments={environments} />
      </div>
```

- [ ] **Step 3: Verify manually + build**

Run: `npm run build`, then `npm run dev` → open `/settings`. Expected:
- An "Environments" section at the top listing Production (red), Staging (amber), Development (slate), each with reorder arrows, edit, delete.
- "Add environment" → form with Name, suffix, Description, color swatches, Read-only + Confirm toggles; creating adds a row.
- Editing updates; deleting an in-use one shows the "in use" toast; reordering persists.

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/environments-section.tsx src/app/settings/page.tsx
git commit -m "feat: Environments CRUD section on the Settings page"
```

---

## Task 6: PostgreSQL targets iterate the live environment list

**Files:**
- Modify: `src/lib/targets.ts`
- Modify: `src/app/settings/page.tsx` (Postgres section already iterates `targets`; ensure it covers all envs)

- [ ] **Step 1: Make `targets.ts` iterate the live environments**

In `src/lib/targets.ts`:
- Add `import { environmentsService } from "@/services/environments";`.
- Replace the body of `getAllTargetInfo()` so it iterates the live list instead of the static `ENVIRONMENTS`:

```ts
export async function getAllTargetInfo(): Promise<TargetInfo[]> {
  const envs = await environmentsService.list();
  return Promise.all(envs.map((e) => getTargetInfo(e.key)));
}
```

- In `getTargetInfo(environment)`, the label currently comes from `ENVIRONMENT_LABELS[environment]`. Replace that lookup with the environment's name from the DB. Change `getTargetInfo` to:

```ts
export async function getTargetInfo(environment: Environment): Promise<TargetInfo> {
  const env = await environmentsService.get(environment);
  const fromSettings =
    (await settingsService.get(POSTGRES_SETTING_KEYS(environment)))?.trim() || null;
  const fromEnv =
    process.env[`POSTGRES_${(env?.abbreviation || environment).toUpperCase()}_URL`]?.trim() ||
    process.env[legacyEnvVar(environment)]?.trim() ||
    null;
  const url = fromSettings ?? fromEnv;
  const source: TargetSource | null = fromSettings ? "settings" : fromEnv ? "env" : null;
  const parsed = url ? parseConnection(url) : null;
  return {
    environment,
    label: env?.name ?? environment,
    envVar: legacyEnvVar(environment),
    configured: Boolean(url),
    source,
    host: parsed?.host ?? null,
    port: parsed?.port ?? null,
    masked: url ? maskConnectionString(url) : null,
  };
}
```

- Replace the static `POSTGRES_SETTING_KEYS` record and `ENV_VAR_BY_ENVIRONMENT` with key-derived helpers (dynamic environments have no fixed env-var names; only the three legacy ones do). Replace those two declarations with:

```ts
/** Settings key holding an environment's admin connection string. */
export function POSTGRES_SETTING_KEYS(environment: Environment): string {
  return `postgres.${environment}.url`;
}

/** Legacy env-var fallback name (only the original three were ever documented). */
function legacyEnvVar(environment: Environment): string {
  const legacy: Record<string, string> = {
    PRODUCTION: "POSTGRES_PROD_URL",
    STAGING: "POSTGRES_STAGING_URL",
    DEVELOPMENT: "POSTGRES_DEV_URL",
  };
  return legacy[environment] ?? `POSTGRES_${environment}_URL`;
}
```

- Update `getAdminUrl` to use the function form:

```ts
export async function getAdminUrl(environment: Environment): Promise<string | null> {
  const fromSettings = await settingsService.get(POSTGRES_SETTING_KEYS(environment));
  if (fromSettings && fromSettings.trim().length > 0) return fromSettings.trim();
  const raw = process.env[legacyEnvVar(environment)];
  if (!raw || raw.trim().length === 0) return null;
  return raw.trim();
}
```

> Note: `POSTGRES_SETTING_KEYS` changes from a record to a function. Update its one other caller — `src/app/actions/provision.ts` `savePostgresTargetAction`/`clearPostgresTargetAction` — from `POSTGRES_SETTING_KEYS[environment]` to `POSTGRES_SETTING_KEYS(environment)` (two call sites).

- [ ] **Step 2: Update the `targets.test.ts` for the function-form key**

In `src/lib/targets.test.ts`, the test mocks `settingsService` and references `POSTGRES_SETTING_KEYS.PRODUCTION`. Also mock `environmentsService`. At the top add:

```ts
vi.mock("@/services/environments", () => ({
  environmentsService: {
    list: vi.fn(async () => [
      { key: "PRODUCTION", name: "Production", abbreviation: "", color: "red" },
      { key: "STAGING", name: "Staging", abbreviation: "staging", color: "amber" },
      { key: "DEVELOPMENT", name: "Development", abbreviation: "dev", color: "slate" },
    ]),
    get: vi.fn(async (k: string) => ({ key: k, name: k, abbreviation: null })),
  },
}));
```

Change every `POSTGRES_SETTING_KEYS.PRODUCTION` reference to `POSTGRES_SETTING_KEYS("PRODUCTION")` (and similarly for any other env). Update the "prefers settings over env" test's `get.mockImplementation` to compare against `POSTGRES_SETTING_KEYS("PRODUCTION")`.

- [ ] **Step 3: Run tests**

Run: `npm test -- targets.test`
Expected: PASS.

- [ ] **Step 4: Verify the Settings Postgres section covers every environment**

`src/app/settings/page.tsx` already maps `targets` to `<PostgresTargetForm target={t} />`. Since `getAllTargetInfo()` now returns one entry per live environment, no JSX change is needed — confirm by running `npm run dev` and adding a new environment, then checking a Postgres card appears for it.

- [ ] **Step 5: Verify build + tests**

Run: `npm test && npm run build`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/targets.ts src/lib/targets.test.ts src/app/actions/provision.ts
git commit -m "feat: PostgreSQL targets iterate the live environment list"
```

---

## Task 7: Registry stats + dashboard + registry table go dynamic

**Files:**
- Modify: `src/services/registry.ts`
- Modify: `src/app/dashboard/page.tsx`
- Modify: `src/app/registry/page.tsx` (finalize the Task-3 shim into a real map)

- [ ] **Step 1: Make `registryService.stats()` dynamic (write failing test first)**

Create `src/services/registry.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { provisionedDatabase: { groupBy: vi.fn(), findMany: vi.fn() } },
}));

import { prisma } from "@/lib/prisma";
import { registryService } from "./registry";

const db = prisma.provisionedDatabase as unknown as {
  groupBy: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
};

beforeEach(() => vi.clearAllMocks());

describe("registryService.stats", () => {
  it("returns a total and a per-environment-key count map", async () => {
    db.groupBy.mockResolvedValue([
      { environment: "PRODUCTION", _count: { _all: 3 } },
      { environment: "QA", _count: { _all: 1 } },
    ]);
    const stats = await registryService.stats();
    expect(stats.total).toBe(4);
    expect(stats.byEnvironment).toEqual({ PRODUCTION: 3, QA: 1 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- registry.test`
Expected: FAIL — `stats()` still returns the hardcoded `{ PRODUCTION, STAGING, DEVELOPMENT }` shape.

- [ ] **Step 3: Update `registryService.stats()`**

In `src/services/registry.ts`, replace the `stats()` method's return type and body:

```ts
  /** Aggregate counts for the dashboard cards, keyed by environment key. */
  async stats(): Promise<{
    total: number;
    byEnvironment: Record<string, number>;
  }> {
    const grouped = await prisma.provisionedDatabase.groupBy({
      by: ["environment"],
      _count: { _all: true },
    });
    const byEnvironment: Record<string, number> = {};
    let total = 0;
    for (const row of grouped) {
      byEnvironment[row.environment] = row._count._all;
      total += row._count._all;
    }
    return { total, byEnvironment };
  },
```

(Also remove the now-unused `import type { Environment }` from `registry.ts` if it is only used by the old `stats` signature; keep it if `RecordInput.environment` still references it — it does, and `Environment` is now `string`, so the import is harmless. Leave it.)

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- registry.test`
Expected: PASS.

- [ ] **Step 5: Update the dashboard to render per dynamic environment**

In `src/app/dashboard/page.tsx`:
- Add `import { environmentsService } from "@/services/environments"; import { toSummary } from "@/lib/environments"; import { EnvironmentBadge } from "@/components/environment-badge";` (EnvironmentBadge may already be imported — don't duplicate).
- Add to the `Promise.all` (or a separate await): `const environments = (await environmentsService.list()).map(toSummary);`
- Replace the four hardcoded StatCards' environment cards. Keep "Total databases" and "Configured servers" StatCards; replace the two hardcoded "Production"/"Staging" cards with a per-environment loop. Change the stats grid to:

```tsx
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total databases"
          value={stats.total}
          icon={<Database className="h-4 w-4 text-muted-foreground" />}
        />
        {environments.map((env) => (
          <StatCard
            key={env.key}
            title={env.name}
            value={stats.byEnvironment[env.key] ?? 0}
            icon={<Layers className="h-4 w-4 text-muted-foreground" />}
          />
        ))}
        <StatCard
          title="Configured servers"
          value={`${configuredCount}/${targets.length}`}
          icon={<Server className="h-4 w-4 text-muted-foreground" />}
        />
      </div>
```

(`Layers`, `Server`, `Database` are already imported. `configuredCount`/`targets` already exist. The "Server targets" card below already maps `targets` and uses `EnvironmentBadge environment={t.environment as Environment}` — change that to look up the summary: build `const envByKey = new Map(environments.map((e) => [e.key, e]));` and render `<EnvironmentBadge environment={envByKey.get(t.environment) ?? { name: t.environment, color: "slate" }} />`. Remove the `as Environment` cast.)

- [ ] **Step 6: Finalize the registry page map (replace Task-3 shim)**

In `src/app/registry/page.tsx`, the Task-3 shim already builds `envByKey`. Confirm the `rows` map sets `environment: { key: r.environment, name: e?.name ?? r.environment, color: e?.color ?? "slate" }` using `envByKey`. No further change needed; remove the leftover `import type { Environment }` if unused.

- [ ] **Step 7: Verify build + tests**

Run: `npm test && npm run build`
Expected: green. Dashboard shows a card per environment; the registry table badges render in each environment's color.

- [ ] **Step 8: Commit**

```bash
git add src/services/registry.ts src/services/registry.test.ts src/app/dashboard/page.tsx src/app/registry/page.tsx
git commit -m "feat: registry stats, dashboard, and registry table use dynamic environments"
```

---

## Task 8: Create flows use the live environment list

**Files:**
- Modify: `src/lib/naming.ts`
- Modify: `src/app/create/page.tsx`
- Modify: `src/components/create/create-database-form.tsx`
- Modify: `src/components/create/create-env-set-form.tsx`
- Modify: `src/app/actions/provision.ts`

- [ ] **Step 1: Make naming derive the suffix from an abbreviation (write failing test first)**

Create `src/lib/naming.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { deriveDatabaseName, deriveUsername } from "./naming";

describe("naming", () => {
  it("omits the suffix when abbreviation is empty (production)", () => {
    expect(deriveDatabaseName("Orders API", "")).toBe("orders_api");
    expect(deriveUsername("Orders API", "")).toBe("orders_api_user");
  });
  it("appends the abbreviation as a suffix", () => {
    expect(deriveDatabaseName("Orders API", "staging")).toBe("orders_api_staging");
    expect(deriveUsername("Orders API", "dev")).toBe("orders_api_dev_user");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- naming.test`
Expected: FAIL — the functions currently take an `Environment` and use `ENV_SUFFIX`.

- [ ] **Step 3: Rewrite `src/lib/naming.ts` to take an abbreviation**

Replace the `ENV_SUFFIX` block and both derive functions:

```ts
/** Derive the database name for an app + environment abbreviation. */
export function deriveDatabaseName(appName: string, abbreviation: string | null): string {
  const stem = sanitizeIdentifier(appName);
  const suffix = abbreviation ? `_${abbreviation}` : "";
  return `${stem}${suffix}`;
}

/** Derive the database username for an app + environment abbreviation. */
export function deriveUsername(appName: string, abbreviation: string | null): string {
  const stem = sanitizeIdentifier(appName);
  const suffix = abbreviation ? `_${abbreviation}` : "";
  return `${stem}${suffix}_user`;
}
```

Remove the now-unused `import type { Environment } from "./environments";` and the `ENV_SUFFIX` constant.

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- naming.test`
Expected: PASS.

- [ ] **Step 5: Pass the environment list into the create forms**

In `src/app/create/page.tsx`:
- Add `import { environmentsService } from "@/services/environments"; import { toSummary } from "@/lib/environments";`
- After `const targets = await getAllTargetInfo();` add `const environments = (await environmentsService.list()).map(toSummary);`
- `configured` is currently `Record<Environment, boolean>` keyed by the static envs; keep building it from `targets` (works for dynamic keys). Pass `environments` to both forms:
  - `<CreateDatabaseForm configured={configured} environments={environments} />`
  - `<CreateEnvSetForm environments={environments} />`

- [ ] **Step 6: Update `CreateDatabaseForm`**

In `src/components/create/create-database-form.tsx`:
- Replace `import { ENVIRONMENT_LABELS, ENVIRONMENTS, type Environment } from "@/lib/environments";` with `import type { Environment, EnvironmentSummary } from "@/lib/environments";`.
- Change `interface Props` to `{ configured: Record<Environment, boolean>; environments: EnvironmentSummary[]; }` and destructure `{ configured, environments }`.
- Initialize state from the list: `const [environment, setEnvironment] = React.useState<Environment>(environments.find((e) => configured[e.key])?.key ?? environments[0]?.key ?? "");`
- Build `const selectedEnv = environments.find((e) => e.key === environment);`
- The derive effect changes to use the abbreviation: replace `deriveDatabaseName(appName, environment)` with `deriveDatabaseName(appName, selectedEnv?.abbreviation ?? null)` and similarly `deriveUsername(appName, selectedEnv?.abbreviation ?? null)`. Add `selectedEnv` to the effect deps (or `environment`).
- The environment `<Select>` options change from `ENVIRONMENTS.map` to:
```tsx
            {environments.map((env) => (
              <SelectItem key={env.key} value={env.key} disabled={!configured[env.key]}>
                {env.name}
                {!configured[env.key] ? " — not configured" : ""}
              </SelectItem>
            ))}
```
- The success panel builds a `ProvisionResultItem`; set `environment: { key: environment, name: selectedEnv?.name ?? environment, color: selectedEnv?.color ?? "slate" }` (replacing the Task-3 shim).

- [ ] **Step 7: Update `CreateEnvSetForm`**

In `src/components/create/create-env-set-form.tsx`:
- Replace `import { ENVIRONMENTS } from "@/lib/environments";` with `import type { EnvironmentSummary } from "@/lib/environments";`.
- Signature: `export function CreateEnvSetForm({ environments }: { environments: EnvironmentSummary[] })`.
- The "Will create" preview maps `environments` instead of `ENVIRONMENTS`:
```tsx
            {environments.map((env) => (
              <div key={env.key} className="flex flex-wrap gap-x-2">
                <span className="text-muted-foreground">{env.name}:</span>
                <span>{deriveDatabaseName(appName, env.abbreviation)}</span>
                <span className="text-muted-foreground">/</span>
                <span>{deriveUsername(appName, env.abbreviation)}</span>
              </div>
            ))}
```
- The results panel: when mapping `res.results` to `ProvisionResultItem[]`, map each result's `environment` (a key string from the action) to `{ key, name, color }` using `environments`. Add `const envByKey = new Map(environments.map((e) => [e.key, e]));` and set `environment: { key: r.environment, name: envByKey.get(r.environment)?.name ?? r.environment, color: envByKey.get(r.environment)?.color ?? "slate" }` for each item before passing to `ProvisionResultPanel`.
- Update the helper-text copy "creates production, staging, and development databases" to "creates a database and user in every environment."

- [ ] **Step 8: Update provisioning actions to iterate the live list + validate keys**

In `src/app/actions/provision.ts`:
- Add `import { environmentsService } from "@/services/environments";`.
- In `createDatabaseAction`, after validating, verify the environment exists: `if (!(await environmentsService.get(data.environment))) return { ok: false, error: "Unknown environment." };`
- In `createEnvSetAction`, replace the `for (const environment of ENVIRONMENTS)` loop with the live list, using each env's abbreviation for names:
```ts
  const environments = await environmentsService.list();
  for (const env of environments) {
    const environment = env.key;
    const databaseName = deriveDatabaseName(applicationName, env.abbreviation);
    const username = deriveUsername(applicationName, env.abbreviation);
    // … unchanged provision + record + results.push …
  }
```
  (Remove the now-unused `ENVIRONMENTS` import if nothing else uses it here.)

- [ ] **Step 9: Verify build + tests**

Run: `npm test && npm run build`
Expected: green. The create dropdown lists live environments; "full set" creates across all of them with correct suffixes.

- [ ] **Step 10: Commit**

```bash
git add src/lib/naming.ts src/lib/naming.test.ts src/app/create/page.tsx src/components/create/create-database-form.tsx src/components/create/create-env-set-form.tsx src/app/actions/provision.ts
git commit -m "feat: create flows use the live environment list and abbreviations"
```

---

## Task 9: SQL console uses per-environment flags

**Files:**
- Modify: `src/lib/query-policy.ts`
- Modify: `src/app/actions/query.ts`
- Modify: `src/app/query/page.tsx`
- Modify: `src/components/query/query-console.tsx`

- [ ] **Step 1: Make the policy take per-environment flags (write failing test first)**

Create `src/lib/query-policy.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { evaluatePolicy } from "./query-policy";

describe("evaluatePolicy", () => {
  it("allows reads with no confirmation", () => {
    expect(evaluatePolicy({ category: "read", readOnly: true, requireWriteConfirm: true }))
      .toEqual({ allowed: true, requiresConfirmation: false });
  });
  it("blocks writes on a read-only environment", () => {
    const d = evaluatePolicy({ category: "write", readOnly: true, requireWriteConfirm: true });
    expect(d.allowed).toBe(false);
  });
  it("requires confirmation for writes when the flag is set", () => {
    expect(evaluatePolicy({ category: "write", readOnly: false, requireWriteConfirm: true }))
      .toEqual({ allowed: true, requiresConfirmation: true });
  });
  it("allows writes without confirmation when the flag is off", () => {
    expect(evaluatePolicy({ category: "write", readOnly: false, requireWriteConfirm: false }))
      .toEqual({ allowed: true, requiresConfirmation: false });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- query-policy.test`
Expected: FAIL — `evaluatePolicy` still takes `{ environment, category, prodWritesDisabled }`.

- [ ] **Step 3: Rewrite `src/lib/query-policy.ts`**

```ts
/**
 * Per-environment execution policy for the SQL Console.
 *
 * Pure function so the client can preview the decision (show/skip the confirm
 * modal) and the server can enforce the identical rule authoritatively.
 *
 *   - Reads run immediately, every environment.
 *   - Writes are blocked when the environment is read-only.
 *   - Otherwise writes require typed "CONFIRM" when the environment's
 *     requireWriteConfirm flag is set.
 */
import type { QueryCategory } from "./sql-classify";

export interface PolicyDecision {
  allowed: boolean;
  requiresConfirmation: boolean;
  reason?: string;
}

export function evaluatePolicy(params: {
  category: QueryCategory;
  readOnly: boolean;
  requireWriteConfirm: boolean;
}): PolicyDecision {
  const { category, readOnly, requireWriteConfirm } = params;

  if (category === "read") {
    return { allowed: true, requiresConfirmation: false };
  }
  if (readOnly) {
    return {
      allowed: false,
      requiresConfirmation: false,
      reason: "Write operations are disabled on this environment (it is marked read-only).",
    };
  }
  return { allowed: true, requiresConfirmation: requireWriteConfirm };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- query-policy.test`
Expected: PASS.

- [ ] **Step 5: Update the execute action to load the environment's flags**

In `src/app/actions/query.ts`:
- Replace `import { isEnvironment, isProdWritesDisabled, type Environment } from "@/lib/targets";` with `import { type Environment } from "@/lib/targets";` and `import { environmentsService } from "@/services/environments";`.
- Replace the `asEnv` helper with an async lookup:
```ts
async function requireEnv(value: unknown): Promise<{ key: Environment; readOnly: boolean; requireWriteConfirm: boolean }> {
  if (typeof value !== "string") throw new QueryError("Unknown environment.", "BAD_ENV");
  const env = await environmentsService.get(value);
  if (!env) throw new QueryError("Unknown environment.", "BAD_ENV");
  return { key: env.key, readOnly: env.readOnly, requireWriteConfirm: env.requireWriteConfirm };
}
```
- In `executeQueryAction`, replace the `env = asEnv(...)` + `evaluatePolicy({...})` block with:
```ts
  let env: { key: Environment; readOnly: boolean; requireWriteConfirm: boolean };
  try {
    env = await requireEnv(input.environment);
    assertSafeIdentifier(input.database);
  } catch (err) {
    return { ok: false, error: msg(err) };
  }
  const query = (input.query ?? "").trim();
  if (!query) return { ok: false, error: "Query is empty." };
  const classification = classifyQuery(query);
  const decision = evaluatePolicy({
    category: classification.category,
    readOnly: env.readOnly,
    requireWriteConfirm: env.requireWriteConfirm,
  });
```
  Then replace every later use of `env` as the environment key with `env.key` (the `historyService.record({ environment: env, … })` calls become `environment: env.key`, and `postgresQueryEngine.execute(env, …)` becomes `postgresQueryEngine.execute(env.key, …)`).
- For the other actions (`listDatabasesAction`, `explainQueryAction`, `adminOverviewAction`, `adminStorageAction`, `adminPerformanceAction`), replace `asEnv(environment)` with `(await requireEnv(environment)).key`.

- [ ] **Step 6: Pass per-environment flags to the console**

In `src/app/query/page.tsx`:
- Replace `import { getAllTargetInfo, isProdWritesDisabled, type Environment } from "@/lib/targets";` with `import { getAllTargetInfo, type Environment } from "@/lib/targets";` and add `import { environmentsService } from "@/services/environments"; import { toSummary } from "@/lib/environments";`.
- After building `configured`, add `const environments = (await environmentsService.list()).map(toSummary);`.
- Change `<QueryConsole … prodWritesDisabled={isProdWritesDisabled()} … />` to `<QueryConsole … environments={environments} … />` (drop `prodWritesDisabled`).

- [ ] **Step 7: Update `QueryConsole`**

In `src/components/query/query-console.tsx`:
- Replace `import { ENVIRONMENT_LABELS, ENVIRONMENTS, type Environment } from "@/lib/environments";` with `import type { Environment, EnvironmentSummary } from "@/lib/environments";`.
- Props: replace `prodWritesDisabled: boolean;` with `environments: EnvironmentSummary[];` and destructure it.
- `firstConfigured`: `const firstConfigured = environments.find((e) => configured[e.key])?.key ?? environments[0]?.key ?? "";`
- `const selectedEnv = environments.find((e) => e.key === environment);`
- The policy call becomes:
```ts
  const policy = evaluatePolicy({
    category: classification.category,
    readOnly: selectedEnv?.readOnly ?? false,
    requireWriteConfirm: selectedEnv?.requireWriteConfirm ?? true,
  });
```
- The environment `<Select>` options map `environments` (key/name) instead of `ENVIRONMENTS`/`ENVIRONMENT_LABELS`:
```tsx
            {environments.map((env) => (
              <SelectItem key={env.key} value={env.key} disabled={!configured[env.key]}>
                {env.name}
                {!configured[env.key] ? " — not configured" : ""}
              </SelectItem>
            ))}
```
- Replace the `environment === "PRODUCTION" && prodWritesDisabled` read-only badge with `selectedEnv?.readOnly ? <Badge variant="warning" className="mb-1.5">{selectedEnv.name} is read-only</Badge> : null`.
- The `<ConfirmDialog … environment={…}>` shim from Task 3 becomes `environment={selectedEnv ?? { key: environment, name: environment, color: "slate" }}`.

- [ ] **Step 8: Verify build + tests**

Run: `npm test && npm run build`
Expected: green. Marking an environment read-only in Settings blocks writes there; toggling "require confirmation" off skips the modal.

- [ ] **Step 9: Commit**

```bash
git add src/lib/query-policy.ts src/lib/query-policy.test.ts src/app/actions/query.ts src/app/query/page.tsx src/components/query/query-console.tsx
git commit -m "feat: SQL console honors per-environment read-only and write-confirm flags"
```

---

## Task 10: Remove legacy environment scaffolding + final verification

**Files:**
- Modify: `src/lib/environments.ts`
- Modify: `src/lib/targets.ts`
- Modify: `src/app/actions/query.ts`, `src/lib/query-policy.ts` (confirm no leftover references)
- Modify: `.env.example`, `README.md`

- [ ] **Step 1: Confirm there are no remaining consumers of the legacy constants**

Run: `grep -rn "ENVIRONMENTS\b\|ENVIRONMENT_LABELS\|isEnvironment\|isProdWritesDisabled\|POSTGRES_PROD_READONLY" src`
Expected: the only hits should be the declarations themselves in `src/lib/environments.ts` and `src/lib/targets.ts` (plus the legacy fallback map in `targets.ts`). If any other file still references them, fix that file first (it indicates a missed edit in Tasks 6–9).

- [ ] **Step 2: Remove the legacy constants from `src/lib/environments.ts`**

Delete `ENVIRONMENTS`, `ENVIRONMENT_LABELS`, and `isEnvironment`. Keep `Environment`, `EnvironmentSummary`, and `toSummary`. The top of the file becomes:

```ts
/**
 * Client-safe environment types. The live list comes from `environmentsService`
 * (server) and is passed to client components as `EnvironmentSummary[]`.
 */
import type { Environment as EnvironmentRow } from "@prisma/client";

export type Environment = string;

export interface EnvironmentSummary { /* …unchanged… */ }
export function toSummary(row: EnvironmentRow): EnvironmentSummary { /* …unchanged… */ }
```

- [ ] **Step 3: Remove `isProdWritesDisabled` from `src/lib/targets.ts`**

Delete the `isProdWritesDisabled()` function (its last consumer was removed in Task 9).

- [ ] **Step 4: Update `.env.example` and README**

In `.env.example`, remove the `POSTGRES_PROD_READONLY` block and replace the `POSTGRES_*_URL` section note with a line stating they are an optional legacy fallback — connection strings and read-only behavior are now configured per environment on the Settings page. In `README.md`, update any mention of fixed Production/Staging/Development or `POSTGRES_PROD_READONLY` to describe user-defined environments.

- [ ] **Step 5: Full verification**

Run: `npm test && npm run lint && npm run build`
Expected: all tests pass, lint clean, build succeeds.

Then `npm run dev` and confirm end-to-end:
- Settings → Environments: add a new environment (e.g. "QA", color blue, abbreviation `qa`); it appears, gets a Postgres card, and shows on the dashboard and in the create/query dropdowns.
- Mark an environment read-only → SQL writes are blocked there.
- Try to delete an in-use environment → blocked with the friendly message; delete an unused one → succeeds.
- Existing Production/Staging/Development data, registry rows, and saved Postgres connections are intact.

- [ ] **Step 6: Commit**

```bash
git add src/lib/environments.ts src/lib/targets.ts .env.example README.md
git commit -m "chore: remove legacy environment enum scaffolding and POSTGRES_PROD_READONLY"
```

---

## Self-Review

**Spec coverage:**
- User-defined environments with name/description/color/ordering/flags → Tasks 1 (model), 2 (service), 4 (validation/actions), 5 (UI). ✓
- Curated color palette → Task 3. ✓
- Block deletion while in use (DB-enforced) → Task 1 (FK Restrict) + Task 2 (`remove()` P2003 message) + Task 5 (UI). ✓
- Per-environment read-only + write-confirm → Tasks 1 (columns), 9 (policy/console). ✓
- Seed the existing three; preserve data → Task 1 migration. ✓
- Everything references the dynamic list (Postgres targets, registry/dashboard, create flows, SQL console, badges) → Tasks 3, 6, 7, 8, 9. ✓
- `POSTGRES_PROD_READONLY` retired → Task 10. ✓
- Coolify untouched → not modified in any task. ✓
- Abbreviation for db-name derivation → Tasks 1 (column/seed), 8 (naming). ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code; interim shims in Task 3 are explicitly defined and replaced in Tasks 7–9.

**Type consistency:** `EnvironmentSummary` shape is identical across `environments.ts`, the badge, settings section, create forms, and query console. `evaluatePolicy` signature `{ category, readOnly, requireWriteConfirm }` matches between `query-policy.ts`, its test, the query action, and the console. `POSTGRES_SETTING_KEYS` is a function `(env) => string` consistently in `targets.ts` and `provision.ts` (Task 6). `deriveDatabaseName/deriveUsername(appName, abbreviation)` signature matches across naming, create forms, and the env-set action. `registryService.stats().byEnvironment` is `Record<string, number>` in the service, its test, and the dashboard.

**Green-at-each-step:** Task 1 widens the type while keeping legacy constants so all consumers still compile; Tasks 3 adds interim shims; Tasks 6–9 replace them; Task 10 removes the legacy constants only after the last consumer is migrated.
