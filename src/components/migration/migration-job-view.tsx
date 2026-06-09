"use client";

import * as React from "react";
import {
  CheckCircle2,
  Circle,
  Loader2,
  MinusCircle,
  XCircle,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  advanceMigrationAction,
  approveMigrationAction,
  rollbackMigrationAction,
  getMigrationJobAction,
} from "@/app/actions/migration";
import type { MigrationJobWithRelations } from "@/services/migration/store";
import { isTerminalStatus } from "@/lib/migration";
import { MigrationStatusBadge } from "./migration-status-badge";

function StepIcon({ status }: { status: string }) {
  if (status === "success") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === "failed") return <XCircle className="h-4 w-4 text-red-500" />;
  if (status === "skipped") return <MinusCircle className="h-4 w-4 text-muted-foreground" />;
  if (status === "running") return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
  return <Circle className="h-4 w-4 text-muted-foreground/40" />;
}

export function MigrationJobView({
  initialJob,
}: {
  initialJob: MigrationJobWithRelations;
}) {
  const [job, setJob] = React.useState(initialJob);
  const [acting, setActing] = React.useState(false);
  const advancing = React.useRef(false);

  const driving =
    !isTerminalStatus(job.status) && job.status !== "awaiting_approval";

  React.useEffect(() => {
    if (!driving) return;
    let cancelled = false;

    async function tick() {
      if (advancing.current) return;
      advancing.current = true;
      const res = await advanceMigrationAction(job.id);
      advancing.current = false;
      if (cancelled) return;
      if (res.ok && res.data) setJob(res.data);
    }

    const timer = setInterval(tick, 1200);
    void tick();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [driving, job.id]);

  async function refresh() {
    const res = await getMigrationJobAction(job.id);
    if (res.ok && res.data) setJob(res.data);
  }

  async function approve() {
    setActing(true);
    const res = await approveMigrationAction(job.id);
    setActing(false);
    if (!res.ok || !res.data) {
      toast.error(res.error ?? "Approval failed.");
      return;
    }
    setJob(res.data);
  }

  async function rollback() {
    setActing(true);
    const res = await rollbackMigrationAction(job.id);
    setActing(false);
    if (!res.ok || !res.data) {
      toast.error(res.error ?? "Rollback failed.");
      return;
    }
    setJob(res.data);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <MigrationStatusBadge status={job.status} />
        {driving ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Executing…
          </span>
        ) : null}
        <Button variant="ghost" size="sm" onClick={refresh}>Refresh</Button>
      </div>

      {job.errorMessage ? (
        <Card className="border-red-500/40">
          <CardContent className="pt-6 text-sm text-red-500">{job.errorMessage}</CardContent>
        </Card>
      ) : null}

      {job.status === "awaiting_approval" ? (
        <Card className="border-amber-500/40">
          <CardHeader>
            <CardTitle>Approval required</CardTitle>
            <CardDescription>
              Validate the migrated resource, then authorize production cutover. The source
              remains intact until you approve.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {job.validationUrl ? (
              <Button asChild variant="secondary">
                <a href={job.validationUrl} target="_blank" rel="noreferrer">
                  Open validation URL <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            ) : null}
            <div className="flex gap-2">
              <Button onClick={approve} disabled={acting}>
                {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Approve cutover
              </Button>
              <Button variant="destructive" onClick={rollback} disabled={acting}>
                Rollback migration
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle>Progress</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {job.steps.map((s) => (
            <div key={s.key} className="flex items-start gap-2 text-sm">
              <StepIcon status={s.status} />
              <span className="flex-1">
                <span className="font-medium">{s.label}</span>
                {s.detail ? <span className="text-muted-foreground">: {s.detail}</span> : null}
                {s.attemptNumber > 1 ? (
                  <span className="text-xs text-muted-foreground"> (attempt {s.attemptNumber})</span>
                ) : null}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Logs</CardTitle></CardHeader>
        <CardContent>
          <div className="max-h-80 overflow-y-auto rounded-md bg-muted/50 p-3 font-mono text-xs">
            {job.logs.length === 0 ? (
              <p className="text-muted-foreground">No logs yet.</p>
            ) : (
              job.logs.map((l) => (
                <div
                  key={l.id}
                  className={
                    l.level === "error"
                      ? "text-red-500"
                      : l.level === "warn"
                        ? "text-amber-500"
                        : "text-foreground/80"
                  }
                >
                  [{new Date(l.createdAt).toLocaleTimeString()}] {l.stepKey ? `${l.stepKey}: ` : ""}
                  {l.message}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
