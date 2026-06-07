# Aspyre Infrastructure Manager — Foundation + Coolify Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve the existing "DB Provisioner" app into "Aspyre Infrastructure Manager" (package `aspyre-devops`) by introducing a module system, encrypted in-app secrets storage, and a working Coolify integration module — without changing any existing DB provisioning, registry, or SQL console behavior.

**Architecture:** The existing app is Next.js 15 (App Router) + React 19 + TypeScript, layered UI → Server Actions → Services → lib → Prisma (Postgres metadata DB). This plan adds three things on top of that, reusing every existing pattern: (1) a **module registry** (`src/lib/modules.ts`) that the sidebar and a dashboard "modules" hub both read from, so features are declared as modules; (2) a **settings service** over the already-existing-but-unused encrypted `Setting` table + `src/lib/crypto.ts`, used to store API tokens; (3) a **Coolify module** (config resolver → typed HTTP client → service → server actions → pages) that mirrors the existing provisioning module's shape exactly. Existing routes (`/dashboard`, `/create`, `/registry`, `/query`, `/settings`) are preserved.

**Tech Stack:** Next.js 15, React 19, TypeScript 5.7 (strict), Prisma 6 (Postgres), TailwindCSS + shadcn/ui, Zod, Lucide icons, `pg`. **New:** Vitest (test runner — none exists today) and the native `fetch` API (first external HTTP client in the app).

**Testing approach:** Per decision, we set up **Vitest + TDD**. All non-React logic (brand constants, module registry, settings service, Coolify config/client/service, validation schemas) is built test-first with real failing tests. React pages/components and server actions that touch the live DB or live Coolify are verified **manually** (run the dev server, check the page) because component/RSC/integration testing infra is out of scope for this plan. Each UI task says exactly what to click and what to expect.

**Branding decision (used throughout):**
- Package name: `aspyre-devops`
- Display name (`APP_NAME`): `Aspyre Infrastructure Manager`
- Short/sidebar name (`APP_SHORT_NAME`): `Aspyre DevOps`
- Tagline (`APP_TAGLINE`): `Centralized infrastructure administration`
- Version (`APP_VERSION`): `2.0`

These live in one place (`src/lib/brand.ts`, Task 2) so they are never hardcoded twice.

---

## Pre-flight note for Part B (Coolify API)

This plan targets the **Coolify v4 REST API**: base URL `<COOLIFY_BASE_URL>/api/v1`, bearer-token auth. The exact endpoint paths and create-application payload differ slightly between Coolify versions. To keep this adjustable in one place, all paths live in a single `COOLIFY_ENDPOINTS`/inline-path layer inside `src/services/coolify/service.ts`, and **every Coolify test mocks the HTTP layer** — so the tests never depend on the real API and the paths can be corrected against your running Coolify instance without touching test logic. After Task 11 (Settings UI) you can hit "Test connection" against the real server to confirm the paths before relying on the list/create pages. If your Coolify build differs, adjust paths in `service.ts` only.

---

## File Structure

**Created:**
- `vitest.config.ts` — test runner config (alias `@`, stub `server-only`)
- `test/stubs/empty.ts` — empty-module stub for `server-only`/`client-only`
- `src/lib/brand.ts` — single source of truth for app name/version strings
- `src/lib/brand.test.ts`
- `src/lib/modules.ts` — module registry (sidebar + dashboard hub read this)
- `src/lib/modules.test.ts`
- `src/services/settings.ts` — encrypted key/value store over the `Setting` table
- `src/services/settings.test.ts`
- `src/lib/coolify-config.ts` — resolves Coolify base URL + token (settings → env fallback)
- `src/lib/coolify-config.test.ts`
- `src/services/coolify/types.ts` — Coolify domain types + `CoolifyError`
- `src/services/coolify/client.ts` — `coolifyFetch` HTTP wrapper
- `src/services/coolify/client.test.ts`
- `src/services/coolify/service.ts` — `coolifyService` (list/get/create/update/deploy/envs/projects/servers)
- `src/services/coolify/service.test.ts`
- `src/app/actions/coolify.ts` — server actions wrapping the service
- `src/lib/coolify-validation.ts` — Zod schemas for Coolify inputs
- `src/lib/coolify-validation.test.ts`
- `src/components/settings/coolify-settings-form.tsx` — connect/save token UI
- `src/app/coolify/page.tsx` — applications list
- `src/app/coolify/new/page.tsx` — create application form (server component shell)
- `src/components/coolify/create-application-form.tsx` — create form (client)
- `src/app/coolify/[uuid]/page.tsx` — application detail
- `src/components/coolify/deploy-button.tsx`
- `src/components/coolify/env-vars-editor.tsx`
- `src/components/coolify/application-settings-form.tsx`

**Modified:**
- `package.json` — name + Vitest scripts/dep
- `src/app/layout.tsx` — metadata from brand constants
- `src/components/main-nav.tsx` — sidebar/mobile nav driven by module registry
- `src/app/dashboard/page.tsx` — add "Modules" hub grid; description from brand
- `src/app/settings/page.tsx` — add Coolify connection card
- `.env.example` — header rename + Coolify vars
- `README.md` — title/intro rename

---

# PART A — Foundation (rebrand + module system + secrets)

### Task 1: Vitest test infrastructure

**Files:**
- Create: `vitest.config.ts`
- Create: `test/stubs/empty.ts`
- Modify: `package.json` (scripts + devDependency)
- Create: `src/lib/__sanity__.test.ts` (temporary, deleted at end of task)

- [ ] **Step 1: Install Vitest**

Run:
```bash
npm install -D vitest@^2.1.8
```
Expected: `package.json` devDependencies now include `vitest`.

- [ ] **Step 2: Create the `server-only` stub**

`server-only` (and `client-only`) throw when bundled for the wrong environment; under Vitest's node environment we alias them to an empty module so server modules import cleanly in tests.

Create `test/stubs/empty.ts`:
```ts
// Empty module used to stub `server-only` / `client-only` under Vitest.
export {};
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./test/stubs/empty.ts", import.meta.url)),
      "client-only": fileURLToPath(new URL("./test/stubs/empty.ts", import.meta.url)),
    },
  },
});
```

- [ ] **Step 4: Add test scripts to `package.json`**

In the `"scripts"` block, add:
```json
    "test": "vitest run",
    "test:watch": "vitest"
```
(Place them after the existing `"lint"` line; keep all other scripts unchanged.)

- [ ] **Step 5: Write a sanity test to prove the runner works**

Create `src/lib/__sanity__.test.ts`:
```ts
import { describe, it, expect } from "vitest";

describe("vitest", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Run the sanity test**

Run: `npm test`
Expected: PASS — 1 test passed.

- [ ] **Step 7: Delete the sanity test**

Run: `rm src/lib/__sanity__.test.ts`

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.config.ts test/stubs/empty.ts
git commit -m "chore: add Vitest test infrastructure"
```

---

### Task 2: Brand constants + rebrand

**Files:**
- Create: `src/lib/brand.ts`
- Test: `src/lib/brand.test.ts`
- Modify: `package.json`, `src/app/layout.tsx`, `src/app/dashboard/page.tsx`, `.env.example`, `README.md`

- [ ] **Step 1: Write the failing test**

Create `src/lib/brand.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { BRAND } from "./brand";

describe("BRAND", () => {
  it("exposes the Aspyre Infrastructure Manager identity", () => {
    expect(BRAND.appName).toBe("Aspyre Infrastructure Manager");
    expect(BRAND.shortName).toBe("Aspyre DevOps");
    expect(BRAND.tagline).toBe("Centralized infrastructure administration");
    expect(BRAND.version).toBe("2.0");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- brand`
Expected: FAIL — cannot find module `./brand`.

- [ ] **Step 3: Create `src/lib/brand.ts`**

```ts
/**
 * Single source of truth for the application's display identity. Imported by the
 * layout metadata, sidebar, and dashboard so the name/version live in one place.
 */
export const BRAND = {
  appName: "Aspyre Infrastructure Manager",
  shortName: "Aspyre DevOps",
  tagline: "Centralized infrastructure administration",
  version: "2.0",
} as const;
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- brand`
Expected: PASS.

- [ ] **Step 5: Rename the package**

In `package.json`, change:
```json
  "name": "aspyre-devops",
  "version": "2.0.0",
  "description": "Aspyre Labs internal platform for centralized infrastructure administration: database provisioning, SQL console, and Coolify application management.",
```
(Only the `name`, `version`, and `description` fields change.)

- [ ] **Step 6: Update layout metadata to use brand constants**

In `src/app/layout.tsx`, add the import and replace the `metadata` object:
```tsx
import type { Metadata } from "next";
import "./globals.css";

import { BRAND } from "@/lib/brand";
import { MainNav, MobileNav } from "@/components/main-nav";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: `${BRAND.appName} — Aspyre Labs`,
  description: BRAND.tagline,
};
```
(Leave the `RootLayout` function body unchanged.)

- [ ] **Step 7: Update the dashboard description**

In `src/app/dashboard/page.tsx`, the `<PageHeader>` currently reads `description="Provision and track PostgreSQL databases across Aspyre Labs environments."`. Leave the Dashboard title/description as-is for now — it is the Database module's dashboard and that copy is still accurate. (No change in this step; the dashboard hub is added in Task 5.)

- [ ] **Step 8: Update `.env.example` header**

In `.env.example`, replace the first heading block (lines 1–6) with:
```bash
# ─────────────────────────────────────────────────────────────────────────────
# Aspyre Infrastructure Manager — environment configuration
#
# Copy to `.env` and fill in. In Coolify, set these as environment variables on
# the service. NONE of these values are ever shown to end users in the UI.
# ─────────────────────────────────────────────────────────────────────────────
```
(Leave every variable below it unchanged.)

