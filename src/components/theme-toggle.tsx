"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

/**
 * Day/night switch. Renders a stable placeholder until mounted to avoid a
 * hydration mismatch (the resolved theme is only known client-side).
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      aria-label="Toggle day / night"
      title={mounted ? (isDark ? "Switch to day" : "Switch to night") : undefined}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="group relative grid h-8 w-8 place-items-center border border-border bg-secondary/40 text-muted-foreground transition-colors hover:border-signal hover:text-signal"
    >
      {mounted ? (
        isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />
      ) : (
        <span className="h-4 w-4" />
      )}
    </button>
  );
}
