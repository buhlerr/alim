"use client";

import * as React from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { BRAND } from "@/lib/brand";

const pad = (n: number) => String(n).padStart(2, "0");

function useNow() {
  const [now, setNow] = React.useState<Date | null>(null);
  React.useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function formatTime(d: Date, hour12: boolean): string {
  const m = pad(d.getMinutes());
  const s = pad(d.getSeconds());
  if (hour12) {
    const ampm = d.getHours() >= 12 ? "PM" : "AM";
    const h = d.getHours() % 12 || 12;
    return `${pad(h)}:${m}:${s} ${ampm}`;
  }
  return `${pad(d.getHours())}:${m}:${s}`;
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
 * system clock (click to toggle 12h/24h), the real server uptime + a
 * database-backed status pill (both from /api/health), and the day/night toggle.
 */
export function AppBar() {
  const now = useNow();
  const health = useHealth();
  const [hour12, setHour12] = React.useState(true); // default to AM/PM

  const isOk = health?.status === "ok";
  const isDown = health?.status === "degraded";
  const statusLabel = !health ? "Checking" : isOk ? "Normal" : "Degraded";
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

  return (
    <header className="sticky top-0 z-40 hidden h-16 items-center gap-6 border-b border-border bg-background/70 px-6 backdrop-blur-md backdrop-saturate-150 md:flex">
      <div className="whitespace-nowrap bg-gradient-to-r from-[#7a44b7] to-[#ee2f6d] bg-clip-text font-display text-[12px] font-semibold uppercase tracking-[0.2em] text-transparent">
        {BRAND.appName}
      </div>

      <div className="ml-auto flex items-center gap-6 font-mono text-[11px]">
        <Telemetry
          k="Uptime"
          v={health ? formatUptime(health.uptimeSeconds) : "--:--:--"}
          accent
        />
        <button
          type="button"
          onClick={() => setHour12((v) => !v)}
          title={`Switch to ${hour12 ? "24-hour" : "12-hour"} time`}
          className="group flex flex-col items-start gap-0.5 text-left transition-colors"
        >
          <span className="text-[8.5px] uppercase tracking-[0.22em] text-muted-foreground/70 group-hover:text-signal">
            Sys&nbsp;Time
          </span>
          <span className="tabular-nums text-foreground group-hover:text-signal">
            {now ? formatTime(now, hour12) : "--:--:--"}
          </span>
        </button>
      </div>

      <div
        className={`flex items-center gap-2 border ${statusTone} bg-secondary/40 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em]`}
      >
        <span className={`h-[7px] w-[7px] rounded-full ${dotTone} ${isDown ? "" : "animate-pulse"}`} />
        {statusLabel}
      </div>

      <ThemeToggle />
    </header>
  );
}

function Telemetry({
  k,
  v,
  accent,
}: {
  k: string;
  v: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className="text-[8.5px] uppercase tracking-[0.22em] text-muted-foreground/70"
        dangerouslySetInnerHTML={{ __html: k }}
      />
      <span className={accent ? "tabular-nums text-signal" : "tabular-nums text-foreground"}>
        {v}
      </span>
    </div>
  );
}
