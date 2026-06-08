"use client";

import * as React from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AccessListSelect,
  CertificateSelect,
  CheckboxRow,
  DomainBadges,
  EnabledBadge,
  FieldError,
  RowActions,
  confirmDelete,
} from "./shared";
import type {
  NpmAccessList,
  NpmCertificate,
  NpmProxyHost,
} from "@/services/npm/types";
import {
  createProxyHostAction,
  deleteProxyHostAction,
  toggleProxyHostAction,
  updateProxyHostAction,
} from "@/app/actions/npm";

interface Draft {
  domain_names: string;
  forward_scheme: "http" | "https";
  forward_host: string;
  forward_port: string;
  certificate_id: number;
  access_list_id: number;
  ssl_forced: boolean;
  http2_support: boolean;
  hsts_enabled: boolean;
  block_exploits: boolean;
  caching_enabled: boolean;
  allow_websocket_upgrade: boolean;
  advanced_config: string;
}

const EMPTY: Draft = {
  domain_names: "",
  forward_scheme: "http",
  forward_host: "",
  forward_port: "",
  certificate_id: 0,
  access_list_id: 0,
  ssl_forced: false,
  http2_support: false,
  hsts_enabled: false,
  block_exploits: true,
  caching_enabled: false,
  allow_websocket_upgrade: true,
  advanced_config: "",
};

function toDraft(h: NpmProxyHost): Draft {
  return {
    domain_names: h.domain_names.join(", "),
    forward_scheme: h.forward_scheme,
    forward_host: h.forward_host,
    forward_port: String(h.forward_port),
    certificate_id: h.certificate_id ?? 0,
    access_list_id: h.access_list_id ?? 0,
    ssl_forced: h.ssl_forced,
    http2_support: h.http2_support,
    hsts_enabled: h.hsts_enabled,
    block_exploits: h.block_exploits,
    caching_enabled: h.caching_enabled,
    allow_websocket_upgrade: h.allow_websocket_upgrade,
    advanced_config: h.advanced_config ?? "",
  };
}

