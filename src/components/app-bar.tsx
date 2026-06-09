"use client";

import * as React from "react";
import { CheckCircle2, XCircle, RefreshCw } from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
import { BRAND } from "@/lib/brand";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { getIntegrationsHealthAction } from "@/app/actions/health";
import type { IntegrationsHealth } from "@/services/health";

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

function IntegrationStatusIcon({ ok, configured }: { ok: boolean; configured: boolean }) {
  if (!configured) {
    return <span className="h-2 w-2 rounded-full bg-muted-foreground/40 inline-block" />;
  }
  if (ok) {
    return <CheckCircle2 className="h-3.5 w-3.5 text-ok shrink-0" />;
  }
  return <XCircle className="h-3.5 w-3.5 text-danger shrink-0" />;
}

function HostStatusIcon({ reachable }: { reachable: boolean }) {
  if (reachable) {
    return <CheckCircle2 className="h-3.5 w-3.5 text-ok shrink-0" />;
  }
  return <XCircle className="h-3.5 w-3.5 text-danger shrink-0" />;
}

function IntegrationsHealthDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [data, setData] = React.useState<IntegrationsHealth | null>(null);
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const result = await getIntegrationsHealthAction();
      setData(result);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (open) {
      load();
    }
  }, [open, load]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Integration health</DialogTitle>
          <DialogDescription>
            Live status of connected services and hosts.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            {loading && !data ? (
              <p className="text-xs text-muted-foreground">Checking...</p>
            ) : data ? (
              data.integrations.map((integration) => (
                <div key={integration.key} className="flex items-center gap-2">
                  <IntegrationStatusIcon ok={integration.ok} configured={integration.configured} />
                  <span className="text-sm font-medium w-40 shrink-0">{integration.label}</span>
                  <span className="text-xs text-muted-foreground truncate">{integration.detail}</span>
                </div>
              ))
            ) : null}
          </div>

          {data && data.hosts.length > 0 && (
            <div className="space-y-2 border-t pt-3">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70 font-mono">Hosts</p>
              {data.hosts.map((host) => (
                <div key={host.name} className="flex items-center gap-2">
                  <HostStatusIcon reachable={host.reachable} />
                  <span className="text-sm">{host.name}</span>
                  <span className="text-xs text-muted-foreground">{host.reachable ? "Reachable" : "Unreachable"}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end border-t pt-3">
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
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
  const [dialogOpen, setDialogOpen] = React.useState(false);

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

      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        title="View integration health"
        className={`flex items-center gap-2 border ${statusTone} bg-secondary/40 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] cursor-pointer hover:bg-secondary/70 transition-colors`}
      >
        <span className={`h-[7px] w-[7px] rounded-full ${dotTone} ${isDown ? "" : "animate-pulse"}`} />
        {statusLabel}
      </button>

      <IntegrationsHealthDialog open={dialogOpen} onOpenChange={setDialogOpen} />

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
