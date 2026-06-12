---
title: Development
description: Scripts, testing, project conventions, and how to contribute.
category: Operations
order: 2
---

This page covers working on ALIM itself.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Hot-reloading dev server on port 3000. |
| `npm run build` | Production build (`prisma generate && next build`). |
| `npm run start` | Start the production server. |
| `npm run lint` | ESLint (`next lint`). |
| `npm test` | Run the Vitest suite once. |
| `npm run test:watch` | Vitest in watch mode. |
| `npm run prisma:migrate:dev` | Create/apply migrations interactively (dev). |
| `npm run prisma:migrate` | Apply pending migrations (`migrate deploy`). |
| `npm run prisma:generate` | Regenerate the Prisma client. |

## Testing

Tests run on Vitest in a Node environment, matching `src/**/*.{test,spec}.{ts,tsx}`:

- **Pure units** — validation schemas, auth config, the SQL classifier, query policy, naming, and password generation are tested directly.
- **Services** — tested with Prisma mocked (`vi.mock("@/lib/prisma")`).
- **Server actions** — tested for input validation, error handling, and audit recording.

`vitest.config.ts` aliases `server-only` and `client-only` to an empty stub, so server-only modules import cleanly in tests. The same files enforce real boundaries at build time.

The codebase follows **test-driven development** for logic-heavy units — write the failing test, watch it fail, then implement. The authentication layer, for example, was built test-first (config, session signing, password compare, and the identity-resolution logic each have their own unit tests).

There is also a Playwright setup (`@playwright/test`) for end-to-end checks; the screenshot script under `scripts/` drives the running app with Playwright.

## Project layout

```
src/
  app/                Next.js App Router
    actions/          "use server" RPCs
    api/health/       liveness endpoint
    <module>/         one folder per module page
    docs/             this documentation site
  components/         React components (ui/ = primitives)
  content/docs/       the Markdown source for /docs
  lib/                pure helpers: validation, auth, crypto, naming, policy
  services/           business logic by domain
  middleware.ts       the auth gate
prisma/               schema + migrations
test/stubs/           server-only/client-only stubs for Vitest
```

## Conventions

- **Server-only code** imports `"server-only"` at the top; pure client-safe utilities live in `src/lib` without it.
- **Validation** lives in `src/lib/*-validation.ts` as Zod schemas and is applied in server actions before any service call.
- **Services** own all database and external-API access; actions orchestrate (validate → service → audit → revalidate) and return a serializable `ActionResult<T>`.
- **Components** are server components by default; reach for `"use client"` only when you need interactivity.
- **TypeScript** is strict; imports use the `@/*` alias for `src/*`.

## Adding a documentation page

The `/docs` site renders Markdown from `src/content/docs/*.md`. To add a page, drop in a new `.md` file with frontmatter:

```markdown
---
title: My Page
description: One-line summary shown under the heading.
category: Reference
order: 6
---

Body in GitHub-flavored Markdown…
```

The filename (minus `.md`) is the URL slug (`/docs/my-page`). Pages are grouped and ordered by `category` then `order` in the sidebar; the category order is `Getting Started → Modules → Reference → Operations`. Fenced code blocks are syntax-highlighted, and tables/task-lists render via GFM.

## Contributing

Match the surrounding code's style, keep changes focused, add tests for new logic, and make sure `npm test`, `npm run lint`, and `npm run build` all pass before opening a pull request.