export function ProxyHostsTab({
  hosts,
  certificates,
  accessLists,
}: {
  hosts: NpmProxyHost[];
  certificates: NpmCertificate[];
  accessLists: NpmAccessList[];
}) {
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<NpmProxyHost | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus /> New proxy host
        </Button>
      </div>

      {hosts.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No proxy hosts yet.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Domains</TableHead>
                  <TableHead>Forwards to</TableHead>
                  <TableHead>SSL</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hosts.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell>
                      <DomainBadges domains={h.domain_names} />
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {h.forward_scheme}://{h.forward_host}:{h.forward_port}
                    </TableCell>
                    <TableCell>
                      {h.certificate_id > 0 ? (
                        <Badge variant={h.ssl_forced ? "success" : "secondary"}>
                          {h.ssl_forced ? "Forced" : "On"}
                        </Badge>
                      ) : (
                        <Badge variant="outline">Off</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <EnabledBadge enabled={h.enabled} />
                    </TableCell>
                    <TableCell>
                      <RowActions
                        label="proxy host"
                        enabled={h.enabled}
                        onToggle={async () => {
                          const res = await toggleProxyHostAction(h.id, !h.enabled);
                          if (!res.ok) toast.error(res.error ?? "Could not update.");
                        }}
                        onEdit={() => {
                          setEditing(h);
                          setOpen(true);
                        }}
                        onDelete={() =>
                          confirmDelete(
                            `Delete proxy host ${h.domain_names.join(", ")}?`,
                            async () => {
                              const res = await deleteProxyHostAction(h.id);
                              if (res.ok) toast.success("Proxy host deleted.");
                              else toast.error(res.error ?? "Could not delete.");
                            },
                          )
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit proxy host" : "New proxy host"}</DialogTitle>
          </DialogHeader>
          <ProxyHostForm
            key={editing?.id ?? "new"}
            initial={editing ? toDraft(editing) : EMPTY}
            certificates={certificates}
            accessLists={accessLists}
            submitLabel={editing ? "Save changes" : "Create"}
            onCancel={() => setOpen(false)}
            onSubmit={async (draft) => {
              const res = editing
                ? await updateProxyHostAction(editing.id, draft)
                : await createProxyHostAction(draft);
              if (res.ok) {
                toast.success(editing ? "Proxy host updated." : "Proxy host created.");
                setOpen(false);
              } else if (!res.fieldErrors) {
                toast.error(res.error ?? "Something went wrong.");
              }
              return res;
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProxyHostForm({
  initial,
  certificates,
  accessLists,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  initial: Draft;
  certificates: NpmCertificate[];
  accessLists: NpmAccessList[];
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (
    draft: Draft,
  ) => Promise<{ ok: boolean; fieldErrors?: Record<string, string[]> }>;
}) {
  const [d, setD] = React.useState<Draft>(initial);
  const [pending, setPending] = React.useState(false);
  const [errs, setErrs] = React.useState<Record<string, string[]>>({});
  const hasCert = d.certificate_id > 0;

  function set<K extends keyof Draft>(k: K, v: Draft[K]) {
    setD((p) => ({ ...p, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setErrs({});
    try {
      const res = await onSubmit(d);
      if (!res.ok && res.fieldErrors) setErrs(res.fieldErrors);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Domain names</Label>
        <Input
          value={d.domain_names}
          onChange={(e) => set("domain_names", e.target.value)}
          placeholder="app.example.com, www.example.com"
          autoFocus
        />
        <FieldError errors={errs.domain_names} />
      </div>

      <div className="grid gap-4 sm:grid-cols-[120px_1fr_120px]">
        <div className="space-y-1.5">
          <Label>Scheme</Label>
          <Select
            value={d.forward_scheme}
            onValueChange={(v) => set("forward_scheme", v as Draft["forward_scheme"])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="http">http</SelectItem>
              <SelectItem value="https">https</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Forward host</Label>
          <Input
            value={d.forward_host}
            onChange={(e) => set("forward_host", e.target.value)}
            placeholder="10.0.0.5 or container name"
          />
          <FieldError errors={errs.forward_host} />
        </div>
        <div className="space-y-1.5">
          <Label>Port</Label>
          <Input
            value={d.forward_port}
            onChange={(e) => set("forward_port", e.target.value)}
            placeholder="3000"
            inputMode="numeric"
          />
          <FieldError errors={errs.forward_port} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <CertificateSelect
          value={d.certificate_id}
          onChange={(id) => set("certificate_id", id)}
          certificates={certificates}
        />
        <AccessListSelect
          value={d.access_list_id}
          onChange={(id) => set("access_list_id", id)}
          accessLists={accessLists}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <CheckboxRow
          checked={hasCert && d.ssl_forced}
          disabled={!hasCert}
          onChange={(v) => set("ssl_forced", v)}
          label="Force SSL"
        />
        <CheckboxRow
          checked={hasCert && d.http2_support}
          disabled={!hasCert}
          onChange={(v) => set("http2_support", v)}
          label="HTTP/2"
        />
        <CheckboxRow
          checked={hasCert && d.hsts_enabled}
          disabled={!hasCert}
          onChange={(v) => set("hsts_enabled", v)}
          label="HSTS"
        />
        <CheckboxRow
          checked={d.block_exploits}
          onChange={(v) => set("block_exploits", v)}
          label="Block common exploits"
        />
        <CheckboxRow
          checked={d.caching_enabled}
          onChange={(v) => set("caching_enabled", v)}
          label="Cache assets"
        />
        <CheckboxRow
          checked={d.allow_websocket_upgrade}
          onChange={(v) => set("allow_websocket_upgrade", v)}
          label="Websockets support"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Advanced config (optional)</Label>
        <Textarea
          value={d.advanced_config}
          onChange={(e) => set("advanced_config", e.target.value)}
          rows={3}
          className="font-mono text-xs"
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
