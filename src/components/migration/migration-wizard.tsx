"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Info, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import type {
  MigrationOptions,
  MigrationPreview,
} from "@/app/actions/migration";
import {
  validateMigrationAction,
  createMigrationAction,
} from "@/app/actions/migration";
import type { MigrationType } from "@/lib/migration";

export function MigrationWizard({ options }: { options: MigrationOptions }) {
  const router = useRouter();
  const [sourceResourceId, setSourceResourceId] = React.useState(options.resources[0]?.id ?? "");
  const [migrationType, setMigrationType] = React.useState<MigrationType>("migrate");
  const [destinationHost, setDestinationHost] = React.useState("");
  const [destinationResourceName, setDestinationResourceName] = React.useState("");
  const [preview, setPreview] = React.useState<MigrationPreview | null>(null);
  const [npmEnabled, setNpmEnabled] = React.useState(false);
  const [cloudflareEnabled, setCloudflareEnabled] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const source = options.resources.find((r) => r.id === sourceResourceId);
  const destinations = options.hosts.filter((h) => h.id !== source?.hostId);

  // Until the user types a custom destination name, it follows the selected
  // source resource (updating whenever the source changes).
  const nameTouched = React.useRef(false);
  React.useEffect(() => {
    if (source && !nameTouched.current) setDestinationResourceName(source.name);
  }, [source]);

  async function runValidation() {
    setBusy(true);
    const res = await validateMigrationAction({
      migrationType,
      sourceResourceId,
      destinationHost,
      destinationResourceName,
    });
    setBusy(false);
    if (!res.ok || !res.data) {
      toast.error(res.error ?? "Validation could not run. Check the fields.");
      return;
    }
    setPreview(res.data);
    setNpmEnabled(res.data.report.defaults.npmEnabled);
    setCloudflareEnabled(res.data.report.defaults.cloudflareEnabled);
  }

  async function execute() {
    setBusy(true);
    const res = await createMigrationAction({
      migrationType,
      sourceResourceId,
      destinationHost,
      destinationResourceName,
      npmEnabled,
      cloudflareEnabled,
    });
    setBusy(false);
    if (!res.ok || !res.data) {
      toast.error(res.error ?? "Could not create the migration.");
      return;
    }
    router.push(`/migrations/${res.data.id}`);
  }

  const validationOk = preview?.report.ok ?? false;

  return (
    <div className="space-y-6">
      {/* Step 1: Resource */}
      <Card>
        <CardHeader>
          <CardTitle>1 · Select resource</CardTitle>
          <CardDescription>The Coolify resource to {migrationType}.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select value={sourceResourceId} onValueChange={(v) => { setSourceResourceId(v); setPreview(null); }}>
            <SelectTrigger><SelectValue placeholder="Choose a resource" /></SelectTrigger>
            <SelectContent>
              {options.resources.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                  {r.hostName ? ` (${r.hostName})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {source ? (
            <p className="text-xs text-muted-foreground">
              Host: {source.hostName} · Domains: {source.domains.join(", ") || "none"}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* Step 2: Type */}
      <Card>
        <CardHeader>
          <CardTitle>2 · Migration type</CardTitle>
          <CardDescription>Clone is a non-destructive copy. Migrate moves and cuts over after approval.</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={migrationType} onValueChange={(v) => { setMigrationType(v as MigrationType); setPreview(null); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="migrate">Migrate (move + cutover)</SelectItem>
              <SelectItem value="clone">Clone (copy only)</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Step 3: Destination */}
      <Card>
        <CardHeader>
          <CardTitle>3 · Destination host</CardTitle>
          <CardDescription>Where the {migrationType === "clone" ? "copy" : "resource"} will run.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select value={destinationHost} onValueChange={(v) => { setDestinationHost(v); setPreview(null); }}>
            <SelectTrigger><SelectValue placeholder="Choose a destination host" /></SelectTrigger>
            <SelectContent>
              {destinations.map((h) => (
                <SelectItem key={h.id} value={h.id}>
                  {h.name}
                  {h.capacity.metricsAvailable
                    ? ` (${h.capacity.freeMemoryMb} MB RAM, ${h.capacity.freeDiskMb} MB disk free)`
                    : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="space-y-1.5">
            <Label htmlFor="destName">Destination resource name</Label>
            <Input
              id="destName"
              value={destinationResourceName}
              onChange={(e) => { nameTouched.current = true; setDestinationResourceName(e.target.value); setPreview(null); }}
            />
          </div>
          <Button
            onClick={runValidation}
            disabled={busy || !sourceResourceId || !destinationHost || !destinationResourceName}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Validate
          </Button>
        </CardContent>
      </Card>

      {/* Step 4: Validation results */}
      {preview ? (
        <Card>
          <CardHeader>
            <CardTitle>4 · Validation</CardTitle>
            <CardDescription>
              Exposure: <span className="font-medium capitalize">{preview.report.exposure}</span> ·
              Volumes detected: {preview.report.volumes.length}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {preview.report.checks.map((c) => (
              <div key={c.key} className="flex items-start gap-2 text-sm">
                {c.advisory ? (
                  <Info className="mt-0.5 h-4 w-4 text-muted-foreground" />
                ) : c.pass ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 text-red-500" />
                )}
                <span className={c.advisory ? "text-muted-foreground" : undefined}>
                  <span className="font-medium">{c.label}</span>: {c.detail}
                </span>
              </div>
            ))}
            {migrationType === "migrate" ? (
              <div className="space-y-2 pt-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={npmEnabled} onCheckedChange={(v) => setNpmEnabled(Boolean(v))} />
                  Update NPM on cutover
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={cloudflareEnabled} onCheckedChange={(v) => setCloudflareEnabled(Boolean(v))} />
                  Update Cloudflare on cutover
                </label>
              </div>
            ) : null}
            <Button disabled={!validationOk || busy} onClick={execute}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {migrationType === "clone" ? "Clone" : "Migrate"}
            </Button>
            {!validationOk ? (
              <p className="text-xs text-red-500">Fix the failing checks above (rename the destination if it is a duplicate) and re-validate.</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

    </div>
  );
}
