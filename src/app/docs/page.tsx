import { redirect } from "next/navigation";

import { getFirstDocSlug } from "@/lib/docs";

/** /docs lands on the first document (the overview). */
export default function DocsIndexPage() {
  redirect(`/docs/${getFirstDocSlug()}`);
}
