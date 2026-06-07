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
