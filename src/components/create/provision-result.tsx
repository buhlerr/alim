"use client";

import { CheckCircle2, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConnectionString } from "@/components/connection-string";
import { EnvironmentBadge } from "@/components/environment-badge";
import { Separator } from "@/components/ui/separator";

export interface ProvisionResultItem {
  environment: { key: string; name: string; color: string };
  ok: boolean;
  error?: string;
  databaseName?: string;
  username?: string;
  host?: string;
  port?: number;
  status?: "created" | "already_existed";
  connectionString?: string;
}

export function ProvisionResultPanel({
  results,
  onDone,
  doneLabel = "Done",
}: {
  results: ProvisionResultItem[];
  onDone: () => void;
  doneLabel?: string;
}) {
  const successes = results.filter((r) => r.ok);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/40 p-4">
        <div className="flex items-center gap-2">
          {successes.length === results.length ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          ) : (
            <XCircle className="h-5 w-5 text-amber-500" />
          )}
          <p className="text-sm font-medium">
            {successes.length} of {results.length} provisioned successfully.
          </p>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Copy the connection strings now — passwords are not stored and cannot
          be retrieved later.
        </p>
      </div>

      {results.map((r) => (
        <Card key={r.environment.key}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <EnvironmentBadge environment={r.environment} />
              {r.ok ? (
                <span className="text-sm font-normal text-muted-foreground">
                  {r.databaseName} ·{" "}
                  {r.status === "already_existed"
                    ? "already existed (credentials refreshed)"
                    : "created"}
                </span>
              ) : (
                <span className="text-sm font-normal text-destructive">
                  failed
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {r.ok ? (
              <>
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <Detail label="Database" value={r.databaseName} mono />
                  <Detail label="Username" value={r.username} mono />
                  <Detail label="Host" value={r.host} mono />
                  <Detail label="Port" value={String(r.port ?? 5432)} mono />
                </div>
                <Separator />
                {r.connectionString ? (
                  <ConnectionString
                    label="DATABASE_URL"
                    value={r.connectionString}
                  />
                ) : null}
              </>
            ) : (
              <p className="text-sm text-destructive">{r.error}</p>
            )}
          </CardContent>
        </Card>
      ))}

      <Button onClick={onDone}>{doneLabel}</Button>
    </div>
  );
}

function Detail({
  label,
  value,
  mono,
}: {
  label: string;
  value?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={mono ? "font-mono text-sm" : "text-sm"}>{value ?? "—"}</p>
    </div>
  );
}