- [ ] **Step 9: Update the README title/intro**

Open `README.md` and replace the top H1 heading and its first introductory paragraph with:
```markdown
# Aspyre Infrastructure Manager

Aspyre Labs' internal platform for centralized infrastructure administration. It began as the DB Provisioner (PostgreSQL database/user/permission provisioning + SQL console) and is evolving into a modular platform that also manages Coolify applications, with Nginx Proxy Manager, Cloudflare, and full deployment automation planned. The original DB provisioning features are unchanged and remain the "Databases" module.
```
(Preserve all remaining README sections.)

- [ ] **Step 10: Verify the app still builds and the test passes**

Run: `npm run lint && npm test`
Expected: lint passes, all tests pass.

- [ ] **Step 11: Commit**

```bash
git add package.json src/lib/brand.ts src/lib/brand.test.ts src/app/layout.tsx .env.example README.md
git commit -m "feat: rebrand to Aspyre Infrastructure Manager with central brand constants"
```

---

### Task 3: Module registry

**Files:**
- Create: `src/lib/modules.ts`
- Test: `src/lib/modules.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/modules.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  MODULES,
  getModule,
  availableModules,
  navItems,
  type AppModule,
} from "./modules";

describe("MODULES", () => {
  it("has unique ids", () => {
    const ids = MODULES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes the existing core modules as available", () => {
    expect(getModule("database")?.status).toBe("available");
    expect(getModule("query")?.status).toBe("available");
  });

  it("lists Coolify as coming-soon until Part B flips it", () => {
    expect(getModule("coolify")?.status).toBe("coming-soon");
  });

  it("includes the planned platform modules", () => {
    for (const id of ["npm", "cloudflare", "deployment", "secrets", "audit"]) {
      expect(getModule(id)).toBeDefined();
    }
  });

  it("availableModules excludes coming-soon modules", () => {
    expect(availableModules().every((m: AppModule) => m.status === "available")).toBe(true);
  });

  it("navItems flattens nav entries of available modules only", () => {
    const hrefs = navItems().map((n) => n.href);
    expect(hrefs).toContain("/dashboard");
    expect(hrefs).toContain("/query");
    expect(hrefs).not.toContain("/coolify"); // coming-soon in Part A
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- modules`
Expected: FAIL — cannot find module `./modules`.

- [ ] **Step 3: Create `src/lib/modules.ts`**

```ts
/**
 * Module registry — the single declaration of every feature "module" in the
 * platform. The sidebar (`main-nav`) and the dashboard hub both render from this
 * list, so adding a module to the UI is a matter of adding an entry here.
 *
 * Client-safe: no server-only imports. Icons are Lucide components.
 */
import {
  Database,
  LayoutDashboard,
  PlusCircle,
  ListChecks,
  TerminalSquare,
  Cloud,
  Network,
  Globe,
  Rocket,
  KeyRound,
  ScrollText,
  type LucideIcon,
} from "lucide-react";

export type ModuleStatus = "available" | "coming-soon";
export type ModuleGroup = "core" | "infrastructure" | "platform";

export interface ModuleNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface AppModule {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  /** Primary landing route for the dashboard hub card. */
  href: string;
  status: ModuleStatus;
  group: ModuleGroup;
  /** Sidebar entries this module contributes (empty for coming-soon modules). */
  nav: ModuleNavItem[];
}

export const MODULES: AppModule[] = [
  {
    id: "database",
    name: "Databases",
    description: "Provision PostgreSQL databases, users, and permissions.",
    icon: Database,
    href: "/dashboard",
    status: "available",
    group: "core",
    nav: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/create", label: "Create", icon: PlusCircle },
      { href: "/registry", label: "Registry", icon: ListChecks },
    ],
  },
  {
    id: "query",
    name: "SQL Console",
    description: "Run, explain, and save SQL across every environment.",
    icon: TerminalSquare,
    href: "/query",
    status: "available",
    group: "core",
    nav: [{ href: "/query", label: "Query", icon: TerminalSquare }],
  },
  {
    id: "coolify",
    name: "Coolify",
    description: "Create, configure, and deploy applications via the Coolify API.",
    icon: Cloud,
    href: "/coolify",
    status: "coming-soon", // flipped to "available" in Part B, Task 14
    group: "infrastructure",
    nav: [], // populated in Task 14
  },
  {
    id: "npm",
    name: "Proxy Hosts",
    description: "Manage Nginx Proxy Manager hosts, SSL, and security.",
    icon: Network,
    href: "/npm",
    status: "coming-soon",
    group: "infrastructure",
    nav: [],
  },
  {
    id: "cloudflare",
    name: "Cloudflare",
    description: "Manage Cloudflare tunnel routes and TLS settings.",
    icon: Globe,
    href: "/cloudflare",
    status: "coming-soon",
    group: "infrastructure",
    nav: [],
  },
  {
    id: "deployment",
    name: "Deployments",
    description: "One-shot wizard that orchestrates all underlying systems.",
    icon: Rocket,
    href: "/deploy",
    status: "coming-soon",
    group: "platform",
    nav: [],
  },
  {
    id: "secrets",
    name: "Secrets",
    description: "Encrypted storage for API tokens and credentials.",
    icon: KeyRound,
    href: "/secrets",
    status: "coming-soon",
    group: "platform",
    nav: [],
  },
  {
    id: "audit",
    name: "Audit Log",
    description: "Track every action taken across the platform.",
    icon: ScrollText,
    href: "/audit",
    status: "coming-soon",
    group: "platform",
    nav: [],
  },
];

export function getModule(id: string): AppModule | undefined {
  return MODULES.find((m) => m.id === id);
}

export function availableModules(): AppModule[] {
  return MODULES.filter((m) => m.status === "available");
}

/** All sidebar nav entries contributed by available modules, in module order. */
export function navItems(): ModuleNavItem[] {
  return availableModules().flatMap((m) => m.nav);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- modules`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules.ts src/lib/modules.test.ts
git commit -m "feat: add module registry"
```

---

### Task 4: Sidebar + mobile nav driven by the module registry

**Files:**
- Modify: `src/components/main-nav.tsx`

This task is UI — verified manually (no React test infra in scope). It must preserve all existing links (`/dashboard`, `/create`, `/registry`, `/query`) and add the brand + a "coming soon" section.

- [ ] **Step 1: Replace `src/components/main-nav.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings } from "lucide-react";

import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";
import { MODULES, navItems, type ModuleGroup } from "@/lib/modules";

const GROUP_LABELS: Record<ModuleGroup, string> = {
  core: "Core",
  infrastructure: "Infrastructure",
  platform: "Platform",
};
const GROUP_ORDER: ModuleGroup[] = ["core", "infrastructure", "platform"];

function Brand() {
  return (
    <div className="flex flex-col items-start gap-2.5 border-b px-5 py-5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/aspyrelabs-logo.svg"
        alt="Aspyrelabs"
        className="w-full max-w-[200px]"
      />
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-[#7a44b7] to-[#ee2f6d]" />
        <span className="bg-gradient-to-r from-[#7a44b7] to-[#ee2f6d] bg-clip-text text-[13px] font-semibold uppercase tracking-[0.18em] text-transparent">
          {BRAND.shortName}
        </span>
      </div>
    </div>
  );
}

export function MainNav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className="hidden w-60 shrink-0 border-r bg-card md:flex md:flex-col">
      <Brand />
      <nav className="flex-1 space-y-4 overflow-y-auto p-3">
        {GROUP_ORDER.map((group) => {
          const modules = MODULES.filter((m) => m.group === group);
          if (modules.length === 0) return null;
          return (
            <div key={group} className="space-y-1">
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {GROUP_LABELS[group]}
              </p>
              {modules.map((m) => {
                if (m.status === "coming-soon") {
                  const Icon = m.icon;
                  return (
                    <div
                      key={m.id}
                      className="flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground/50"
                    >
                      <span className="flex items-center gap-3">
                        <Icon className="h-4 w-4" />
                        {m.name}
                      </span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] uppercase tracking-wide">
                        Soon
                      </span>
                    </div>
                  );
                }
                return m.nav.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                });
              })}
            </div>
          );
        })}

        {/* App-level settings (not a module). */}
        <div className="space-y-1">
          <Link
            href="/settings"
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isActive("/settings")
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        </div>
      </nav>
      <div className="border-t p-4 text-[11px] text-muted-foreground">
        {BRAND.appName} v{BRAND.version}
      </div>
    </aside>
  );
}

