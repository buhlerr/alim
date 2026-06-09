import { Suspense } from "react";
import Link from "next/link";
import {
  Database,
  Layers,
  PlusCircle,
  Server,
  ListChecks,
  CheckCircle2,
  XCircle,
  ScrollText,
  ArrowRight,
  Globe,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { EnvironmentBadge } from "@/components/environment-badge";
import { paletteEntry } from "@/lib/environment-palette";
import { getAllTargetInfo } from "@/lib/targets";
import { toSummary } from "@/lib/environments";
import { environmentsService } from "@/services/environments";
import { registryService } from "@/services/registry";
import {
  IntegrationsSection,
  IntegrationsSkeleton,
} from "@/components/dashboard/integrations-section";
import { auditService, type AuditLogRow } from "@/services/audit";
import { actionLabel } from "@/lib/audit";
import { MODULES, type AppModule } from "@/lib/modules";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // Fast local reads only; the (possibly slow) integration status calls are
  // streamed separately via Suspense so they don't block first paint.
  const [stats, recent, targets, envRows, activity] = await Promise.all([
    registryService.stats(),
    registryService.recent(8),
    getAllTargetInfo(),
    environmentsService.list(),
    auditService.list({ limit: 6 }),
  ]);

  const environments = envRows.map(toSummary);
  const configuredCount = targets.filter((t) => t.configured).length;

  const envByKey = new Map(environments.map((e) => [e.key, e]));
  const envBadge = (key: string) => {
    const e = envByKey.get(key);
    return { key, name: e?.name ?? key, color: e?.color ?? "slate" };
  };

  const availableCount = MODULES.filter((m) => m.status === "available").length;

  return (
    <div className="space-y-14">
      {/* ───── hero ───── */}
      <section className="cr-rise flex flex-wrap items-end justify-between gap-6 border-b border-border pb-8">
        <div>
          <div className="mb-4 flex items-center gap-3 font-mono text-[10.5px] uppercase tracking-[0.32em] text-signal">
            <span className="h-px w-7 bg-signal/60" />
            Infrastructure Administration
          </div>
          <h1 className="font-display text-5xl font-bold uppercase leading-[0.92] tracking-tight md:text-6xl">
            Infra
            <br />
            Control
          </h1>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-muted-foreground">
            {BRAND.appName}: provision databases and operate infrastructure
            across every Aspyre Labs environment.
          </p>
        </div>
        <Button asChild variant="signal" size="lg">
          <Link href="/create">
            <PlusCircle /> Provision Database
          </Link>
        </Button>
      </section>

      {/* ───── modules ───── */}
      <Section
        index="01"
        title="Modules"
        meta={`${availableCount} ONLINE`}
        delay={0.06}
      >
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((m) => (
            <ModuleCard key={m.id} module={m} />
          ))}
        </div>
      </Section>

      {/* ───── fleet telemetry ───── */}
      <Section index="02" title="Fleet Telemetry" meta="LIVE" delay={0.12}>
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          <StatReadout
            label="Total Databases"
            value={stats.total}
            foot="ALL ENVIRONMENTS"
            icon={<Database className="h-3.5 w-3.5" />}
          />
          {environments.map((env) => (
            <StatReadout
              key={env.key}
              label={env.name}
              value={stats.byEnvironment[env.key] ?? 0}
              foot={env.key.toUpperCase()}
              barClass={paletteEntry(env.color).dotClass}
              icon={<Layers className="h-3.5 w-3.5" />}
            />
          ))}
          <StatReadout
            label="Configured Servers"
            value={`${configuredCount}/${targets.length}`}
            foot={
              configuredCount === targets.length ? "FULL COVERAGE" : "PARTIAL"
            }
            icon={<Server className="h-3.5 w-3.5" />}
          />
        </div>
      </Section>

      {/* ───── integrations ───── */}
      <Section index="03" title="Integrations" delay={0.18}>
        <Suspense fallback={<IntegrationsSkeleton />}>
          <IntegrationsSection />
        </Suspense>
      </Section>

      {/* ───── operations ───── */}
      <Section index="04" title="Operations" delay={0.24}>
        <div className="grid gap-3.5 lg:grid-cols-[1fr_1.9fr]">
          {/* quick actions */}
          <Panel title="Quick Actions" corner="CMD">
            <div className="flex flex-col gap-2">
              <ActionButton href="/create" icon={<PlusCircle />}>
                Create single database
              </ActionButton>
              <ActionButton href="/create?mode=set" icon={<Layers />}>
                Create full environment set
              </ActionButton>
              <ActionButton href="/registry" icon={<ListChecks />}>
                Browse databases
              </ActionButton>
              <ActionButton href="/cloudflare" icon={<Globe />}>
                Configure Cloudflare tunnel
              </ActionButton>
            </div>
          </Panel>

          {/* server targets */}
          <Panel
            title="Server Targets"
            corner={`${configuredCount}/${targets.length} ONLINE`}
          >
            <div className="space-y-2">
              {targets.map((t) => {
                const dot = paletteEntry(envBadge(t.environment).color).dotClass;
                return (
                  <div
                    key={t.environment}
                    className="flex items-center gap-4 border border-border bg-secondary/30 px-3.5 py-3 transition-colors hover:border-border/80"
                  >
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot} ${
                        t.configured ? "cr-blink" : "opacity-30"
                      }`}
                    />
                    <EnvironmentBadge environment={envBadge(t.environment)} />
                    <span className="flex-1 truncate font-mono text-[13px]">
                      {t.configured ? t.host : "—"}
                    </span>
                    <span
                      className={`font-mono text-[9.5px] uppercase tracking-[0.14em] ${
                        t.configured ? "text-ok" : "text-muted-foreground/60"
                      }`}
                    >
                      {t.configured ? "Online" : "Offline"}
                    </span>
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>
      </Section>

      {/* ───── recently provisioned ───── */}
      <Section index="05" title="Recently Provisioned" meta="LAST 8" delay={0.3}>
        <Panel>
          {recent.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No databases provisioned yet.{" "}
              <Link href="/create" className="text-signal underline">
                Create your first one.
              </Link>
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {["Application", "Environment", "Database", "Host", "Created"].map(
                      (h) => (
                        <th
                          key={h}
                          className="px-3 pb-3 text-left font-mono text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground/70"
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {recent.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-border/60 transition-colors last:border-0 hover:bg-secondary/40"
                    >
                      <td className="px-3 py-3 font-display font-semibold">
                        {row.applicationName}
                      </td>
                      <td className="px-3 py-3">
                        <EnvironmentBadge environment={envBadge(row.environment)} />
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-muted-foreground">
                        {row.databaseName}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-muted-foreground">
                        {row.host}
                      </td>
                      <td className="px-3 py-3 font-mono text-[11px] text-muted-foreground/70">
                        {row.createdAt.toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </Section>

      {/* ───── activity stream ───── */}
      <Section
        index="06"
        title="Activity Stream"
        delay={0.36}
        action={
          <Link
            href="/audit"
            className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-signal/80 hover:text-signal"
          >
            <ScrollText className="h-3.5 w-3.5" /> View full log
          </Link>
        }
      >
        <Panel>
          {activity.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No activity yet.
            </p>
          ) : (
            <div className="font-mono text-[12px]">
              {activity.map((entry) => (
                <ActivityRow key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </Panel>
      </Section>
    </div>
  );
}

/* ─────────────────────── building blocks ─────────────────────── */

function Section({
  index,
  title,
  meta,
  action,
  delay = 0,
  children,
}: {
  index: string;
  title: string;
  meta?: string;
  action?: React.ReactNode;
  delay?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="cr-rise" style={{ animationDelay: `${delay}s` }}>
      <div className="mb-5 flex items-center gap-3.5">
        <span className="font-mono text-[11px] tracking-[0.1em] text-signal">
          {index}
        </span>
        <h2 className="font-display text-sm font-semibold uppercase tracking-[0.18em]">
          {title}
        </h2>
        <span className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
        {meta ? (
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground/60">
            {meta}
          </span>
        ) : null}
        {action}
      </div>
      {children}
    </section>
  );
}

function Panel({
  title,
  corner,
  children,
}: {
  title?: string;
  corner?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-border bg-card">
      {title ? (
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <span className="font-display text-[13px] font-semibold uppercase tracking-[0.08em]">
            {title}
          </span>
          {corner ? (
            <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground/60">
              {corner}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="p-5">{children}</div>
    </div>
  );
}

function ModuleCard({ module: m }: { module: AppModule }) {
  const Icon = m.icon;
  const available = m.status === "available";
  const inner = (
    <div
      className={`bracket-host group relative h-full overflow-hidden border border-border bg-card p-5 transition-all ${
        available
          ? "hover:-translate-y-0.5 hover:border-signal"
          : "opacity-50"
      }`}
    >
      <span className="bracket-tr" />
      {!available ? (
        <span className="absolute right-4 top-4 border border-border px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.16em] text-muted-foreground/60">
          Soon
        </span>
      ) : null}
      <div className="mb-4 grid h-10 w-10 place-items-center border border-border text-signal transition-colors group-hover:bg-signal/10">
        <Icon className="h-[18px] w-[18px]" />
      </div>
      <h3 className="font-display text-base font-semibold tracking-[0.02em]">
        {m.name}
      </h3>
      <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
        {m.description}
      </p>
      {available ? (
        <div className="mt-4 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-signal/70 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100 [transform:translateX(-6px)]">
          Enter module <ArrowRight className="h-3 w-3" />
        </div>
      ) : null}
    </div>
  );
  return available ? (
    <Link href={m.href} className="block">
      {inner}
    </Link>
  ) : (
    <div>{inner}</div>
  );
}

function StatReadout({
  label,
  value,
  foot,
  barClass = "bg-signal",
  icon,
}: {
  label: string;
  value: number | string;
  foot: string;
  barClass?: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted-foreground/60">
          {label}
        </span>
        <span className="text-muted-foreground/50">{icon}</span>
      </div>
      <div className="my-3.5 font-display text-[42px] font-bold leading-none tabular-nums">
        {value}
      </div>
      <div className="h-[3px] overflow-hidden bg-secondary">
        <div className={`cr-fill h-full w-full ${barClass}`} />
      </div>
      <div className="mt-2.5 font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted-foreground/50">
        {foot}
      </div>
    </div>
  );
}

function ActionButton({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3.5 border border-border bg-secondary/30 px-4 py-3.5 font-mono text-[12px] tracking-[0.02em] transition-all hover:translate-x-1 hover:border-signal hover:bg-secondary/60"
    >
      <span className="text-signal [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
      {children}
      <ArrowRight className="ml-auto h-3.5 w-3.5 text-muted-foreground/50 transition-all group-hover:translate-x-1 group-hover:text-signal" />
    </Link>
  );
}

function ActivityRow({ entry }: { entry: AuditLogRow }) {
  return (
    <div className="flex items-center gap-3 border-b border-dashed border-border py-2.5 last:border-0">
      <span
        className={`w-4 shrink-0 text-center ${
          entry.success ? "text-ok" : "text-danger"
        }`}
      >
        {entry.success ? "✓" : "✕"}
      </span>
      <span className="shrink-0 uppercase tracking-[0.04em] text-signal">
        {actionLabel(entry.action)}
      </span>
      <span className="flex-1 truncate text-muted-foreground">
        {entry.summary}
      </span>
      <span className="shrink-0 text-[10px] text-muted-foreground/60">
        {entry.createdAt.toLocaleString()}
      </span>
    </div>
  );
}
