"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import type { DocCategory } from "@/lib/docs";

/** In-page table of contents for the /docs section. */
export function DocsSidebar({ groups }: { groups: DocCategory[] }) {
  const pathname = usePathname();

  return (
    <nav className="space-y-6">
      {groups.map((group) => (
        <div key={group.category} className="space-y-1">
          <p className="px-2 pb-1 font-mono text-[9.5px] font-medium uppercase tracking-[0.2em] text-muted-foreground/60">
            {group.category}
          </p>
          {group.docs.map((doc) => {
            const href = `/docs/${doc.slug}`;
            const active = pathname === href;
            return (
              <Link
                key={doc.slug}
                href={href}
                className={cn(
                  "block rounded-sm border-l-2 px-2 py-1.5 text-sm transition-colors",
                  active
                    ? "border-signal bg-signal/10 font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {doc.title}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
