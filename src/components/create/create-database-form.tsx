"use client";

import * as React from "react";
import { Loader2, RefreshCw, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProvisionResultPanel } from "@/components/create/provision-result";
import {
  createDatabaseAction,
  type ProvisionActionResult,
} from "@/app/actions/provision";
import { generatePasswordAction } from "@/app/actions/utils";
import { deriveDatabaseName, deriveUsername } from "@/lib/naming";
import type { Environment, EnvironmentSummary } from "@/lib/environments";

interface Props {
  configured: Record<Environment, boolean>;
  environments: EnvironmentSummary[];
}

export function CreateDatabaseForm({ configured, environments }: Props) {
  const [environment, setEnvironment] = React.useState<Environment>(
    environments.find((e) => configured[e.key])?.key ?? environments[0]?.key ?? "",
  );
  const selectedEnv = environments.find((e) => e.key === environment);
  const [appName, setAppName] = React.useState("");
  const [dbName, setDbName] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [generate, setGenerate] = React.useState(true);
  const [password, setPassword] = React.useState("");
  const [notes, setNotes] = React.useState("");

  // Track manual edits so we stop auto-deriving once the user takes control.
  const dbEdited = React.useRef(false);
  const userEdited = React.useRef(false);

  const [pending, setPending] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<
    Record<string, string[]>
  >({});
  const [result, setResult] =
    React.useState<ProvisionActionResult["data"]>();

  const requestPassword = React.useCallback(async () => {
    const pw = await generatePasswordAction();
    setPassword(pw);
  }, []);

  // Generate an initial password on mount.
  React.useEffect(() => {
    void requestPassword();
  }, [requestPassword]);

  // Re-derive db name / username from app name + environment unless edited.
  React.useEffect(() => {
    if (!dbEdited.current) {
      setDbName(appName ? deriveDatabaseName(appName, selectedEnv?.abbreviation ?? null) : "");
    }
    if (!userEdited.current) {
      setUsername(appName ? deriveUsername(appName, selectedEnv?.abbreviation ?? null) : "");
    }
  }, [appName, selectedEnv?.abbreviation]);

  function resetForm() {
    setAppName("");
    setDbName("");
    setUsername("");
    setNotes("");
    setGenerate(true);
    dbEdited.current = false;
    userEdited.current = false;
    setFieldErrors({});
    setResult(undefined);
    void requestPassword();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setFieldErrors({});
    setResult(undefined);
    try {
      const res = await createDatabaseAction({
        environment,
        applicationName: appName,
        databaseName: dbName,
        username,
        password,
        notes,
      });
      if (res.ok && res.data) {
        setResult(res.data);
        toast.success(
          res.data.status === "created"
            ? "Database provisioned successfully."
            : "Target already existed — credentials refreshed.",
        );
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

  if (result) {
    return (
      <ProvisionResultPanel
        results={[{ ...result, ok: true, environment: { key: result.environment, name: selectedEnv?.name ?? result.environment, color: selectedEnv?.color ?? "slate" } }]}
        onDone={resetForm}
        doneLabel="Create another"
      />
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Field label="Environment" error={fieldErrors.environment}>
        <Select
          value={environment}
          onValueChange={(v) => setEnvironment(v as Environment)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {environments.map((env) => (
              <SelectItem key={env.key} value={env.key} disabled={!configured[env.key]}>
                {env.name}
                {!configured[env.key] ? " — not configured" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field
        label="Application name"
        error={fieldErrors.applicationName}
        hint="A friendly name. The database and username are derived from this."
      >
        <Input
          value={appName}
          onChange={(e) => setAppName(e.target.value)}
          placeholder="e.g. orders-api"
          autoFocus
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Database name"
          error={fieldErrors.databaseName}
          hint="Auto-generated; editable."
        >
          <Input
            value={dbName}
            onChange={(e) => {
              dbEdited.current = true;
              setDbName(e.target.value);
            }}
            className="font-mono"
            placeholder="orders_api"
          />
        </Field>
        <Field
          label="Database username"
          error={fieldErrors.username}
          hint="Auto-generated; editable."
        >
          <Input
            value={username}
            onChange={(e) => {
              userEdited.current = true;
              setUsername(e.target.value);
            }}
            className="font-mono"
            placeholder="orders_api_user"
          />
        </Field>
      </div>

      <div className="space-y-2 rounded-lg border p-4">
        <div className="flex items-center gap-2">
          <Checkbox
            id="generate"
            checked={generate}
            onCheckedChange={(c) => {
              const on = c === true;
              setGenerate(on);
              if (on) {
                void requestPassword();
              } else {
                setPassword("");
              }
            }}
          />
          <Label htmlFor="generate" className="cursor-pointer">
            Generate strong password
          </Label>
        </div>
        <Field label="Password" error={fieldErrors.password}>
          <div className="flex gap-2">
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              readOnly={generate}
              type="text"
              className="font-mono"
              placeholder="Enter a password"
            />
            {generate ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => void requestPassword()}
                aria-label="Regenerate password"
              >
                <RefreshCw />
              </Button>
            ) : null}
          </div>
        </Field>
        <p className="text-xs text-muted-foreground">
          The password is shown once here and never stored. You&apos;ll get the
          full connection string after creation.
        </p>
      </div>

      <Field label="Notes (optional)" error={fieldErrors.notes}>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything worth recording about this database."
          rows={2}
        />
      </Field>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Create database
        </Button>
        <Button type="button" variant="outline" onClick={resetForm}>
          <RotateCcw /> Reset form
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error?.length ? (
        <p className="text-xs text-destructive">{error[0]}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
