"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, ScrollText, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AUDIT_ACTIONS,
  AUDIT_TARGET_TYPES,
  actionLabel,
} from "@/lib/audit";

export interface AuditRow {
  id: string;
  createdAt: string;
  actor: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  summary: string;
  success: boolean;
  environment: string | null;
  metadata: Record<string, unknown> | null;
}

export interface AuditFilters {
  action: string;
  actor: string;
  targetType: string;
}

const ALL = "__all__";

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function AuditView({
  rows,
  filters,
}: {
  rows: AuditRow[];
  filters: AuditFilters;
}) {
  const router = useRouter();
  const [actor, setActor] = React.useState(filters.actor);

  const apply = React.useCallback(
    (next: Partial<AuditFilters>) => {
      const merged = { ...filters, actor, ...next };
      const params = new URLSearchParams();
      if (merged.action) params.set("action", merged.action);
      if (merged.actor) params.set("actor", merged.actor);
      if (merged.targetType) params.set("targetType", merged.targetType);
      const qs = params.toString();
      router.push(qs ? `/audit?${qs}` : "/audit");
    },
    [router, filters, actor],
  );

  const hasFilters = Boolean(filters.action || filters.actor || filters.targetType);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 py-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Action</Label>
            <Select
              value={filters.action || ALL}
              onValueChange={(v) => apply({ action: v === ALL ? "" : v })}
            >
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All actions</SelectItem>
                {Object.values(AUDIT_ACTIONS).map((a) => (
                  <SelectItem key={a} value={a}>
                    {actionLabel(a)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Target type</Label>
            <Select
              value={filters.targetType || ALL}
              onValueChange={(v) => apply({ targetType: v === ALL ? "" : v })}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All types</SelectItem>
                {Object.values(AUDIT_TARGET_TYPES).map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Actor</Label>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                apply({ actor });
              }}
            >
              <Input
                value={actor}
                onChange={(e) => setActor(e.target.value)}
                onBlur={() => apply({ actor })}
                placeholder="e.g. internal-admin"
                className="w-48"
              />
            </form>
          </div>

          {hasFilters ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setActor("");
                router.push("/audit");
              }}
            >
              <X className="h-4 w-4" /> Clear
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-sm text-muted-foreground">
            <ScrollText className="h-8 w-8 opacity-40" />
            <p>{hasFilters ? "No entries match these filters." : "No audit entries yet."}</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>When</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Summary</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <AuditEntry key={row.id} row={row} />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AuditEntry({ row }: { row: AuditRow }) {
  const [open, setOpen] = React.useState(false);
  const hasDetails =
    row.targetId != null ||
    row.environment != null ||
    (row.metadata != null && Object.keys(row.metadata).length > 0);

  return (
    <>
      <TableRow
        className={hasDetails ? "cursor-pointer" : undefined}
        onClick={hasDetails ? () => setOpen((o) => !o) : undefined}
      >
        <TableCell>
          {hasDetails ? (
            open ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )
          ) : null}
        </TableCell>
        <TableCell
          className="whitespace-nowrap text-sm text-muted-foreground"
          title={new Date(row.createdAt).toLocaleString()}
        >
          {relativeTime(row.createdAt)}
        </TableCell>
        <TableCell>
          <Badge variant="secondary">{actionLabel(row.action)}</Badge>
        </TableCell>
        <TableCell className="text-sm">{row.summary}</TableCell>
        <TableCell className="font-mono text-xs">{row.actor}</TableCell>
        <TableCell>
          {row.success ? (
            <Badge variant="success">OK</Badge>
          ) : (
            <Badge variant="destructive">Failed</Badge>
          )}
        </TableCell>
      </TableRow>
      {open && hasDetails ? (
        <TableRow>
          <TableCell />
          <TableCell colSpan={5} className="bg-muted/30">
            <dl className="grid gap-1 py-1 text-xs">
              {row.targetType ? (
                <div className="flex gap-2">
                  <dt className="w-28 text-muted-foreground">Target</dt>
                  <dd className="font-mono">
                    {row.targetType}
                    {row.targetId ? ` · ${row.targetId}` : ""}
                  </dd>
                </div>
              ) : null}
              {row.environment ? (
                <div className="flex gap-2">
                  <dt className="w-28 text-muted-foreground">Environment</dt>
                  <dd className="font-mono">{row.environment}</dd>
                </div>
              ) : null}
              {row.metadata && Object.keys(row.metadata).length > 0 ? (
                <div className="flex gap-2">
                  <dt className="w-28 text-muted-foreground">Metadata</dt>
                  <dd className="min-w-0 flex-1">
                    <pre className="overflow-x-auto rounded bg-background p-2 font-mono">
                      {JSON.stringify(row.metadata, null, 2)}
                    </pre>
                  </dd>
                </div>
              ) : null}
            </dl>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}
