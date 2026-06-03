"use client";

import * as React from "react";
import {
  Activity,
  Database,
  HardDrive,
  Loader2,
  Network,
  RefreshCw,
  Server,
  Timer,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResultsTable } from "@/components/query/results-table";
import {
  adminOverviewAction,
  adminPerformanceAction,
  adminStorageAction,
} from "@/app/actions/query";
import type { Environment } from "@/lib/environments";
import type { ServerOverview } from "@/services/query/types";
import type { AdminPerformance, AdminStorage } from "@/services/query/admin";

export function AdminDashboard({
  environment,
  database,
}: {
  environment: Environment;
  database: string;
}) {
  const [overview, setOverview] = React.useState<ServerOverview | null>(null);
  const [loadingOverview, setLoadingOverview] = React.useState(false);
  const [storage, setStorage] = React.useState<AdminStorage | null>(null);
  const [loadingStorage, setLoadingStorage] = React.useState(false);
  const [perf, setPerf] = React.useState<AdminPerformance | null>(null);
  const [loadingPerf, setLoadingPerf] = React.useState(false);

  const loadOverview = React.useCallback(async () => {
    setLoadingOverview(true);
    try {
      const res = await adminOverviewAction(environment);
      if (res.ok && res.overview) setOverview(res.overview);
      else toast.error(res.error ?? "Could not load overview.");
    } finally {
      setLoadingOverview(false);
    }
  }, [environment]);

  // Reset + auto-load overview when the environment changes.
  React.useEffect(() => {
    setStorage(null);
    setPerf(null);
    void loadOverview();
  }, [loadOverview]);

  async function loadStorage() {
    setLoadingStorage(true);
    try {
      const res = await adminStorageAction(environment, database);
      if (res.ok && res.storage) setStorage(res.storage);
      else toast.error(res.error ?? "Could not load storage stats.");
    } finally {
      setLoadingStorage(false);
    }
  }

  async function loadPerf() {
    setLoadingPerf(true);
    try {
      const res = await adminPerformanceAction(environment);
      if (res.ok && res.performance) setPerf(res.performance);
      else toast.error(res.error ?? "Could not load performance stats.");
    } finally {
      setLoadingPerf(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Overview */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Server className="h-4 w-4" /> Database overview
          </h3>
          <Button variant="outline" size="sm" onClick={loadOverview} disabled={loadingOverview}>
            {loadingOverview ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Refresh
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <OverviewCard icon={<Database className="h-4 w-4" />} label="Databases" value={overview?.totalDatabases} loading={loadingOverview} />
          <OverviewCard icon={<Users className="h-4 w-4" />} label="Users / roles" value={overview?.totalUsers} loading={loadingOverview} />
          <OverviewCard icon={<Network className="h-4 w-4" />} label="Connections" value={overview?.activeConnections} loading={loadingOverview} />
          <OverviewCard icon={<Server className="h-4 w-4" />} label="Version" value={overview?.serverVersion} loading={loadingOverview} />
          <OverviewCard icon={<Timer className="h-4 w-4" />} label="Uptime" value={formatUptime(overview?.uptime)} loading={loadingOverview} />
        </div>
      </section>

      {/* Storage */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <HardDrive className="h-4 w-4" /> Storage
          </h3>
          <Button variant="outline" size="sm" onClick={loadStorage} disabled={loadingStorage}>
            {loadingStorage ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            {storage ? "Refresh" : "Load"}
          </Button>
        </div>
        {storage ? (
          <div className="space-y-4">
            <LabeledResult title="Database sizes">
              <ResultsTable result={storage.databaseSizes} environment={environment} database="(cluster)" />
            </LabeledResult>
            <LabeledResult title={`Largest tables · ${database}`}>
              <ResultsTable result={storage.largestTables} environment={environment} database={database} />
            </LabeledResult>
          </div>
        ) : (
          <Placeholder>Load to view database and table sizes.</Placeholder>
        )}
      </section>

      {/* Performance */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Activity className="h-4 w-4" /> Performance
          </h3>
          <Button variant="outline" size="sm" onClick={loadPerf} disabled={loadingPerf}>
            {loadingPerf ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            {perf ? "Refresh" : "Load"}
          </Button>
        </div>
        {perf ? (
          <div className="space-y-4">
            <LabeledResult title="Active queries">
              <ResultsTable result={perf.activeQueries} environment={environment} database="(cluster)" />
            </LabeledResult>
            <LabeledResult title="Long-running queries (> 30s)">
              <ResultsTable result={perf.longRunning} environment={environment} database="(cluster)" />
            </LabeledResult>
            <LabeledResult title="Waiting locks">
              <ResultsTable result={perf.locks} environment={environment} database="(cluster)" />
            </LabeledResult>
          </div>
        ) : (
          <Placeholder>Load to view active queries, long-running queries, and locks.</Placeholder>
        )}
      </section>
    </div>
  );
}

function OverviewCard({
  icon,
  label,
  value,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string | undefined;
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
        <span className="text-muted-foreground">{icon}</span>
      </CardHeader>
      <CardContent>
        <div className="truncate text-lg font-bold" title={value != null ? String(value) : ""}>
          {loading && value == null ? "…" : (value ?? "—")}
        </div>
      </CardContent>
    </Card>
  );
}

function LabeledResult({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

/** Trim Postgres interval text like "1 day 02:03:04.5" down to something tidy. */
function formatUptime(raw?: string): string | undefined {
  if (!raw) return undefined;
  return raw.replace(/\.\d+$/, "").replace(/:\d{2}$/, (m) => m);
}
