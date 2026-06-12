/**
 * Documentation loader.
 *
 * Reads the Markdown files in `src/content/docs/*.md`, parses their YAML
 * frontmatter, and exposes them grouped by category for the /docs pages. Each
 * file's name (without extension) is its URL slug.
 *
 * Server-only: touches the filesystem. The standalone build copies the content
 * directory via `outputFileTracingIncludes` in next.config.ts.
 *
 * Frontmatter shape:
 *   ---
 *   title: Configuration
 *   description: Every environment variable explained
 *   category: Reference
 *   order: 2
 *   ---
 */
import "server-only";
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

export interface DocMeta {
  slug: string;
  title: string;
  description: string;
  category: string;
  order: number;
}

export interface DocCategory {
  category: string;
  docs: DocMeta[];
}

export interface LoadedDoc {
  meta: DocMeta;
  content: string;
}

/** Category display order in the sidebar. Unknown categories sort last. */
const CATEGORY_ORDER = [
  "Getting Started",
  "Modules",
  "Reference",
  "Operations",
];

const DOCS_DIR = path.join(process.cwd(), "src", "content", "docs");

function categoryRank(category: string): number {
  const i = CATEGORY_ORDER.indexOf(category);
  return i === -1 ? CATEGORY_ORDER.length : i;
}

function readDoc(slug: string): LoadedDoc | null {
  const file = path.join(DOCS_DIR, `${slug}.md`);
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, "utf8");
  const { data, content } = matter(raw);
  return {
    meta: {
      slug,
      title: String(data.title ?? slug),
      description: String(data.description ?? ""),
      category: String(data.category ?? "Reference"),
      order: Number(data.order ?? 999),
    },
    content,
  };
}

/** All docs, sorted by category order then per-doc order then title. */
export function getAllDocs(): DocMeta[] {
  if (!fs.existsSync(DOCS_DIR)) return [];
  return fs
    .readdirSync(DOCS_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => readDoc(f.replace(/\.md$/, ""))!.meta)
    .sort(
      (a, b) =>
        categoryRank(a.category) - categoryRank(b.category) ||
        a.order - b.order ||
        a.title.localeCompare(b.title),
    );
}

/** Docs grouped into ordered categories for the sidebar table of contents. */
export function getDocsByCategory(): DocCategory[] {
  const groups: DocCategory[] = [];
  for (const meta of getAllDocs()) {
    let group = groups.find((g) => g.category === meta.category);
    if (!group) {
      group = { category: meta.category, docs: [] };
      groups.push(group);
    }
    group.docs.push(meta);
  }
  return groups;
}

/** Full doc (meta + markdown body) by slug, or null if it doesn't exist. */
export function getDoc(slug: string): LoadedDoc | null {
  // Guard against path traversal — slugs are flat filenames only.
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  return readDoc(slug);
}

/** The slug the bare /docs route should redirect to (the first doc). */
export function getFirstDocSlug(): string {
  return getAllDocs()[0]?.slug ?? "overview";
}