/** Compact horizontal nav shown on small screens — available modules only. */
export function MobileNav() {
  const pathname = usePathname();
  const items = [
    ...navItems(),
    { href: "/settings", label: "Settings", icon: Settings },
  ];
  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b bg-card px-2 py-2 md:hidden">
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify manually**

Run: `npm run dev`
Open http://localhost:3000. Expected:
- Sidebar shows brand "ASPYRE DEVOPS", grouped sections **Core** (Dashboard, Create, Registry, Query), **Infrastructure** (Coolify — greyed with "Soon" badge, Proxy Hosts, Cloudflare), **Platform** (Deployments, Secrets, Audit — all greyed "Soon"), then **Settings**.
- Footer reads "Aspyre Infrastructure Manager v2.0".
- Existing links still navigate correctly; the active link is highlighted.
- On a narrow window, the mobile nav shows Dashboard/Create/Registry/Query/Settings.

- [ ] **Step 3: Verify build types**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/main-nav.tsx
git commit -m "feat: drive sidebar and mobile nav from the module registry"
```

---

### Task 5: Dashboard "Modules" hub

**Files:**
- Modify: `src/app/dashboard/page.tsx`

UI task — manual verification.

- [ ] **Step 1: Add the modules hub to the dashboard**

In `src/app/dashboard/page.tsx`, add these imports at the top (merge with existing imports — keep all current ones):
```tsx
import { MODULES, type AppModule } from "@/lib/modules";
import { BRAND } from "@/lib/brand";
```

Then, immediately after the opening `<div>` and the `<PageHeader ... />` block (before the `<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">` stats grid), insert:
```tsx
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Modules
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((m) => (
            <ModuleCard key={m.id} module={m} />
          ))}
        </div>
      </section>
```

- [ ] **Step 2: Add the `ModuleCard` component at the bottom of the file**

Add after the existing `StatCard` function (same file):
```tsx
function ModuleCard({ module: m }: { module: AppModule }) {
  const Icon = m.icon;
  const available = m.status === "available";
  const inner = (
    <Card
      className={
        available
          ? "h-full transition-colors hover:border-primary/50"
          : "h-full opacity-60"
      }
    >
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">{m.name}</CardTitle>
        </div>
        {available ? null : (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
            Soon
          </span>
        )}
      </CardHeader>
      <CardContent>
        <CardDescription>{m.description}</CardDescription>
      </CardContent>
    </Card>
  );
  return available ? (
    <Link href={m.href} className="block">
      {inner}
    </Link>
  ) : (
    <div>{inner}</div>
  );
}
```
(`Card`, `CardHeader`, `CardTitle`, `CardContent`, `CardDescription`, and `Link` are already imported in this file. `BRAND` import added in Step 1 is reserved for the optional copy tweak below — if unused, remove it to satisfy lint, or use it in the PageHeader description.)

- [ ] **Step 3: (Optional) make the header copy module-aware**

If you imported `BRAND`, you may set the dashboard `PageHeader` description to:
```tsx
        description={`${BRAND.appName}: provision databases and manage infrastructure across Aspyre Labs environments.`}
```
Otherwise remove the `BRAND` import to keep lint clean.

- [ ] **Step 4: Verify manually**

Run: `npm run dev` → open http://localhost:3000/dashboard. Expected:
- A "Modules" grid at the top: **Databases** and **SQL Console** are clickable cards (Databases → `/dashboard`, SQL Console → `/query`); the other six show greyed with a "Soon" badge and are not clickable.
- The existing stats cards, server targets, and "Recently provisioned" table are unchanged below.

- [ ] **Step 5: Verify build types**

Run: `npm run lint`
Expected: no errors (resolve any unused-import warning per Step 3).

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat: add modules hub to dashboard"
```

---

### Task 6: Encrypted settings service

**Files:**
- Create: `src/services/settings.ts`
- Test: `src/services/settings.test.ts`

Reuses the existing `Setting` Prisma model and `src/lib/crypto.ts`. Tests mock Prisma and crypto so no DB or `ENCRYPTION_KEY` is needed.

- [ ] **Step 1: Write the failing test**

Create `src/services/settings.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Prisma singleton.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    setting: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

// Mock crypto so we assert wiring without a real key.
vi.mock("@/lib/crypto", () => ({
  encrypt: vi.fn((v: string) => `enc(${v})`),
  decrypt: vi.fn((v: string) => v.replace(/^enc\(/, "").replace(/\)$/, "")),
}));

import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/crypto";
import { settingsService } from "./settings";

const settingMock = prisma.setting as unknown as {
  upsert: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("settingsService", () => {
  it("encrypts on set and upserts by key", async () => {
    settingMock.upsert.mockResolvedValue({});
    await settingsService.set("coolify.apiToken", "secret-123");
    expect(encrypt).toHaveBeenCalledWith("secret-123");
    expect(settingMock.upsert).toHaveBeenCalledWith({
      where: { key: "coolify.apiToken" },
      create: { key: "coolify.apiToken", encryptedValue: "enc(secret-123)" },
      update: { encryptedValue: "enc(secret-123)" },
    });
  });

  it("decrypts on get", async () => {
    settingMock.findUnique.mockResolvedValue({
      key: "coolify.apiToken",
      encryptedValue: "enc(secret-123)",
    });
    const value = await settingsService.get("coolify.apiToken");
    expect(decrypt).toHaveBeenCalledWith("enc(secret-123)");
    expect(value).toBe("secret-123");
  });

  it("returns null when a key is missing", async () => {
    settingMock.findUnique.mockResolvedValue(null);
    expect(await settingsService.get("missing")).toBeNull();
  });

  it("returns null (not throw) when decryption fails", async () => {
    settingMock.findUnique.mockResolvedValue({
      key: "k",
      encryptedValue: "garbage",
    });
    (decrypt as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error("bad key");
    });
    expect(await settingsService.get("k")).toBeNull();
  });

  it("has() reflects row existence", async () => {
    settingMock.findUnique.mockResolvedValue({ key: "k", encryptedValue: "x" });
    expect(await settingsService.has("k")).toBe(true);
    settingMock.findUnique.mockResolvedValue(null);
    expect(await settingsService.has("k")).toBe(false);
  });

  it("delete removes by key", async () => {
    settingMock.deleteMany.mockResolvedValue({ count: 1 });
    await settingsService.delete("k");
    expect(settingMock.deleteMany).toHaveBeenCalledWith({ where: { key: "k" } });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- settings`
Expected: FAIL — cannot find module `./settings`.

- [ ] **Step 3: Create `src/services/settings.ts`**

```ts
import "server-only";
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/crypto";

/**
 * Encrypted key/value settings store over the `Setting` table. Values are
 * encrypted at rest with AES-256-GCM (`src/lib/crypto.ts`). Used to hold
 * external API credentials (Coolify token, future NPM/Cloudflare tokens).
 *
 * Keys are namespaced by convention, e.g. "coolify.apiToken".
 */
export const settingsService = {
  /** Upsert an encrypted value by key. */
  async set(key: string, value: string): Promise<void> {
    const encryptedValue = encrypt(value);
    await prisma.setting.upsert({
      where: { key },
      create: { key, encryptedValue },
      update: { encryptedValue },
    });
  },

  /** Return the decrypted value, or null if missing or undecryptable. */
  async get(key: string): Promise<string | null> {
    const row = await prisma.setting.findUnique({ where: { key } });
    if (!row) return null;
    try {
      return decrypt(row.encryptedValue);
    } catch {
      // Stale value encrypted under a rotated/absent key — treat as unset.
      return null;
    }
  },

  /** Whether a value exists for the key (without decrypting). */
  async has(key: string): Promise<boolean> {
    const row = await prisma.setting.findUnique({ where: { key } });
    return Boolean(row);
  },

  /** Remove a key. No-op if absent. */
  async delete(key: string): Promise<void> {
    await prisma.setting.deleteMany({ where: { key } });
  },
};
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- settings`
Expected: PASS — all 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/services/settings.ts src/services/settings.test.ts
git commit -m "feat: add encrypted settings service over Setting table"
```

---

# PART B — Coolify integration module

### Task 7: Coolify config resolver + types

**Files:**
- Create: `src/services/coolify/types.ts`
- Create: `src/lib/coolify-config.ts`
- Test: `src/lib/coolify-config.test.ts`

- [ ] **Step 1: Create `src/services/coolify/types.ts`**

```ts
/**
 * Coolify domain types and error class. Mirrors the provisioning module's
 * `ProvisioningError` pattern: a typed error carrying a stable code and a
 * user-presentable, credential-free message.
 */

export class CoolifyError extends Error {
  constructor(
    message: string,
    public readonly code: string = "COOLIFY_ERROR",
  ) {
    super(message);
    this.name = "CoolifyError";
  }
}

export interface CoolifyApplication {
  uuid: string;
  name: string;
  /** Coolify lifecycle status string, e.g. "running:healthy". */
  status?: string;
  fqdn?: string | null;
  git_repository?: string | null;
  git_branch?: string | null;
  build_pack?: string | null;
  description?: string | null;
}

export interface CoolifyEnvVar {
  uuid?: string;
  key: string;
  value: string;
  is_build_time?: boolean;
}

export interface CoolifyProject {
  uuid: string;
  name: string;
}

export interface CoolifyServer {
  uuid: string;
  name: string;
}

export interface CreateApplicationRequest {
  project_uuid: string;
  server_uuid: string;
  environment_name: string;
  git_repository: string;
  git_branch: string;
  build_pack: string; // e.g. "nixpacks" | "dockerfile" | "static"
  ports_exposes: string; // e.g. "3000"
  name?: string;
  domains?: string;
}

export interface UpdateApplicationRequest {
  domains?: string;
  build_command?: string;
  start_command?: string;
  name?: string;
  description?: string;
}

export interface CoolifyConnectionResult {
  ok: boolean;
  message: string;
  version?: string;
}
```

- [ ] **Step 2: Write the failing test for the config resolver**

Create `src/lib/coolify-config.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/settings", () => ({
  settingsService: { get: vi.fn() },
}));

import { settingsService } from "@/services/settings";
import {
  getCoolifyConfig,
  isCoolifyConfigured,
  COOLIFY_SETTING_KEYS,
} from "./coolify-config";

const get = settingsService.get as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.COOLIFY_BASE_URL;
  delete process.env.COOLIFY_API_TOKEN;
});

describe("getCoolifyConfig", () => {
  it("returns config from settings and strips trailing slashes", async () => {
    get.mockImplementation(async (key: string) =>
      key === COOLIFY_SETTING_KEYS.baseUrl
        ? "https://coolify.example.com/"
        : "tok_abc",
    );
    expect(await getCoolifyConfig()).toEqual({
      baseUrl: "https://coolify.example.com",
      apiToken: "tok_abc",
    });
  });

  it("falls back to env vars when settings are empty", async () => {
    get.mockResolvedValue(null);
    process.env.COOLIFY_BASE_URL = "https://cf.local";
    process.env.COOLIFY_API_TOKEN = "envtok";
    expect(await getCoolifyConfig()).toEqual({
      baseUrl: "https://cf.local",
      apiToken: "envtok",
    });
  });

  it("returns null when either value is missing", async () => {
    get.mockResolvedValue(null);
    process.env.COOLIFY_BASE_URL = "https://cf.local";
    // no token anywhere
    expect(await getCoolifyConfig()).toBeNull();
    expect(await isCoolifyConfigured()).toBe(false);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test -- coolify-config`
Expected: FAIL — cannot find module `./coolify-config`.

- [ ] **Step 4: Create `src/lib/coolify-config.ts`**

```ts
import "server-only";
import { settingsService } from "@/services/settings";

export interface CoolifyConfig {
  baseUrl: string;
  apiToken: string;
}

export const COOLIFY_SETTING_KEYS = {
  baseUrl: "coolify.baseUrl",
  apiToken: "coolify.apiToken",
} as const;

/**
 * Resolve Coolify credentials: encrypted settings first, then env-var fallback
 * (COOLIFY_BASE_URL / COOLIFY_API_TOKEN). Returns null unless BOTH are present.
 * Server-only — never returns the token to the client.
 */
export async function getCoolifyConfig(): Promise<CoolifyConfig | null> {
  const baseUrlRaw =
    (await settingsService.get(COOLIFY_SETTING_KEYS.baseUrl)) ??
    process.env.COOLIFY_BASE_URL ??
    null;
  const apiToken =
    (await settingsService.get(COOLIFY_SETTING_KEYS.apiToken)) ??
    process.env.COOLIFY_API_TOKEN ??
    null;

  if (!baseUrlRaw || !baseUrlRaw.trim() || !apiToken || !apiToken.trim()) {
    return null;
  }
  return {
    baseUrl: baseUrlRaw.trim().replace(/\/+$/, ""),
    apiToken: apiToken.trim(),
  };
}

export async function isCoolifyConfigured(): Promise<boolean> {
  return (await getCoolifyConfig()) !== null;
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npm test -- coolify-config`
Expected: PASS.

- [ ] **Step 6: Add env vars to `.env.example`**

Append to `.env.example`:
```bash

# ─────────────────────────────────────────────────────────────────────────────
# Coolify integration (Phase 2). Preferred path is to set these in the in-app
# Settings page (stored AES-256-GCM encrypted, requires ENCRYPTION_KEY). These
# env vars are an optional fallback used only when no in-app value is set.
#   COOLIFY_BASE_URL: root URL of your Coolify instance (no trailing /api/v1)
#   COOLIFY_API_TOKEN: a Coolify API token with application permissions
# ─────────────────────────────────────────────────────────────────────────────
COOLIFY_BASE_URL=""
COOLIFY_API_TOKEN=""
```

- [ ] **Step 7: Commit**

```bash
git add src/services/coolify/types.ts src/lib/coolify-config.ts src/lib/coolify-config.test.ts .env.example
git commit -m "feat: add Coolify config resolver and domain types"
```

---

### Task 8: Coolify HTTP client

**Files:**
- Create: `src/services/coolify/client.ts`
- Test: `src/services/coolify/client.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/services/coolify/client.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/coolify-config", () => ({
  getCoolifyConfig: vi.fn(),
}));

import { getCoolifyConfig } from "@/lib/coolify-config";
import { coolifyFetch } from "./client";
import { CoolifyError } from "./types";

const getConfig = getCoolifyConfig as unknown as ReturnType<typeof vi.fn>;

function mockFetchOnce(init: {
  ok: boolean;
  status: number;
  body?: unknown;
}) {
  const text = init.body === undefined ? "" : JSON.stringify(init.body);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: init.ok,
      status: init.status,
      text: async () => text,
    })),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getConfig.mockResolvedValue({
    baseUrl: "https://coolify.example.com",
    apiToken: "tok_abc",
  });
});

describe("coolifyFetch", () => {
  it("throws NOT_CONFIGURED when no config", async () => {
    getConfig.mockResolvedValue(null);
    await expect(coolifyFetch({ path: "/applications" })).rejects.toMatchObject({
      code: "NOT_CONFIGURED",
    });
  });

  it("calls the v1 URL with bearer auth and parses JSON", async () => {
    mockFetchOnce({ ok: true, status: 200, body: [{ uuid: "a" }] });
    const result = await coolifyFetch<{ uuid: string }[]>({ path: "/applications" });
    expect(result).toEqual([{ uuid: "a" }]);
    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const url = call[0] as URL;
    const opts = call[1] as RequestInit;
    expect(url.toString()).toBe("https://coolify.example.com/api/v1/applications");
    expect((opts.headers as Record<string, string>).Authorization).toBe(
      "Bearer tok_abc",
    );
  });

  it("appends defined query params and skips undefined ones", async () => {
    mockFetchOnce({ ok: true, status: 200, body: {} });
    await coolifyFetch({ path: "/deploy", query: { uuid: "x", force: undefined } });
    const url = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as URL;
    expect(url.searchParams.get("uuid")).toBe("x");
    expect(url.searchParams.has("force")).toBe(false);
  });

  it("maps 401 to an INVALID_TOKEN CoolifyError", async () => {
    mockFetchOnce({ ok: false, status: 401, body: { message: "Unauthorized" } });
    await expect(coolifyFetch({ path: "/applications" })).rejects.toMatchObject({
      code: "INVALID_TOKEN",
    });
  });

  it("maps other non-ok responses to a CoolifyError carrying the status code", async () => {
    mockFetchOnce({ ok: false, status: 404, body: { message: "Not found" } });
    const err = await coolifyFetch({ path: "/applications/zzz" }).catch((e) => e);
    expect(err).toBeInstanceOf(CoolifyError);
    expect(err.code).toBe("HTTP_404");
  });

  it("returns undefined for 204 No Content", async () => {
    mockFetchOnce({ ok: true, status: 204 });
    expect(await coolifyFetch({ path: "/applications/x/envs", method: "POST" })).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- coolify/client`
Expected: FAIL — cannot find module `./client`.

- [ ] **Step 3: Create `src/services/coolify/client.ts`**

```ts
import "server-only";
import { getCoolifyConfig } from "@/lib/coolify-config";
import { CoolifyError } from "./types";

export interface CoolifyRequestOptions {
  path: string; // begins with "/", relative to /api/v1
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

const API_TIMEOUT_MS = 15_000;

function networkError(err: unknown): CoolifyError {
  const e = err as { name?: string; code?: string };
  if (e?.name === "TimeoutError" || e?.code === "ETIMEDOUT") {
    return new CoolifyError("Timed out reaching the Coolify server.", "ETIMEDOUT");
  }
  if (e?.code === "ENOTFOUND") {
    return new CoolifyError("The Coolify hostname could not be resolved.", "ENOTFOUND");
  }
  if (e?.code === "ECONNREFUSED") {
    return new CoolifyError("Could not reach the Coolify server (connection refused).", "ECONNREFUSED");
  }
  return new CoolifyError("Could not reach the Coolify server.", "NETWORK");
}

function httpError(status: number): CoolifyError {
  switch (status) {
    case 401:
      return new CoolifyError("The Coolify API token was rejected.", "INVALID_TOKEN");
    case 403:
      return new CoolifyError("The Coolify API token lacks permission for this action.", "FORBIDDEN");
    case 404:
      return new CoolifyError("The requested Coolify resource was not found.", "HTTP_404");
    case 422:
      return new CoolifyError("Coolify rejected the request as invalid. Check the inputs.", "HTTP_422");
    default:
      return new CoolifyError(`Coolify returned an unexpected error (HTTP ${status}).`, `HTTP_${status}`);
  }
}

/**
 * Single entry point for all Coolify API calls. Adds bearer auth, base URL, a
 * timeout, and normalizes failures into `CoolifyError` (never leaking the token
 * or raw upstream bodies).
 */
export async function coolifyFetch<T>(opts: CoolifyRequestOptions): Promise<T> {
  const config = await getCoolifyConfig();
  if (!config) {
    throw new CoolifyError(
      "Coolify is not configured. Add a base URL and API token in Settings.",
      "NOT_CONFIGURED",
    );
  }

  const url = new URL(`${config.baseUrl}/api/v1${opts.path}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }

  let res: { ok: boolean; status: number; text: () => Promise<string> };
  try {
    res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
  } catch (err) {
    throw networkError(err);
  }

  if (!res.ok) {
    throw httpError(res.status);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- coolify/client`
Expected: PASS — all 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/services/coolify/client.ts src/services/coolify/client.test.ts
git commit -m "feat: add Coolify HTTP client with normalized errors"
```

---

### Task 9: Coolify service

**Files:**
- Create: `src/services/coolify/service.ts`
- Test: `src/services/coolify/service.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/services/coolify/service.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./client", () => ({
  coolifyFetch: vi.fn(),
}));

import { coolifyFetch } from "./client";
import { coolifyService } from "./service";
import { CoolifyError } from "./types";

const fetchMock = coolifyFetch as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("coolifyService", () => {
  it("listApplications GETs /applications", async () => {
    fetchMock.mockResolvedValue([{ uuid: "a", name: "app" }]);
    const apps = await coolifyService.listApplications();
    expect(fetchMock).toHaveBeenCalledWith({ path: "/applications" });
    expect(apps).toEqual([{ uuid: "a", name: "app" }]);
  });

  it("getApplication GETs /applications/:uuid", async () => {
    fetchMock.mockResolvedValue({ uuid: "a", name: "app" });
    await coolifyService.getApplication("a");
    expect(fetchMock).toHaveBeenCalledWith({ path: "/applications/a" });
  });

  it("createApplication POSTs to /applications/public with the body", async () => {
    fetchMock.mockResolvedValue({ uuid: "new" });
    const req = {
      project_uuid: "p",
      server_uuid: "s",
      environment_name: "production",
      git_repository: "https://github.com/x/y",
      git_branch: "main",
      build_pack: "nixpacks",
      ports_exposes: "3000",
    };
    const out = await coolifyService.createApplication(req);
    expect(fetchMock).toHaveBeenCalledWith({
      path: "/applications/public",
      method: "POST",
      body: req,
    });
    expect(out).toEqual({ uuid: "new" });
  });

  it("updateApplication PATCHes /applications/:uuid", async () => {
    fetchMock.mockResolvedValue(undefined);
    await coolifyService.updateApplication("a", { domains: "https://x.com" });
    expect(fetchMock).toHaveBeenCalledWith({
      path: "/applications/a",
      method: "PATCH",
      body: { domains: "https://x.com" },
    });
  });

  it("deploy GETs /deploy with the uuid query param", async () => {
    fetchMock.mockResolvedValue({ message: "queued" });
    await coolifyService.deploy("a");
    expect(fetchMock).toHaveBeenCalledWith({ path: "/deploy", query: { uuid: "a" } });
  });

  it("listEnvVars GETs /applications/:uuid/envs", async () => {
    fetchMock.mockResolvedValue([{ key: "K", value: "V" }]);
    await coolifyService.listEnvVars("a");
    expect(fetchMock).toHaveBeenCalledWith({ path: "/applications/a/envs" });
  });

  it("setEnvVar POSTs key/value to /applications/:uuid/envs", async () => {
    fetchMock.mockResolvedValue(undefined);
    await coolifyService.setEnvVar("a", "K", "V");
    expect(fetchMock).toHaveBeenCalledWith({
      path: "/applications/a/envs",
      method: "POST",
      body: { key: "K", value: "V" },
    });
  });

  it("testConnection returns ok with the version on success", async () => {
    fetchMock.mockResolvedValue("4.0.0");
    const res = await coolifyService.testConnection();
    expect(fetchMock).toHaveBeenCalledWith({ path: "/version" });
    expect(res).toEqual({ ok: true, message: "Connection OK.", version: "4.0.0" });
  });

  it("testConnection returns a friendly failure on CoolifyError", async () => {
    fetchMock.mockRejectedValue(new CoolifyError("The Coolify API token was rejected.", "INVALID_TOKEN"));
    const res = await coolifyService.testConnection();
    expect(res.ok).toBe(false);
    expect(res.message).toBe("The Coolify API token was rejected.");
  });

  it("listProjects and listServers hit their endpoints", async () => {
    fetchMock.mockResolvedValue([]);
    await coolifyService.listProjects();
    expect(fetchMock).toHaveBeenCalledWith({ path: "/projects" });
    await coolifyService.listServers();
    expect(fetchMock).toHaveBeenCalledWith({ path: "/servers" });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- coolify/service`
Expected: FAIL — cannot find module `./service`.

- [ ] **Step 3: Create `src/services/coolify/service.ts`**

```ts
import "server-only";
import { coolifyFetch } from "./client";
import {
  CoolifyError,
  type CoolifyApplication,
  type CoolifyConnectionResult,
  type CoolifyEnvVar,
  type CoolifyProject,
  type CoolifyServer,
  type CreateApplicationRequest,
  type UpdateApplicationRequest,
} from "./types";

/**
 * High-level Coolify operations. All HTTP goes through `coolifyFetch`, so the
 * endpoint paths below are the single place to adjust if your Coolify version
 * differs. Mirrors the provisioning service's "singleton object of async
 * methods" shape.
 */
export const coolifyService = {
  async testConnection(): Promise<CoolifyConnectionResult> {
    try {
      const version = await coolifyFetch<string>({ path: "/version" });
      return {
        ok: true,
        message: "Connection OK.",
        version: typeof version === "string" ? version : undefined,
      };
    } catch (err) {
      const ce = err instanceof CoolifyError ? err : null;
      return {
        ok: false,
        message: ce?.message ?? "Could not reach Coolify.",
      };
    }
  },

  async listApplications(): Promise<CoolifyApplication[]> {
    return coolifyFetch<CoolifyApplication[]>({ path: "/applications" });
  },

  async getApplication(uuid: string): Promise<CoolifyApplication> {
    return coolifyFetch<CoolifyApplication>({ path: `/applications/${uuid}` });
  },

  async createApplication(
    req: CreateApplicationRequest,
  ): Promise<{ uuid: string }> {
    return coolifyFetch<{ uuid: string }>({
      path: "/applications/public",
      method: "POST",
      body: req,
    });
  },

  async updateApplication(
    uuid: string,
    patch: UpdateApplicationRequest,
  ): Promise<void> {
    await coolifyFetch<void>({
      path: `/applications/${uuid}`,
      method: "PATCH",
      body: patch,
    });
  },

  async deploy(uuid: string): Promise<{ message?: string }> {
    return coolifyFetch<{ message?: string }>({
      path: "/deploy",
      query: { uuid },
    });
  },

  async listEnvVars(uuid: string): Promise<CoolifyEnvVar[]> {
    return coolifyFetch<CoolifyEnvVar[]>({ path: `/applications/${uuid}/envs` });
  },

  async setEnvVar(uuid: string, key: string, value: string): Promise<void> {
    await coolifyFetch<void>({
      path: `/applications/${uuid}/envs`,
      method: "POST",
      body: { key, value },
    });
  },

  async listProjects(): Promise<CoolifyProject[]> {
    return coolifyFetch<CoolifyProject[]>({ path: "/projects" });
  },

  async listServers(): Promise<CoolifyServer[]> {
    return coolifyFetch<CoolifyServer[]>({ path: "/servers" });
  },
};
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- coolify/service`
Expected: PASS — all tests.

- [ ] **Step 5: Commit**

```bash
git add src/services/coolify/service.ts src/services/coolify/service.test.ts
git commit -m "feat: add Coolify service layer"
```

---

### Task 10: Coolify validation + server actions

**Files:**
- Create: `src/lib/coolify-validation.ts`
- Test: `src/lib/coolify-validation.test.ts`
- Create: `src/app/actions/coolify.ts`

- [ ] **Step 1: Write the failing validation test**

Create `src/lib/coolify-validation.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  coolifyConfigSchema,
  createApplicationSchema,
  envVarSchema,
} from "./coolify-validation";

describe("coolifyConfigSchema", () => {
  it("accepts an https URL and a token", () => {
    const r = coolifyConfigSchema.safeParse({
      baseUrl: "https://coolify.example.com",
      apiToken: "tok_abc123",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a non-URL base", () => {
    const r = coolifyConfigSchema.safeParse({ baseUrl: "not a url", apiToken: "x" });
    expect(r.success).toBe(false);
  });

  it("rejects an empty token", () => {
    const r = coolifyConfigSchema.safeParse({ baseUrl: "https://x.com", apiToken: "" });
    expect(r.success).toBe(false);
  });
});

describe("createApplicationSchema", () => {
  it("accepts a full create payload", () => {
    const r = createApplicationSchema.safeParse({
      project_uuid: "p",
      server_uuid: "s",
      environment_name: "production",
      git_repository: "https://github.com/x/y",
      git_branch: "main",
      build_pack: "nixpacks",
      ports_exposes: "3000",
      name: "my-app",
    });
    expect(r.success).toBe(true);
  });

  it("rejects an invalid build pack", () => {
    const r = createApplicationSchema.safeParse({
      project_uuid: "p",
      server_uuid: "s",
      environment_name: "production",
      git_repository: "https://github.com/x/y",
      git_branch: "main",
      build_pack: "wizardry",
      ports_exposes: "3000",
    });
    expect(r.success).toBe(false);
  });
});

describe("envVarSchema", () => {
  it("requires a non-empty key", () => {
    expect(envVarSchema.safeParse({ key: "", value: "v" }).success).toBe(false);
    expect(envVarSchema.safeParse({ key: "K", value: "" }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- coolify-validation`
Expected: FAIL — cannot find module `./coolify-validation`.

- [ ] **Step 3: Create `src/lib/coolify-validation.ts`**

```ts
import { z } from "zod";

export const coolifyConfigSchema = z.object({
  baseUrl: z.string().url("Enter a valid URL, e.g. https://coolify.example.com"),
  apiToken: z.string().min(1, "API token is required"),
});
export type CoolifyConfigInput = z.infer<typeof coolifyConfigSchema>;

export const BUILD_PACKS = ["nixpacks", "dockerfile", "static", "dockercompose"] as const;

export const createApplicationSchema = z.object({
  project_uuid: z.string().min(1, "Project is required"),
  server_uuid: z.string().min(1, "Server is required"),
  environment_name: z.string().min(1, "Environment is required"),
  git_repository: z.string().url("Enter a valid repository URL"),
  git_branch: z.string().min(1, "Branch is required"),
  build_pack: z.enum(BUILD_PACKS),
  ports_exposes: z
    .string()
    .regex(/^\d+(,\d+)*$/, "Comma-separated port numbers, e.g. 3000"),
  name: z.string().max(100).optional().or(z.literal("")),
  domains: z.string().max(500).optional().or(z.literal("")),
});
export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;

export const envVarSchema = z.object({
  key: z
    .string()
    .min(1, "Key is required")
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "Use letters, numbers, and underscores; cannot start with a number"),
  value: z.string().max(10_000),
});
export type EnvVarInput = z.infer<typeof envVarSchema>;

export const updateApplicationSchema = z.object({
  domains: z.string().max(500).optional().or(z.literal("")),
  build_command: z.string().max(2000).optional().or(z.literal("")),
  start_command: z.string().max(2000).optional().or(z.literal("")),
});
export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>;
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- coolify-validation`
Expected: PASS.

- [ ] **Step 5: Create `src/app/actions/coolify.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";

import { settingsService } from "@/services/settings";
import { COOLIFY_SETTING_KEYS, isCoolifyConfigured } from "@/lib/coolify-config";
import { coolifyService } from "@/services/coolify/service";
import { CoolifyError } from "@/services/coolify/types";
import type {
  CoolifyApplication,
  CoolifyConnectionResult,
  CoolifyEnvVar,
  CoolifyProject,
  CoolifyServer,
} from "@/services/coolify/types";
import {
  coolifyConfigSchema,
  createApplicationSchema,
  envVarSchema,
  updateApplicationSchema,
} from "@/lib/coolify-validation";

export interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  data?: T;
}

function toMessage(err: unknown): string {
  if (err instanceof CoolifyError) return err.message;
  return "Something went wrong talking to Coolify. Check the server logs.";
}

/** Persist the Coolify base URL + token (encrypted). */
export async function saveCoolifyConfigAction(
  input: unknown,
): Promise<ActionResult> {
  const parsed = coolifyConfigSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  try {
    await settingsService.set(COOLIFY_SETTING_KEYS.baseUrl, parsed.data.baseUrl);
    await settingsService.set(COOLIFY_SETTING_KEYS.apiToken, parsed.data.apiToken);
    revalidatePath("/settings");
    revalidatePath("/coolify");
    return { ok: true };
  } catch (err) {
    console.error("[coolify] save config failed:", err instanceof CoolifyError ? err.code : "unknown");
    return { ok: false, error: "Could not save Coolify settings. Is ENCRYPTION_KEY configured?" };
  }
}

export async function testCoolifyConnectionAction(): Promise<CoolifyConnectionResult> {
  if (!(await isCoolifyConfigured())) {
    return { ok: false, message: "Coolify is not configured yet." };
  }
  return coolifyService.testConnection();
}

export async function getCoolifyApplicationsAction(): Promise<ActionResult<CoolifyApplication[]>> {
  try {
    return { ok: true, data: await coolifyService.listApplications() };
  } catch (err) {
    return { ok: false, error: toMessage(err) };
  }
}

export async function getCoolifyApplicationAction(
  uuid: string,
): Promise<ActionResult<CoolifyApplication>> {
  try {
    return { ok: true, data: await coolifyService.getApplication(uuid) };
  } catch (err) {
    return { ok: false, error: toMessage(err) };
  }
}

export async function getCoolifyFormOptionsAction(): Promise<
  ActionResult<{ projects: CoolifyProject[]; servers: CoolifyServer[] }>
> {
  try {
    const [projects, servers] = await Promise.all([
      coolifyService.listProjects(),
      coolifyService.listServers(),
    ]);
    return { ok: true, data: { projects, servers } };
  } catch (err) {
    return { ok: false, error: toMessage(err) };
  }
}

export async function createCoolifyApplicationAction(
  input: unknown,
): Promise<ActionResult<{ uuid: string }>> {
  const parsed = createApplicationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  try {
    const { name, domains, ...rest } = parsed.data;
    const result = await coolifyService.createApplication({
      ...rest,
      name: name || undefined,
      domains: domains || undefined,
    });
    revalidatePath("/coolify");
    return { ok: true, data: result };
  } catch (err) {
    console.error("[coolify] create failed:", err instanceof CoolifyError ? err.code : "unknown");
    return { ok: false, error: toMessage(err) };
  }
}

export async function deployCoolifyApplicationAction(
  uuid: string,
): Promise<ActionResult<{ message?: string }>> {
  try {
    const res = await coolifyService.deploy(uuid);
    revalidatePath(`/coolify/${uuid}`);
    return { ok: true, data: res };
  } catch (err) {
    return { ok: false, error: toMessage(err) };
  }
}

export async function getCoolifyEnvVarsAction(
  uuid: string,
): Promise<ActionResult<CoolifyEnvVar[]>> {
  try {
    return { ok: true, data: await coolifyService.listEnvVars(uuid) };
  } catch (err) {
    return { ok: false, error: toMessage(err) };
  }
}

export async function setCoolifyEnvVarAction(
  uuid: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = envVarSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  try {
    await coolifyService.setEnvVar(uuid, parsed.data.key, parsed.data.value);
    revalidatePath(`/coolify/${uuid}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toMessage(err) };
  }
}

export async function updateCoolifyApplicationAction(
  uuid: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = updateApplicationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  try {
    const { domains, build_command, start_command } = parsed.data;
    await coolifyService.updateApplication(uuid, {
      domains: domains || undefined,
      build_command: build_command || undefined,
      start_command: start_command || undefined,
    });
    revalidatePath(`/coolify/${uuid}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toMessage(err) };
  }
}
```

- [ ] **Step 6: Verify types compile**

Run: `npm run lint && npm test`
Expected: lint clean; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/coolify-validation.ts src/lib/coolify-validation.test.ts src/app/actions/coolify.ts
git commit -m "feat: add Coolify validation schemas and server actions"
```

---

### Task 11: Settings UI — Coolify connection card

**Files:**
- Create: `src/components/settings/coolify-settings-form.tsx`
- Modify: `src/app/settings/page.tsx`

UI task — manual verification. Mirrors the existing `TestConnectionButton` client-component pattern.

- [ ] **Step 1: Create `src/components/settings/coolify-settings-form.tsx`**

```tsx
"use client";

import * as React from "react";
import { CheckCircle2, Loader2, Plug, Save, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  saveCoolifyConfigAction,
  testCoolifyConnectionAction,
} from "@/app/actions/coolify";
import type { CoolifyConnectionResult } from "@/services/coolify/types";

export function CoolifySettingsForm({ configured }: { configured: boolean }) {
  const [baseUrl, setBaseUrl] = React.useState("");
  const [apiToken, setApiToken] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [test, setTest] = React.useState<CoolifyConnectionResult | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFieldErrors({});
    try {
      const res = await saveCoolifyConfigAction({ baseUrl, apiToken });
      if (res.ok) {
        toast.success("Coolify settings saved.");
        setApiToken("");
      } else {
        setFieldErrors(res.fieldErrors ?? {});
        toast.error(res.error ?? "Could not save.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function onTest() {
    setTesting(true);
    setTest(null);
    try {
      setTest(await testCoolifyConnectionAction());
    } catch {
      setTest({ ok: false, message: "Test failed unexpectedly." });
    } finally {
      setTesting(false);
    }
  }

  return (
    <form onSubmit={onSave} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="coolify-base-url">Base URL</Label>
        <Input
          id="coolify-base-url"
          placeholder="https://coolify.example.com"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
        />
        {fieldErrors.baseUrl ? (
          <p className="text-xs text-destructive">{fieldErrors.baseUrl[0]}</p>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="coolify-token">
          API token{" "}
          {configured ? (
            <span className="text-xs text-muted-foreground">
              (a token is saved — enter a new one to replace it)
            </span>
          ) : null}
        </Label>
        <Input
          id="coolify-token"
          type="password"
          placeholder={configured ? "••••••••" : "Coolify API token"}
          value={apiToken}
          onChange={(e) => setApiToken(e.target.value)}
        />
        {fieldErrors.apiToken ? (
          <p className="text-xs text-destructive">{fieldErrors.apiToken[0]}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          Save
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onTest}
          disabled={testing || !configured}
        >
          {testing ? <Loader2 className="animate-spin" /> : <Plug />}
          Test connection
        </Button>
        {test ? (
          <span
            className={`flex items-center gap-1 text-xs ${
              test.ok ? "text-emerald-600" : "text-destructive"
            }`}
          >
            {test.ok ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <XCircle className="h-3.5 w-3.5" />
            )}
            {test.ok ? `Coolify ${test.version ?? "reachable"}` : test.message}
          </span>
        ) : null}
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Add the Coolify card to the settings page**

In `src/app/settings/page.tsx`, add these imports (merge with existing):
```tsx
import { Cloud } from "lucide-react";
import { CoolifySettingsForm } from "@/components/settings/coolify-settings-form";
import { isCoolifyConfigured } from "@/lib/coolify-config";
import { Badge } from "@/components/ui/badge"; // already imported — keep single import
```

Change the component signature to async and resolve the configured flag:
```tsx
export default async function SettingsPage() {
  const targets = getAllTargetInfo();
  const coolifyConfigured = await isCoolifyConfigured();
```

Then, immediately after the closing `</div>` of the existing `<div className="space-y-4">` server-targets list (just before the final closing `</div>` of the page), insert:
```tsx
      <div className="mt-10">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <Cloud className="h-4 w-4" /> Coolify
        </h2>
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-4">
              <CardTitle className="text-base">Coolify API connection</CardTitle>
              {coolifyConfigured ? (
                <Badge variant="success">Configured</Badge>
              ) : (
                <Badge variant="outline">Not configured</Badge>
              )}
            </div>
            <CardDescription>
              Stored encrypted (AES-256-GCM). Requires ENCRYPTION_KEY to be set.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CoolifySettingsForm configured={coolifyConfigured} />
          </CardContent>
        </Card>
      </div>
```

- [ ] **Step 3: Verify manually**

Ensure `ENCRYPTION_KEY` is set in `.env` (generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`). Run `npm run dev`, open http://localhost:3000/settings. Expected:
- A "Coolify" section with Base URL + API token fields, Save and Test buttons.
- Enter your real Coolify base URL + token, click **Save** → success toast; the badge flips to "Configured" after the page revalidates.
- Click **Test connection** → shows "Coolify <version>" on success, or a friendly error (e.g. "The Coolify API token was rejected.") on failure. **This confirms the API paths from the pre-flight note against your live server.**

- [ ] **Step 4: Verify build types**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/coolify-settings-form.tsx src/app/settings/page.tsx
git commit -m "feat: add Coolify connection settings UI"
```

---

### Task 12: Coolify applications list page

**Files:**
- Create: `src/app/coolify/page.tsx`

UI task — manual verification.

- [ ] **Step 1: Create `src/app/coolify/page.tsx`**

```tsx
import Link from "next/link";
import { Cloud, PlusCircle, ExternalLink } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isCoolifyConfigured } from "@/lib/coolify-config";
import { getCoolifyApplicationsAction } from "@/app/actions/coolify";

export const dynamic = "force-dynamic";

export default async function CoolifyPage() {
  const configured = await isCoolifyConfigured();

  if (!configured) {
    return (
      <div>
        <PageHeader
          title="Coolify"
          description="Create, configure, and deploy applications via Coolify."
        />
        <Card className="border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
          <CardContent className="flex flex-col items-start gap-3 py-6 text-sm">
            <p>Coolify is not connected yet.</p>
            <Button asChild>
              <Link href="/settings">Configure in Settings</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const res = await getCoolifyApplicationsAction();

  return (
    <div>
      <PageHeader
        title="Coolify applications"
        description="Applications managed by your Coolify instance."
        action={
          <Button asChild>
            <Link href="/coolify/new">
              <PlusCircle /> New application
            </Link>
          </Button>
        }
      />

      {!res.ok ? (
        <Card className="border-destructive/40">
          <CardContent className="py-6 text-sm text-destructive">
            {res.error}
          </CardContent>
        </Card>
      ) : res.data && res.data.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {res.data.map((app) => (
            <Link key={app.uuid} href={`/coolify/${app.uuid}`} className="block">
              <Card className="h-full transition-colors hover:border-primary/50">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Cloud className="h-4 w-4 text-muted-foreground" />
                    <CardTitle className="text-base">{app.name}</CardTitle>
                  </div>
                  <CardDescription className="font-mono text-xs">
                    {app.status ?? "unknown"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-1 text-xs text-muted-foreground">
                  {app.fqdn ? (
                    <p className="flex items-center gap-1">
                      <ExternalLink className="h-3 w-3" />
                      {app.fqdn}
                    </p>
                  ) : null}
                  {app.git_repository ? (
                    <p className="truncate font-mono">{app.git_repository}</p>
                  ) : null}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No applications found.{" "}
            <Link href="/coolify/new" className="underline">
              Create the first one.
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify manually**

Run `npm run dev`, open http://localhost:3000/coolify. Expected:
- If Coolify is not configured: an amber card with a "Configure in Settings" button.
- If configured: a grid of application cards (name, status, fqdn, repo) each linking to `/coolify/<uuid>`, plus a "New application" button. If the API errors, a red error card shows the friendly message.

- [ ] **Step 3: Verify build types**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/coolify/page.tsx
git commit -m "feat: add Coolify applications list page"
```

---

### Task 13: Create-application form, application detail page, env vars, deploy, settings

**Files:**
- Create: `src/components/coolify/create-application-form.tsx`
- Create: `src/app/coolify/new/page.tsx`
- Create: `src/components/coolify/deploy-button.tsx`
- Create: `src/components/coolify/env-vars-editor.tsx`
- Create: `src/components/coolify/application-settings-form.tsx`
- Create: `src/app/coolify/[uuid]/page.tsx`

UI task — manual verification. Built in sub-steps; commit once at the end.

- [ ] **Step 1: Create the create-application form**

`src/components/coolify/create-application-form.tsx`:
```tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Rocket } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BUILD_PACKS } from "@/lib/coolify-validation";
import {
  createCoolifyApplicationAction,
  getCoolifyFormOptionsAction,
} from "@/app/actions/coolify";
import type { CoolifyProject, CoolifyServer } from "@/services/coolify/types";

export function CreateApplicationForm() {
  const router = useRouter();
  const [projects, setProjects] = React.useState<CoolifyProject[]>([]);
  const [servers, setServers] = React.useState<CoolifyServer[]>([]);
  const [optionsError, setOptionsError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});

  const [form, setForm] = React.useState({
    name: "",
    project_uuid: "",
    server_uuid: "",
    environment_name: "production",
    git_repository: "",
    git_branch: "main",
    build_pack: "nixpacks",
    ports_exposes: "3000",
    domains: "",
  });

  React.useEffect(() => {
    getCoolifyFormOptionsAction().then((res) => {
      if (res.ok && res.data) {
        setProjects(res.data.projects);
        setServers(res.data.servers);
      } else {
        setOptionsError(res.error ?? "Could not load projects and servers.");
      }
    });
  }, []);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setFieldErrors({});
    try {
      const res = await createCoolifyApplicationAction(form);
      if (res.ok && res.data) {
        toast.success("Application created.");
        router.push(`/coolify/${res.data.uuid}`);
      } else {
        setFieldErrors(res.fieldErrors ?? {});
        toast.error(res.error ?? "Could not create the application.");
      }
    } finally {
      setPending(false);
    }
  }

  function err(field: string) {
    return fieldErrors[field] ? (
      <p className="text-xs text-destructive">{fieldErrors[field][0]}</p>
    ) : null;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {optionsError ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {optionsError}
        </p>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="name">Application name</Label>
        <Input id="name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="my-app" />
        {err("name")}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Project</Label>
          <Select value={form.project_uuid} onValueChange={(v) => set("project_uuid", v)}>
            <SelectTrigger><SelectValue placeholder="Select a project" /></SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.uuid} value={p.uuid}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {err("project_uuid")}
        </div>
        <div className="space-y-1.5">
          <Label>Server</Label>
          <Select value={form.server_uuid} onValueChange={(v) => set("server_uuid", v)}>
            <SelectTrigger><SelectValue placeholder="Select a server" /></SelectTrigger>
            <SelectContent>
              {servers.map((s) => (
                <SelectItem key={s.uuid} value={s.uuid}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {err("server_uuid")}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="env">Environment</Label>
          <Input id="env" value={form.environment_name} onChange={(e) => set("environment_name", e.target.value)} />
          {err("environment_name")}
        </div>
        <div className="space-y-1.5">
          <Label>Build pack</Label>
          <Select value={form.build_pack} onValueChange={(v) => set("build_pack", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {BUILD_PACKS.map((b) => (
                <SelectItem key={b} value={b}>{b}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {err("build_pack")}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="repo">Git repository</Label>
        <Input id="repo" value={form.git_repository} onChange={(e) => set("git_repository", e.target.value)} placeholder="https://github.com/org/repo" />
        {err("git_repository")}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="branch">Branch</Label>
          <Input id="branch" value={form.git_branch} onChange={(e) => set("git_branch", e.target.value)} />
          {err("git_branch")}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ports">Exposed ports</Label>
          <Input id="ports" value={form.ports_exposes} onChange={(e) => set("ports_exposes", e.target.value)} placeholder="3000" />
          {err("ports_exposes")}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="domains">Domain (optional)</Label>
          <Input id="domains" value={form.domains} onChange={(e) => set("domains", e.target.value)} placeholder="https://app.example.com" />
          {err("domains")}
        </div>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Rocket />}
        Create application
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Create the new-application page**

`src/app/coolify/new/page.tsx`:
```tsx
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { isCoolifyConfigured } from "@/lib/coolify-config";
import { CreateApplicationForm } from "@/components/coolify/create-application-form";

export const dynamic = "force-dynamic";

export default async function NewCoolifyApplicationPage() {
  if (!(await isCoolifyConfigured())) {
    redirect("/coolify");
  }
  return (
    <div>
      <PageHeader
        title="New Coolify application"
        description="Create and configure an application without opening Coolify."
      />
      <Card>
        <CardContent className="pt-6">
          <CreateApplicationForm />
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Create the deploy button**

`src/components/coolify/deploy-button.tsx`:
```tsx
"use client";

import * as React from "react";
import { Loader2, Rocket } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { deployCoolifyApplicationAction } from "@/app/actions/coolify";

export function DeployButton({ uuid }: { uuid: string }) {
  const [pending, setPending] = React.useState(false);
  async function onDeploy() {
    setPending(true);
    try {
      const res = await deployCoolifyApplicationAction(uuid);
      if (res.ok) {
        toast.success(res.data?.message ?? "Deployment queued.");
      } else {
        toast.error(res.error ?? "Could not trigger deployment.");
      }
    } finally {
      setPending(false);
    }
  }
  return (
    <Button onClick={onDeploy} disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : <Rocket />}
      Deploy
    </Button>
  );
}
```

- [ ] **Step 4: Create the env-vars editor**

`src/components/coolify/env-vars-editor.tsx`:
```tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { setCoolifyEnvVarAction } from "@/app/actions/coolify";
import type { CoolifyEnvVar } from "@/services/coolify/types";

export function EnvVarsEditor({
  uuid,
  initial,
}: {
  uuid: string;
  initial: CoolifyEnvVar[];
}) {
  const router = useRouter();
  const [key, setKey] = React.useState("");
  const [value, setValue] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setFieldErrors({});
    try {
      const res = await setCoolifyEnvVarAction(uuid, { key, value });
      if (res.ok) {
        toast.success(`Set ${key}.`);
        setKey("");
        setValue("");
        router.refresh();
      } else {
        setFieldErrors(res.fieldErrors ?? {});
        toast.error(res.error ?? "Could not set the variable.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      {initial.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Key</TableHead>
              <TableHead>Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {initial.map((v) => (
              <TableRow key={v.uuid ?? v.key}>
                <TableCell className="font-mono text-xs">{v.key}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {v.is_build_time ? "(build) " : ""}
                  ••••••
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="text-sm text-muted-foreground">No environment variables yet.</p>
      )}

      <form onSubmit={onAdd} className="flex flex-wrap items-start gap-2">
        <div className="space-y-1">
          <Input placeholder="KEY" value={key} onChange={(e) => setKey(e.target.value)} className="font-mono" />
          {fieldErrors.key ? <p className="text-xs text-destructive">{fieldErrors.key[0]}</p> : null}
        </div>
        <div className="flex-1 space-y-1">
          <Input placeholder="value" value={value} onChange={(e) => setValue(e.target.value)} className="font-mono" />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Plus />}
          Add / update
        </Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 5: Create the application settings form**

`src/components/coolify/application-settings-form.tsx`:
```tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateCoolifyApplicationAction } from "@/app/actions/coolify";

export function ApplicationSettingsForm({
  uuid,
  initial,
}: {
  uuid: string;
  initial: { domains: string; build_command: string; start_command: string };
}) {
  const router = useRouter();
  const [form, setForm] = React.useState(initial);
  const [pending, setPending] = React.useState(false);

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      const res = await updateCoolifyApplicationAction(uuid, form);
      if (res.ok) {
        toast.success("Application updated.");
        router.refresh();
      } else {
        toast.error(res.error ?? "Could not update the application.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="domains">Domains</Label>
        <Input id="domains" value={form.domains} onChange={(e) => set("domains", e.target.value)} placeholder="https://app.example.com" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="build">Build command</Label>
        <Input id="build" value={form.build_command} onChange={(e) => set("build_command", e.target.value)} className="font-mono" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="start">Start command</Label>
        <Input id="start" value={form.start_command} onChange={(e) => set("start_command", e.target.value)} className="font-mono" />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Save />}
        Save changes
      </Button>
    </form>
  );
}
```

- [ ] **Step 6: Create the application detail page**

`src/app/coolify/[uuid]/page.tsx`:
```tsx
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getCoolifyApplicationAction,
  getCoolifyEnvVarsAction,
} from "@/app/actions/coolify";
import { DeployButton } from "@/components/coolify/deploy-button";
import { EnvVarsEditor } from "@/components/coolify/env-vars-editor";
import { ApplicationSettingsForm } from "@/components/coolify/application-settings-form";

export const dynamic = "force-dynamic";

export default async function CoolifyApplicationPage({
  params,
}: {
  params: Promise<{ uuid: string }>;
}) {
  const { uuid } = await params;
  const [appRes, envRes] = await Promise.all([
    getCoolifyApplicationAction(uuid),
    getCoolifyEnvVarsAction(uuid),
  ]);

  if (!appRes.ok || !appRes.data) {
    return (
      <div>
        <PageHeader title="Application" description="Coolify application detail." />
        <Card className="border-destructive/40">
          <CardContent className="py-6 text-sm text-destructive">
            {appRes.error ?? "Application not found."}
          </CardContent>
        </Card>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/coolify"><ArrowLeft /> Back to applications</Link>
        </Button>
      </div>
    );
  }

  const app = appRes.data;

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
          <Link href="/coolify"><ArrowLeft /> Applications</Link>
        </Button>
        <PageHeader
          title={app.name}
          description={app.status ?? "unknown"}
          action={<DeployButton uuid={uuid} />}
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Overview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {app.fqdn ? (
            <p className="flex items-center gap-1">
              <ExternalLink className="h-3.5 w-3.5" />
              <a href={app.fqdn} className="underline" target="_blank" rel="noreferrer">{app.fqdn}</a>
            </p>
          ) : null}
          {app.git_repository ? (
            <p className="font-mono text-xs text-muted-foreground">
              {app.git_repository} @ {app.git_branch ?? "—"}
            </p>
          ) : null}
          {app.build_pack ? (
            <p className="text-xs text-muted-foreground">Build pack: {app.build_pack}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Environment variables</CardTitle>
          <CardDescription>Values are write-only here — existing values are masked.</CardDescription>
        </CardHeader>
        <CardContent>
          <EnvVarsEditor uuid={uuid} initial={envRes.ok ? envRes.data ?? [] : []} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Settings</CardTitle>
          <CardDescription>Domains, build command, and start command.</CardDescription>
        </CardHeader>
        <CardContent>
          <ApplicationSettingsForm
            uuid={uuid}
            initial={{
              domains: app.fqdn ?? "",
              build_command: "",
              start_command: "",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 7: Verify manually**

Run `npm run dev` (Coolify connected). Expected:
- `/coolify/new`: form loads projects + servers into the dropdowns; submitting with a real repo creates an app and redirects to its detail page (success toast). Validation errors render inline per field.
- `/coolify/<uuid>`: shows overview, an env-vars table + add form (adding a var shows a success toast and refreshes), a Deploy button (queues a deployment with a toast), and a settings form (saving updates domains/build/start). API failures surface friendly messages, not raw errors.

- [ ] **Step 8: Verify build types**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/components/coolify src/app/coolify/new src/app/coolify/[uuid]
git commit -m "feat: add Coolify create form and application detail page"
```

---

### Task 14: Activate the Coolify module + full verification

**Files:**
- Modify: `src/lib/modules.ts`
- Modify: `src/lib/modules.test.ts`

- [ ] **Step 1: Update the failing test to expect Coolify available**

In `src/lib/modules.test.ts`, replace the two assertions that depend on Coolify being coming-soon:

Replace:
```ts
  it("lists Coolify as coming-soon until Part B flips it", () => {
    expect(getModule("coolify")?.status).toBe("coming-soon");
  });
```
with:
```ts
  it("lists Coolify as an available module", () => {
    expect(getModule("coolify")?.status).toBe("available");
    expect(getModule("coolify")?.nav.map((n) => n.href)).toContain("/coolify");
  });
```

And in the `navItems` test, replace:
```ts
    expect(hrefs).not.toContain("/coolify"); // coming-soon in Part A
```
with:
```ts
    expect(hrefs).toContain("/coolify");
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- modules`
Expected: FAIL — Coolify is still `coming-soon` with empty `nav`.

- [ ] **Step 3: Flip the Coolify module to available**

In `src/lib/modules.ts`, update the `coolify` entry:
```ts
  {
    id: "coolify",
    name: "Coolify",
    description: "Create, configure, and deploy applications via the Coolify API.",
    icon: Cloud,
    href: "/coolify",
    status: "available",
    group: "infrastructure",
    nav: [{ href: "/coolify", label: "Coolify", icon: Cloud }],
  },
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- modules`
Expected: PASS.

- [ ] **Step 5: Full verification**

Run: `npm test && npm run lint && npm run build`
Expected: all tests pass, lint clean, production build succeeds.

Then `npm run dev` and confirm end to end:
- Sidebar **Infrastructure** group now shows **Coolify** as a live link (no "Soon" badge).
- Dashboard modules hub shows **Coolify** as a clickable card.
- `/coolify` lists apps; create + detail + deploy + env vars + settings all work against your Coolify instance.
- All existing pages (`/dashboard`, `/create`, `/registry`, `/query`, `/settings`) are unchanged and functional.

- [ ] **Step 6: Commit**

```bash
git add src/lib/modules.ts src/lib/modules.test.ts
git commit -m "feat: activate Coolify as a live module"
```

---

## Self-Review

**Spec coverage (Foundation + Phase 2 scope):**
- Rename to Aspyre Infrastructure Manager / `aspyre-devops` → Task 2 ✓
- "Treat every feature as a module" / module architecture → Tasks 3–5 (registry + nav + hub) ✓
- DB Provisioner becomes Module 1, existing functionality intact → preserved throughout; nav/dashboard reuse existing routes; existing tests/pages untouched ✓
- Secrets Module foundation (encrypted token storage) → Task 6 (settings service over existing `Setting` + `crypto.ts`) ✓
- Phase 2 Coolify: List/Create/Update/Deploy applications, manage env vars, configure domains, build commands, start commands → Tasks 7–14 (service methods + actions + pages) ✓
- "Create and deploy a Coolify application without opening Coolify" → Task 13 create form + deploy button ✓
- Reuse existing services/UI/models/patterns → explicitly mirrors `provisioning/*`, `targets.ts`, action shape, shadcn components, `Setting` model, `crypto.ts` ✓

**Out of scope (separate future plans, as agreed):** Phases 3 (NPM), 4 (Cloudflare), 5 (Deployment wizard), and the full Audit module. These appear in the registry as `coming-soon` so the UI advertises them without implementing them.

**Placeholder scan:** No TBD/TODO/"handle errors appropriately" left; every code step contains complete code; error handling is concrete (`CoolifyError` mapping, friendly action messages).

**Type consistency check:** `AppModule`/`ModuleNavItem` used identically in registry, nav, and hub. `CoolifyError`, `CoolifyApplication`, `CoolifyEnvVar`, `CreateApplicationRequest`, `UpdateApplicationRequest`, `CoolifyConnectionResult` defined in Task 7 and used unchanged in client/service/actions. `coolifyFetch` signature (`{ path, method?, body?, query? }`) consistent across client, tests, and service. `settingsService` method names (`set/get/has/delete`) consistent across Task 6 and `coolify-config`. `COOLIFY_SETTING_KEYS` shape consistent across config + actions. Action return type `ActionResult<T>` consistent across `actions/coolify.ts` and all consuming components.

**Known assumption flagged:** Coolify API endpoint paths (`/version`, `/applications`, `/applications/public`, `/deploy`, `/applications/:uuid/envs`, `/projects`, `/servers`) target Coolify v4 and are isolated to `service.ts`; tests mock the HTTP layer so they're version-independent. Verify against the live instance at Task 11's "Test connection" step before relying on Tasks 12–13.
