"use client";

import * as React from "react";

import { ThemeToggle } from "@/components/theme-toggle";

function useClock() {
  const [time, setTime] = React.useState<string | null>(null);
  React.useEffect(() => {
    const tick = () => {
      const d = new Date();
      const p = (n: number) => String(n).padStart(2, "0");
      setTime(`${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

/**
 * Global command bar shown above page content on desktop. Carries the
 * control-room telemetry (region, uptime, live system clock), an all-systems
 * status pill, and the day/night toggle. The clock renders blank until mounted
 * so SSR and client markup agree.
 */
export function AppBar() {
  const time = useClock();

  return (
    <header className="sticky top-0 z-40 hidden items-center gap-6 border-b border-border bg-background/70 px-6 py-3 backdrop-blur-md backdrop-saturate-150 md:flex">
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-signal shadow-[0_0_8px_hsl(var(--signal))]" />
        Control Surface
      </div>

      <div className="ml-auto flex items-center gap-6 font-mono text-[11px]">
        <Telemetry k="Region" v="eu-central-1" />
        <Telemetry k="Uptime" v="99.98%" accent />
        <Telemetry k="Sys&nbsp;Time" v={time ?? "--:--:--"} mono />
      </div>

      <div className="flex items-center gap-2 border border-ok/40 bg-secondary/40 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ok">
        <span className="h-[7px] w-[7px] animate-pulse rounded-full bg-ok shadow-[0_0_8px_hsl(var(--ok))]" />
        Nominal
      </div>

      <ThemeToggle />

      <div className="grid h-8 w-8 place-items-center border border-border bg-secondary/50 font-mono text-[11px] text-signal">
        AE
      </div>
    </header>
  );
}

function Telemetry({
  k,
  v,
  accent,
  mono,
}: {
  k: string;
  v: string;
  accent?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className="text-[8.5px] uppercase tracking-[0.22em] text-muted-foreground/70"
        dangerouslySetInnerHTML={{ __html: k }}
      />
      <span
        className={
          accent
            ? "text-signal"
            : mono
              ? "tabular-nums text-foreground"
              : "text-foreground"
        }
      >
        {v}
      </span>
    </div>
  );
}
