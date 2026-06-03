"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { format } from "sql-formatter";
import {
  Eraser,
  Loader2,
  Play,
  ScanSearch,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResultsTable } from "@/components/query/results-table";
import { ConfirmDialog } from "@/components/query/confirm-dialog";
import { SavedQueriesSidebar } from "@/components/query/saved-queries-sidebar";
import {
  QueryHistoryPanel,
  type QueryHistoryHandle,
} from "@/components/query/query-history";
import { AdminDashboard } from "@/components/query/admin-dashboard";
import {
  ENVIRONMENT_LABELS,
  ENVIRONMENTS,
  type Environment,
} from "@/lib/environments";
import { classifyQuery } from "@/lib/sql-classify";
import { evaluatePolicy } from "@/lib/query-policy";
import {
  deleteSavedQueryAction,
  executeQueryAction,
  explainQueryAction,
  listDatabasesAction,
  listSavedQueriesAction,
  saveQueryAction,
  type HistoryDTO,
  type SavedQueryDTO,
} from "@/app/actions/query";
import type { QueryResult } from "@/services/query/types";

const SqlEditor = dynamic(() => import("@/components/query/sql-editor"), {
  ssr: false,
  loading: () => <div className="h-[280px] animate-pulse rounded-md border bg-muted/30" />,
});

const PLACEHOLDER = "-- Write SQL here. SELECT/EXPLAIN/SHOW run immediately;\n-- writes (UPDATE, DELETE, DROP, …) require typed confirmation.\n";

