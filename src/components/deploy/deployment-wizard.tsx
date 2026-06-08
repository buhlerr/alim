"use client";

import * as React from "react";
import {
  CheckCircle2,
  Copy,
  Check,
  Loader2,
  MinusCircle,
  Rocket,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

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
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckboxRow } from "@/components/npm/shared";
import { BUILD_PACKS } from "@/lib/coolify-validation";
import { DNS_RECORD_TYPES } from "@/lib/cloudflare-validation";
import type { DeploymentOptions } from "@/app/actions/deploy";
import { runDeploymentAction } from "@/app/actions/deploy";
import type { DeploymentResult, DeploymentStepResult } from "@/services/deployment/types";

interface CoolifyDraft {
  project_uuid: string;
  server_uuid: string;
  environment_name: string;
  git_repository: string;
  git_branch: string;
  build_pack: string;
  ports_exposes: string;
  name: string;
  domains: string;
}

interface DnsDraft {
  type: string;
  name: string;
  content: string;
  proxied: boolean;
}

export function DeploymentWizard({ options }: { options: DeploymentOptions }) {
  const [applicationName, setApplicationName] = React.useState("");
  const [databaseEnabled, setDatabaseEnabled] = React.useState(false);
  const [databaseEnvironment, setDatabaseEnvironment] = React.useState(
    options.environments[0]?.key ?? "",
  );
  const [coolifyEnabled, setCoolifyEnabled] = React.useState(false);
  const [coolify, setCoolify] = React.useState<CoolifyDraft>({
    project_uuid: "",
    server_uuid: "",
    environment_name: "production",
    git_repository: "",
    git_branch: "main",
    build_pack: "nixpacks",
    ports_exposes: "3000",
    name: "",
    domains: "",
  });
  const [dnsEnabled, setDnsEnabled] = React.useState(false);
  const [dnsZoneId, setDnsZoneId] = React.useState(options.cloudflare.zones[0]?.id ?? "");
  const [dns, setDns] = React.useState<DnsDraft>({
    type: "A",
    name: "",
    content: "",
    proxied: true,
  });

  const [running, setRunning] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});
  const [result, setResult] = React.useState<DeploymentResult | null>(null);

  function setCf<K extends keyof CoolifyDraft>(k: K, v: CoolifyDraft[K]) {
    setCoolify((p) => ({ ...p, [k]: v }));
  }
  function setDnsField<K extends keyof DnsDraft>(k: K, v: DnsDraft[K]) {
    setDns((p) => ({ ...p, [k]: v }));
  }

  async function deploy() {
    setRunning(true);
    setErrors({});
    setResult(null);
    try {
      const res = await runDeploymentAction({
        applicationName,
        databaseEnabled,
        databaseEnvironment,
        coolifyEnabled,
        coolify,
        dnsEnabled,
        dnsZoneId,
        dns,
      });
      if (res.ok && res.data) {
        setResult(res.data);
        toast[res.data.ok ? "success" : "warning"](
          res.data.ok ? "Deployment finished." : "Deployment finished with errors.",
        );
      } else {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error ?? "Could not run the deployment.");
      }
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Application</CardTitle>
          <CardDescription>
            A name used to derive the database, app, and record names.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            <Label>Application name</Label>
            <Input
              value={applicationName}
              onChange={(e) => setApplicationName(e.target.value)}
              placeholder="myapp"
              autoFocus
            />
            {errors.applicationName ? (
              <p className="text-xs text-destructive">{errors.applicationName[0]}</p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Database step */}
      <StepCard
        title="Database"
        description="Provision a PostgreSQL database + user."
        enabled={databaseEnabled}
        onToggle={setDatabaseEnabled}
        available={options.environments.length > 0}
        unavailableNote="No environments are defined yet."
      >
        <div className="space-y-1.5">
          <Label>Environment</Label>
          <Select value={databaseEnvironment} onValueChange={setDatabaseEnvironment}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select an environment" />
            </SelectTrigger>
            <SelectContent>
              {options.environments.map((e) => (
                <SelectItem key={e.key} value={e.key}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.databaseEnvironment ? (
            <p className="text-xs text-destructive">{errors.databaseEnvironment[0]}</p>
          ) : null}
        </div>
      </StepCard>

      {/* Coolify step */}
      <StepCard
        title="Coolify application"
        description="Create a public app and trigger a deploy."
        enabled={coolifyEnabled}
        onToggle={setCoolifyEnabled}
        available={options.coolify.configured}
        unavailableNote="Coolify is not configured."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Project</Label>
            <Select value={coolify.project_uuid} onValueChange={(v) => setCf("project_uuid", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent>
                {options.coolify.projects.map((p) => (
                  <SelectItem key={p.uuid} value={p.uuid}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Server</Label>
            <Select value={coolify.server_uuid} onValueChange={(v) => setCf("server_uuid", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a server" />
              </SelectTrigger>
              <SelectContent>
                {options.coolify.servers.map((s) => (
                  <SelectItem key={s.uuid} value={s.uuid}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Git repository</Label>
            <Input
              value={coolify.git_repository}
              onChange={(e) => setCf("git_repository", e.target.value)}
              placeholder="https://github.com/you/app"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Branch</Label>
            <Input value={coolify.git_branch} onChange={(e) => setCf("git_branch", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Build pack</Label>
            <Select value={coolify.build_pack} onValueChange={(v) => setCf("build_pack", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUILD_PACKS.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Exposed port</Label>
            <Input
              value={coolify.ports_exposes}
              onChange={(e) => setCf("ports_exposes", e.target.value)}
              inputMode="numeric"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Domains (optional)</Label>
            <Input
              value={coolify.domains}
              onChange={(e) => setCf("domains", e.target.value)}
              placeholder="https://app.example.com"
            />
          </div>
        </div>
        {errors.coolify ? (
          <p className="mt-2 text-xs text-destructive">{errors.coolify[0]}</p>
        ) : null}
      </StepCard>

      {/* Cloudflare DNS step */}
      <StepCard
        title="Cloudflare DNS"
        description="Point a DNS record at the app."
        enabled={dnsEnabled}
        onToggle={setDnsEnabled}
        available={options.cloudflare.configured && options.cloudflare.zones.length > 0}
        unavailableNote="Cloudflare is not configured (or no zones)."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Zone</Label>
            <Select value={dnsZoneId} onValueChange={setDnsZoneId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a zone" />
              </SelectTrigger>
              <SelectContent>
                {options.cloudflare.zones.map((z) => (
                  <SelectItem key={z.id} value={z.id}>
                    {z.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.dnsZoneId ? (
              <p className="text-xs text-destructive">{errors.dnsZoneId[0]}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={dns.type} onValueChange={(v) => setDnsField("type", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DNS_RECORD_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input
              value={dns.name}
              onChange={(e) => setDnsField("name", e.target.value)}
              placeholder="app.example.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Content</Label>
            <Input
              value={dns.content}
              onChange={(e) => setDnsField("content", e.target.value)}
              placeholder="1.2.3.4"
              className="font-mono"
            />
          </div>
          <div className="sm:col-span-2">
            <CheckboxRow
              checked={dns.proxied}
              onChange={(v) => setDnsField("proxied", v)}
              label="Proxy through Cloudflare"
            />
          </div>
        </div>
        {errors.dns ? <p className="mt-2 text-xs text-destructive">{errors.dns[0]}</p> : null}
      </StepCard>

      <div className="flex items-center gap-3">
        <Button onClick={deploy} disabled={running} size="lg">
          {running ? <Loader2 className="animate-spin" /> : <Rocket />}
          Deploy
        </Button>
        {running ? (
          <span className="text-sm text-muted-foreground">Running steps…</span>
        ) : null}
      </div>

      {result ? <ResultReport result={result} /> : null}
    </div>
  );
}

function StepCard({
  title,
  description,
  enabled,
  onToggle,
  available,
  unavailableNote,
  children,
}: {
  title: string;
  description: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  available: boolean;
  unavailableNote: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={!available ? "opacity-70" : undefined}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          {available ? (
            <CheckboxRow checked={enabled} onChange={onToggle} label="Include" />
          ) : (
            <Link href="/settings" className="text-xs text-muted-foreground underline">
              Configure
            </Link>
          )}
        </div>
      </CardHeader>
      {available && enabled ? (
        <CardContent>{children}</CardContent>
      ) : !available ? (
        <CardContent className="pt-0 text-xs text-muted-foreground">{unavailableNote}</CardContent>
      ) : null}
    </Card>
  );
}

function ResultReport({ result }: { result: DeploymentResult }) {
  return (
    <Card className={result.ok ? "border-emerald-300" : "border-amber-300"}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          {result.ok ? "Deployment complete" : "Deployment finished with errors"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {result.steps.map((step) => (
          <StepRow key={step.key} step={step} />
        ))}
      </CardContent>
    </Card>
  );
}

function StepRow({ step }: { step: DeploymentStepResult }) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    if (!step.secret) return;
    try {
      await navigator.clipboard.writeText(step.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy.");
    }
  }

  return (
    <div className="flex items-start gap-3 rounded-md border px-3 py-2 text-sm">
      <div className="mt-0.5">
        {step.status === "success" ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        ) : step.status === "failed" ? (
          <XCircle className="h-4 w-4 text-destructive" />
        ) : (
          <MinusCircle className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{step.label}</span>
          <Badge
            variant={
              step.status === "success"
                ? "success"
                : step.status === "failed"
                  ? "destructive"
                  : "outline"
            }
          >
            {step.status}
          </Badge>
        </div>
        {step.detail ? <p className="text-muted-foreground">{step.detail}</p> : null}
        {step.error ? <p className="text-destructive">{step.error}</p> : null}
        {step.secret ? (
          <div className="mt-1 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-xs">
              {step.secret}
            </code>
            <Button variant="ghost" size="icon" onClick={copy} aria-label="Copy connection string">
              {copied ? (
                <Check className="h-4 w-4 text-emerald-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        ) : null}
        {step.secret ? (
          <p className="text-[11px] text-amber-600">
            Connection string with password — shown once, copy it now.
          </p>
        ) : null}
      </div>
    </div>
  );
}
