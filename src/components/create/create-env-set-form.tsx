"use client";

import * as React from "react";
import { Layers, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ProvisionResultPanel,
  type ProvisionResultItem,
} from "@/components/create/provision-result";
import { createEnvSetAction } from "@/app/actions/provision";
import { deriveDatabaseName, deriveUsername } from "@/lib/naming";
import { ENVIRONMENTS } from "@/lib/environments";

export function CreateEnvSetForm() {
  const [appName, setAppName] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<
    Record<string, string[]>
  >({});
  const [results, setResults] = React.useState<ProvisionResultItem[]>();

  function reset() {
    setAppName("");
    setNotes("");
    setFieldErrors({});
    setResults(undefined);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setFieldErrors({});
    setResults(undefined);
    try {
      const res = await createEnvSetAction({
        applicationName: appName,
        notes,
      });
      if (res.results) {
        setResults(
          res.results.map((r) => ({
            ...r,
            environment: { key: r.environment as string, name: r.environment as string, color: "slate" },
          })) as ProvisionResultItem[],
        );
        const okCount = res.results.filter((r) => r.ok).length;
        if (okCount === res.results.length) {
          toast.success("Full environment set provisioned.");
        } else if (okCount > 0) {
          toast.warning(`Provisioned ${okCount} of ${res.results.length}.`);
        } else {
          toast.error(res.error ?? "Provisioning failed.");
        }
      } else {
        if (res.fieldErrors) setFieldErrors(res.fieldErrors);
        toast.error(res.error ?? "Provisioning failed.");
      }
    } catch {
      toast.error("Unexpected error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  if (results) {
    return (
      <ProvisionResultPanel
        results={results}
        onDone={reset}
        doneLabel="Create another set"
      />
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <Label>Application name</Label>
        <Input
          value={appName}
          onChange={(e) => setAppName(e.target.value)}
          placeholder="e.g. orders-api"
          autoFocus
        />
        {fieldErrors.applicationName?.length ? (
          <p className="text-xs text-destructive">
            {fieldErrors.applicationName[0]}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            One click creates production, staging, and development databases
            and users on their respective servers.
          </p>
        )}
      </div>

      {appName ? (
        <div className="rounded-lg border bg-muted/40 p-4">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Will create
          </p>
          <div className="space-y-1 font-mono text-xs">
            {ENVIRONMENTS.map((env) => (
              <div key={env} className="flex flex-wrap gap-x-2">
                <span className="text-muted-foreground">
                  {env.toLowerCase()}:
                </span>
                <span>{deriveDatabaseName(appName, env)}</span>
                <span className="text-muted-foreground">/</span>
                <span>{deriveUsername(appName, env)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label>Notes (optional)</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Applied to all three records."
          rows={2}
        />
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Layers />
          )}
          Create full environment set
        </Button>
        <Button type="button" variant="outline" onClick={reset}>
          <RotateCcw /> Reset
        </Button>
      </div>
    </form>
  );
}