export function QueryConsole({
  configured,
  prodWritesDisabled,
  initialSaved,
  initialHistory,
}: {
  configured: Record<Environment, boolean>;
  prodWritesDisabled: boolean;
  initialSaved: SavedQueryDTO[];
  initialHistory: HistoryDTO[];
}) {
  const firstConfigured = ENVIRONMENTS.find((e) => configured[e]) ?? "DEVELOPMENT";
  const [environment, setEnvironment] = React.useState<Environment>(firstConfigured);
  const [databases, setDatabases] = React.useState<string[]>([]);
  const [database, setDatabase] = React.useState<string>("");
  const [loadingDbs, setLoadingDbs] = React.useState(false);

  const [query, setQuery] = React.useState<string>(PLACEHOLDER);
  const [running, setRunning] = React.useState(false);
  const [result, setResult] = React.useState<QueryResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [dangerousKeywords, setDangerousKeywords] = React.useState<string[]>([]);

  const [saved, setSaved] = React.useState<SavedQueryDTO[]>(initialSaved);
  const historyRef = React.useRef<QueryHistoryHandle>(null);

  // Load databases whenever the environment changes.
  React.useEffect(() => {
    let cancelled = false;
    if (!configured[environment]) {
      setDatabases([]);
      setDatabase("");
      return;
    }
    setLoadingDbs(true);
    listDatabasesAction(environment)
      .then((res) => {
        if (cancelled) return;
        if (res.ok && res.databases) {
          setDatabases(res.databases);
          setDatabase((prev) =>
            res.databases!.includes(prev) ? prev : (res.databases![0] ?? ""),
          );
        } else {
          setDatabases([]);
          setDatabase("");
          toast.error(res.error ?? "Could not list databases.");
        }
      })
      .finally(() => !cancelled && setLoadingDbs(false));
    return () => {
      cancelled = true;
    };
  }, [environment, configured]);

  const classification = React.useMemo(
    () => classifyQuery(stripPlaceholder(query)),
    [query],
  );
  const policy = evaluatePolicy({
    environment,
    category: classification.category,
    prodWritesDisabled,
  });

  const canRun = configured[environment] && Boolean(database) && !running;

  async function runExecute(confirmed: boolean) {
    setRunning(true);
    setError(null);
    try {
      const res = await executeQueryAction({
        environment,
        database,
        query: stripPlaceholder(query),
        confirmed,
      });
      if (res.needsConfirmation) {
        setDangerousKeywords(res.dangerousKeywords ?? []);
        setConfirmOpen(true);
        return;
      }
      if (res.ok && res.result) {
        setResult(res.result);
        setConfirmOpen(false);
        toast.success(`${res.result.rowCount} row(s) · ${res.result.executionTimeMs} ms`);
      } else {
        setResult(null);
        setError(res.error ?? "Query failed.");
        setConfirmOpen(false);
        toast.error(res.error ?? "Query failed.");
      }
    } finally {
      setRunning(false);
      historyRef.current?.refresh();
    }
  }

  function onExecuteClick() {
    const sql = stripPlaceholder(query);
    if (!sql.trim()) {
      toast.error("The editor is empty.");
      return;
    }
    if (!policy.allowed) {
      toast.error(policy.reason ?? "This query is not allowed.");
      return;
    }
    if (policy.requiresConfirmation) {
      setDangerousKeywords(classification.dangerousKeywords);
      setConfirmOpen(true);
      return;
    }
    void runExecute(false);
  }

  async function onExplainClick() {
    const sql = stripPlaceholder(query);
    if (!sql.trim()) {
      toast.error("The editor is empty.");
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const res = await explainQueryAction({ environment, database, query: sql });
      if (res.ok && res.result) {
        setResult(res.result);
        toast.success("Plan generated.");
      } else {
        setResult(null);
        setError(res.error ?? "Explain failed.");
        toast.error(res.error ?? "Explain failed.");
      }
    } finally {
      setRunning(false);
    }
  }

  function onFormatClick() {
    const sql = stripPlaceholder(query);
    if (!sql.trim()) return;
    try {
      setQuery(format(sql, { language: "postgresql", keywordCase: "upper" }));
    } catch {
      toast.error("Could not format this SQL.");
    }
  }

  function onClearClick() {
    setQuery("");
    setResult(null);
    setError(null);
  }

  async function refreshSaved() {
    setSaved(await listSavedQueriesAction());
  }

  return (
    <Tabs defaultValue="console" className="space-y-4">
      <TabsList>
        <TabsTrigger value="console">SQL Console</TabsTrigger>
        <TabsTrigger value="admin">Admin Dashboard</TabsTrigger>
      </TabsList>

      {/* Shared target selectors */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Environment</label>
          <Select value={environment} onValueChange={(v) => setEnvironment(v as Environment)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ENVIRONMENTS.map((env) => (
                <SelectItem key={env} value={env} disabled={!configured[env]}>
                  {ENVIRONMENT_LABELS[env]}
                  {!configured[env] ? " — not configured" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Database</label>
          <Select
            value={database}
            onValueChange={setDatabase}
            disabled={!configured[environment] || loadingDbs || databases.length === 0}
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder={loadingDbs ? "Loading…" : "Select a database"} />
            </SelectTrigger>
            <SelectContent>
              {databases.map((db) => (
                <SelectItem key={db} value={db} className="font-mono">
                  {db}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {environment === "PRODUCTION" && prodWritesDisabled ? (
          <Badge variant="warning" className="mb-1.5">Production is read-only</Badge>
        ) : null}
      </div>

      <TabsContent value="console" className="mt-0">
        <div className="grid gap-4 lg:grid-cols-[1fr_330px]">
          {/* Editor + results */}
          <div className="space-y-3">
            <SqlEditor value={query} onChange={setQuery} />

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={onExecuteClick} disabled={!canRun}>
                {running ? <Loader2 className="animate-spin" /> : <Play />}
                Execute
              </Button>
              <Button variant="outline" onClick={onExplainClick} disabled={!canRun}>
                <ScanSearch /> Explain
              </Button>
              <Button variant="outline" onClick={onFormatClick}>
                <Sparkles /> Format
              </Button>
              <Button variant="ghost" onClick={onClearClick}>
                <Eraser /> Clear
              </Button>
              <span className="ml-auto">
                {classification.category === "write" ? (
                  <Badge variant="warning">Write · needs confirmation</Badge>
                ) : (
                  <Badge variant="success">Read-only</Badge>
                )}
              </span>
            </div>

            {error ? (
              <Card className="border-destructive/50 bg-destructive/5">
                <CardContent className="py-3">
                  <p className="font-mono text-sm text-destructive">{error}</p>
                </CardContent>
              </Card>
            ) : null}

            {result ? (
              <ResultsTable result={result} environment={environment} database={database || "—"} />
            ) : !error ? (
              <div className="rounded-lg border bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground">
                Run a query to see results here.
              </div>
            ) : null}
          </div>

          {/* Sidebar: saved + history */}
          <div className="space-y-6">
            <div className="rounded-lg border p-3">
              <SavedQueriesSidebar
                saved={saved}
                currentQuery={stripPlaceholder(query)}
                onLoad={(q) => setQuery(q)}
                onSave={async (input) => {
                  const res = await saveQueryAction({ ...input, query: stripPlaceholder(query) });
                  if (res.ok) {
                    toast.success("Query saved.");
                    await refreshSaved();
                  } else {
                    toast.error(res.error ?? "Could not save.");
                  }
                }}
                onDelete={async (id) => {
                  await deleteSavedQueryAction(id);
                  await refreshSaved();
                  toast.success("Deleted.");
                }}
              />
            </div>
            <div className="rounded-lg border p-3">
              <QueryHistoryPanel
                ref={historyRef}
                initial={initialHistory}
                onLoad={(q) => setQuery(q)}
              />
            </div>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="admin" className="mt-0">
        {configured[environment] ? (
          <AdminDashboard environment={environment} database={database} />
        ) : (
          <div className="rounded-lg border bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground">
            Select a configured environment to view admin stats.
          </div>
        )}
      </TabsContent>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        environment={environment}
        database={database || "—"}
        dangerousKeywords={dangerousKeywords}
        pending={running}
        onConfirm={() => void runExecute(true)}
      />
    </Tabs>
  );
}

/** The editor seeds a comment placeholder; treat a placeholder-only buffer as empty. */
function stripPlaceholder(value: string): string {
  return value === PLACEHOLDER ? "" : value;
}
