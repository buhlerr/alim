import type { ReactNode } from "react";

// highlight.js theme for fenced code blocks (rehype-highlight emits hljs classes).
import "highlight.js/styles/github-dark.css";

import { getDocsByCategory } from "@/lib/docs";
import { DocsSidebar } from "@/components/docs/docs-sidebar";

/**
 * /docs section shell: a secondary table-of-contents sidebar alongside the
 * rendered Markdown content. Sits inside the main app chrome.
 */
export default function DocsLayout({ children }: { children: ReactNode }) {
  const groups = getDocsByCategory();

  return (
    <div className="flex flex-col gap-8 md:flex-row md:gap-10">
      <aside className="md:w-56 md:shrink-0">
        <div className="md:sticky md:top-20">
          <DocsSidebar groups={groups} />
        </div>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
