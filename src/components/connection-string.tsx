"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

/**
 * Displays a DATABASE_URL with a copy button. The password is masked by default
 * and can be revealed. This is only ever rendered immediately after creation —
 * the value is never persisted.
 */
export function ConnectionString({
  label,
  value,
  className,
}: {
  label?: string;
  value: string;
  className?: string;
}) {
  const [revealed, setRevealed] = React.useState(false);

  const display = revealed ? value : maskPassword(value);

  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? (
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
      ) : null}
      <div className="flex items-center gap-2">
        <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-md border bg-muted px-3 py-2 font-mono text-xs">
          {display}
        </code>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setRevealed((r) => !r)}
          aria-label={revealed ? "Hide password" : "Reveal password"}
        >
          {revealed ? <EyeOff /> : <Eye />}
        </Button>
        {/* Copy always copies the REAL value, regardless of reveal state. */}
        <CopyButton value={value} />
      </div>
    </div>
  );
}

/** Replace the password component of a postgres URL with bullets for display. */
function maskPassword(url: string): string {
  return url.replace(/^(postgresql:\/\/[^:]+:)([^@]+)(@)/, "$1••••••••$3");
}
