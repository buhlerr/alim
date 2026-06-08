import * as React from "react";
import { AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils";

const TONES = {
  warn: "border-warn/40 bg-warn/10",
  info: "border-signal/40 bg-signal/10",
  danger: "border-destructive/40 bg-destructive/10",
} as const;

const ICON_TONES = {
  warn: "text-warn",
  info: "text-signal",
  danger: "text-destructive",
} as const;

/**
 * Themed inline notice (replaces the ad-hoc amber "not configured" cards). The
 * leading icon defaults to a warning triangle; pass `icon` to override.
 */
export function Callout({
  tone = "warn",
  icon,
  title,
  className,
  children,
}: {
  tone?: keyof typeof TONES;
  icon?: React.ReactNode;
  title?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-sm border px-4 py-4 text-sm",
        TONES[tone],
        className,
      )}
    >
      <span className={cn("mt-0.5 shrink-0 [&_svg]:h-4 [&_svg]:w-4", ICON_TONES[tone])}>
        {icon ?? <AlertTriangle />}
      </span>
      <div className="flex flex-col items-start gap-3">
        {title ? (
          <p className="font-display text-sm font-semibold uppercase tracking-wide text-foreground">
            {title}
          </p>
        ) : null}
        {children}
      </div>
    </div>
  );
}
