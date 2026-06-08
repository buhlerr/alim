"use client";

import * as React from "react";

import { ThemeToggle } from "@/components/theme-toggle";

const pad = (n: number) => String(n).padStart(2, "0");

function useClock() {
  const [time, setTime] = React.useState<string | null>(null);
  React.useEffect(() => {
    const tick = () => {
      const d = new Date();
      setTime(`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

type Health = { status: "ok" | "degraded" | "unknown"; uptimeSeconds: number };

/**
 * Polls /api/health for the real process uptime and database reachability,
 * then ticks the uptime forward locally between polls so the figure stays live
 * without hammering the endpoint. Returns null until the first response.
 */
function useHealth() {
  const [base, setBase] = React.useState<{
    status: Health["status"];
    uptimeSeconds: number;
    syncedAt: number;
  } | null>(null);
  const [, force] = React.useReducer((n) => n + 1, 0);

  React.useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        const data = await res.json();
        if (alive) {
          setBase({
            status: data.status === "ok" ? "ok" : "degraded",
            uptimeSeconds: Number(data.uptimeSeconds) || 0,
            syncedAt: Date.now(),
          });
        }
      } catch {
        if (alive) {
          setBase((prev) =>
            prev
              ? { ...prev, status: "degraded" }
              : { status: "degraded", uptimeSeconds: 0, syncedAt: Date.now() },
          );
        }
      }
    };
    poll();
    const pollId = setInterval(poll, 30_000);
    const tickId = setInterval(force, 1000); // advance the live uptime display
    return () => {
      alive = false;
      clearInterval(pollId);
      clearInterval(tickId);
    };
  }, []);

  if (!base) return null;
  const elapsed = Math.floor((Date.now() - base.syncedAt) / 1000);
  return { status: base.status, uptimeSeconds: base.uptimeSeconds + elapsed };
}

function formatUptime(total: number): string {
  const s = Math.max(0, total);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return d > 0
    ? `${d}d ${pad(h)}:${pad(m)}:${pad(sec)}`
    : `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

/**
 * Global command bar shown above page content on desktop. Carries the live
 * system clock, the real server uptime + database-backed status pill (both from
 * /api/health), the day/night toggle, and the operator identity.
 */
export function AppBar({ operator }: { operator: string }) {
  const time = useClock();
  const health = useHealth();

  const isOk = health?.status === "ok";
  const isDown = health?.status === "degraded";
  const statusLabel = !health ? "Checking" : isOk ? "Nominal" : "Degraded";
  const statusTone = !health
    ? "border-border text-muted-foreground"
    : isOk
      ? "border-ok/40 text-ok"
      : "border-danger/40 text-danger";
  const dotTone = !health
    ? "bg-muted-foreground"
    : isOk
      ? "bg-ok shadow-[0_0_8px_hsl(var(--ok))]"
      : "bg-danger shadow-[0_0_8px_hsl(var(--danger))]";

  const initials = operatorInitials(operator);

  return (
    <header className="sticky top-0 z-40 hidden items-center gap-6 border-b border-border bg-background/70 px-6 py-3 backdrop-blur-md backdrop-saturate-150 md:flex">
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-signal shadow-[0_0_8px_hsl(var(--signal))]" />
        Control Surface
      </div>

      <div className="ml-auto flex items-center gap-6 font-mono text-[11px]">
        <Telemetry
          k="Uptime"
          v={health ? formatUptime(health.uptimeSeconds) : "--:--:--"}
          accent
        />
        <Telemetry k="Sys&nbsp;Time" v={time ?? "--:--:--"} mono />
      </div>

      <div
        className={`flex items-center gap-2 border ${statusTone} bg-secondary/40 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em]`}
      >
        <span className={`h-[7px] w-[7px] rounded-full ${dotTone} ${isDown ? "" : "animate-pulse"}`} />
        {statusLabel}
      </div>

      <ThemeToggle />

      <div
        title={`Operator: ${operator}`}
        className="grid h-8 w-8 place-items-center border border-border bg-secondary/50 font-mono text-[11px] text-signal"
      >
        {initials}
      </div>
    </header>
  );
}

/** First letters of the operator id's words (e.g. "internal-admin" → "IA"). */
function operatorInitials(operator: string): string {
  const parts = operator.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (parts.length === 0) return "··";
  const letters = (parts[0][0] + (parts[1]?.[0] ?? parts[0][1] ?? "")).toUpperCase();
  return letters || "··";
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
            ? "tabular-nums text-signal"
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
