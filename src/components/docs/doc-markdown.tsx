import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import rehypeHighlight from "rehype-highlight";

/**
 * Renders a Markdown documentation body.
 *
 * - remark-gfm: tables, task lists, strikethrough, autolinks
 * - rehype-slug: stable `id`s on headings (deep-linkable / anchorable)
 * - rehype-highlight: syntax highlighting (highlight.js classes; the theme CSS
 *   is imported by the /docs layout)
 *
 * Styling comes from the `prose` wrapper applied by the caller; a few element
 * overrides here keep code/tables on-brand.
 */
export function DocMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeSlug, [rehypeHighlight, { ignoreMissing: true }]]}
      components={{
        a: ({ href, children, ...props }) => {
          const external = !!href && /^https?:\/\//.test(href);
          return (
            <a
              href={href}
              {...(external
                ? { target: "_blank", rel: "noreferrer noopener" }
                : {})}
              {...props}
            >
              {children}
            </a>
          );
        },
        table: ({ children, ...props }) => (
          <div className="my-6 overflow-x-auto rounded-md border border-border">
            <table className="my-0 w-full" {...props}>
              {children}
            </table>
          </div>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
