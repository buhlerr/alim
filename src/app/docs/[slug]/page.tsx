import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getAllDocs, getDoc } from "@/lib/docs";
import { DocMarkdown } from "@/components/docs/doc-markdown";
import { BRAND } from "@/lib/brand";

interface Params {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return getAllDocs().map((doc) => ({ slug: doc.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const doc = getDoc(slug);
  if (!doc) return { title: `Docs — ${BRAND.shortName}` };
  return {
    title: `${doc.meta.title} — ${BRAND.shortName} Docs`,
    description: doc.meta.description,
  };
}

export default async function DocPage({ params }: Params) {
  const { slug } = await params;
  const doc = getDoc(slug);
  if (!doc) notFound();

  return (
    <article className="min-w-0">
      <header className="mb-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60">
          {doc.meta.category}
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">
          {doc.meta.title}
        </h1>
        {doc.meta.description ? (
          <p className="mt-2 text-muted-foreground">{doc.meta.description}</p>
        ) : null}
      </header>

      <div className="docs-prose prose prose-invert max-w-none">
        <DocMarkdown content={doc.content} />
      </div>
    </article>
  );
}
