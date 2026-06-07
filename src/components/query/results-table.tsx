"use client";

import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Database,
  Download,
  FileJson,
  Rows3,
  Search,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EnvironmentBadge } from "@/components/environment-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { EnvironmentSummary } from "@/lib/environments";
import type { QueryResult } from "@/services/query/types";

const PAGE_SIZE = 25;

export function ResultsTable({
  result,
  environment,
  database,
}: {
  result: QueryResult;
  environment: Pick<EnvironmentSummary, "name" | "color">;
  database: string;
}) {
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(0);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return result.rows;
    return result.rows.filter((row) =>
      result.columns.some((c) => formatCell(row[c]).toLowerCase().includes(q)),
    );
  }, [search, result]);

  React.useEffect(() => setPage(0), [search, result]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  function exportCsv() {
    const csv = toCsv(result.columns, filtered);
    download(csv, "text/csv", `query-result-${stamp()}.csv`);
  }
  function exportJson() {
    download(
      JSON.stringify(filtered, null, 2),
      "application/json",
      `query-result-${stamp()}.json`,
    );
  }
  async function copyResults() {
    const tsv = toTsv(result.columns, filtered);
    try {
      await navigator.clipboard.writeText(tsv);
      toast.success("Results copied (TSV)");
    } catch {
      toast.error("Could not copy results");
    }
  }

  return (
    <div className="space-y-3">
      {/* Stats bar */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border bg-muted/40 px-4 py-2 text-sm">
        <Stat icon={<Rows3 className="h-4 w-4" />} label="Rows">
          {result.rowCount}
        </Stat>
        <Stat icon={<Clock className="h-4 w-4" />} label="Time">
          {result.executionTimeMs} ms
        </Stat>
        <Stat icon={<Database className="h-4 w-4" />} label="Database">
          <span className="font-mono">{database}</span>
        </Stat>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Env</span>
          <EnvironmentBadge environment={environment} />
        </div>
        {result.command ? (
          <span className="text-xs text-muted-foreground">{result.command}</span>
        ) : null}
      </div>

      {/* Toolbar */}
      {result.columns.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter results…"
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={copyResults}>
              <Copy /> Copy
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={exportJson}>
              <FileJson /> JSON
            </Button>
          </div>
        </div>
      ) : null}

      {/* Table */}
      {result.columns.length === 0 ? (
        <div className="rounded-lg border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
          {result.command
            ? `Statement executed (${result.command}). No rows returned.`
            : "No rows returned."}
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-right text-xs">#</TableHead>
                  {result.columns.map((c) => (
                    <TableHead key={c} className="whitespace-nowrap font-mono text-xs">
                      {c}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {page * PAGE_SIZE + i + 1}
                    </TableCell>
                    {result.columns.map((c) => (
                      <TableCell key={c} className="whitespace-nowrap font-mono text-xs">
                        <CellValue value={row[c]} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {filtered.length === 0
                ? "No matching rows"
                : `Showing ${page * PAGE_SIZE + 1}–${Math.min(
                    (page + 1) * PAGE_SIZE,
                    filtered.length,
                  )} of ${filtered.length}`}
              {search ? ` (filtered from ${result.rows.length})` : ""}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs">
                Page {page + 1} / {pageCount}
              </span>
              <Button
                variant="outline"
                size="icon"
                disabled={page >= pageCount - 1}
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-medium">{children}</span>
    </div>
  );
}

function CellValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="italic text-muted-foreground">NULL</span>;
  }
  return <>{formatCell(value)}</>;
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function csvEscape(value: unknown): string {
  const s = formatCell(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const head = columns.map(csvEscape).join(",");
  const body = rows.map((r) => columns.map((c) => csvEscape(r[c])).join(","));
  return [head, ...body].join("\r\n");
}

function toTsv(columns: string[], rows: Record<string, unknown>[]): string {
  const head = columns.join("\t");
  const body = rows.map((r) =>
    columns.map((c) => formatCell(r[c]).replace(/\t/g, " ")).join("\t"),
  );
  return [head, ...body].join("\n");
}

function download(content: string, type: string, filename: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}
