"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Rocket } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BUILD_PACKS } from "@/lib/coolify-validation";
import {
  createCoolifyApplicationAction,
  getCoolifyFormOptionsAction,
} from "@/app/actions/coolify";
import type { CoolifyProject, CoolifyServer } from "@/services/coolify/types";

export function CreateApplicationForm() {
  const router = useRouter();
  const [projects, setProjects] = React.useState<CoolifyProject[]>([]);
  const [servers, setServers] = React.useState<CoolifyServer[]>([]);
  const [optionsError, setOptionsError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});

  const [form, setForm] = React.useState({
    name: "",
    project_uuid: "",
    server_uuid: "",
    environment_name: "production",
    git_repository: "",
    git_branch: "main",
    build_pack: "nixpacks",
    ports_exposes: "3000",
    domains: "",
  });

  React.useEffect(() => {
    getCoolifyFormOptionsAction().then((res) => {
      if (res.ok && res.data) {
        setProjects(res.data.projects);
        setServers(res.data.servers);
      } else {
        setOptionsError(res.error ?? "Could not load projects and servers.");
      }
    });
  }, []);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setFieldErrors({});
    try {
      const res = await createCoolifyApplicationAction(form);
      if (res.ok && res.data) {
        toast.success("Application created.");
        router.push(`/coolify/${res.data.uuid}`);
      } else {
        setFieldErrors(res.fieldErrors ?? {});
        toast.error(res.error ?? "Could not create the application.");
      }
    } finally {
      setPending(false);
    }
  }

  function err(field: string) {
    return fieldErrors[field] ? (
      <p className="text-xs text-destructive">{fieldErrors[field][0]}</p>
    ) : null;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {optionsError ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {optionsError}
        </p>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="name">Application name</Label>
        <Input id="name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="my-app" />
        {err("name")}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Project</Label>
          <Select value={form.project_uuid} onValueChange={(v) => set("project_uuid", v)}>
            <SelectTrigger><SelectValue placeholder="Select a project" /></SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.uuid} value={p.uuid}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {err("project_uuid")}
        </div>
        <div className="space-y-1.5">
          <Label>Server</Label>
          <Select value={form.server_uuid} onValueChange={(v) => set("server_uuid", v)}>
            <SelectTrigger><SelectValue placeholder="Select a server" /></SelectTrigger>
            <SelectContent>
              {servers.map((s) => (
                <SelectItem key={s.uuid} value={s.uuid}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {err("server_uuid")}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="env">Environment</Label>
          <Input id="env" value={form.environment_name} onChange={(e) => set("environment_name", e.target.value)} />
          {err("environment_name")}
        </div>
        <div className="space-y-1.5">
          <Label>Build pack</Label>
          <Select value={form.build_pack} onValueChange={(v) => set("build_pack", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {BUILD_PACKS.map((b) => (
                <SelectItem key={b} value={b}>{b}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {err("build_pack")}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="repo">Git repository</Label>
        <Input id="repo" value={form.git_repository} onChange={(e) => set("git_repository", e.target.value)} placeholder="https://github.com/org/repo" />
        {err("git_repository")}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="branch">Branch</Label>
          <Input id="branch" value={form.git_branch} onChange={(e) => set("git_branch", e.target.value)} />
          {err("git_branch")}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ports">Exposed ports</Label>
          <Input id="ports" value={form.ports_exposes} onChange={(e) => set("ports_exposes", e.target.value)} placeholder="3000" />
          {err("ports_exposes")}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="domains">Domain (optional)</Label>
          <Input id="domains" value={form.domains} onChange={(e) => set("domains", e.target.value)} placeholder="https://app.example.com" />
          {err("domains")}
        </div>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Rocket />}
        Create application
      </Button>
    </form>
  );
}
