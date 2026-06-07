"use client";

import * as React from "react";
import { CheckCircle2, History, Loader2, RefreshCw, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EnvironmentBadge } from "@/components/environment-badge";
import type { EnvironmentSummary } from "@/lib/environments";
import { recentHistoryAction, type HistoryDTO } from "@/app/actions/query";

export interface QueryHistoryHandle {
  refresh: () => void;
}

export const QueryHistoryPanel = React.forwardRef<
  QueryHistoryHandle,
  { initial: HistoryDTO[]; environments: EnvironmentSummary[]; onLoad: (query: string) => void }
>(function QueryHistoryPanel({ initial, environments, onLoad }, ref) {
  const [rows, setRows] = React.useState<HistoryDTO[]>(initial);
  const [loading, setLoading] = React.useState(false);
  const envByKey = React.useMemo(
    () => new Map(environments.map((e) => [e.key, e])),
    [environments],
  );

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      setRows(await recentHistoryAction(50));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useImperativeHandle(ref, () => ({ refresh: () => void refresh() }), [refresh]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <History className="h-4 w-4" /> Query history
        </h3>
        <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
          {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          Refresh
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
          No queries run yet.
        </p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onLoad(r.query)}
              className="flex w-full items-start gap-3 rounded-md border p-2.5 text-left hover:bg-accent"
              title="Load into editor"
            >
              <span className="mt-0.5">
                {r.success ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <EnvironmentBadge
                    environment={{
                      name: envByKey.get(r.environment)?.name ?? r.environment,
                      color: envByKey.get(r.environment)?.color ?? "slate",
                    }}
                  />
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {r.queryType}
                  </Badge>
                  <span className="font-mono text-xs text-muted-foreground">{r.databaseName}</span>
                  {r.executionTimeMs != null ? (
                    <span className="text-[11px] text-muted-foreground">{r.executionTimeMs} ms</span>
                  ) : null}
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {new Date(r.executedAt).toLocaleString()}
                  </span>
                </div>
                <p className="mt-1 truncate font-mono text-xs">{r.query.replace(/\s+/g, " ")}</p>
                {r.errorMessage ? (
                  <p className="mt-0.5 truncate text-[11px] text-destructive">{r.errorMessage}</p>
                ) : null}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
