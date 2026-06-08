"use client";

import * as React from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
  CertificateSelect,
  CheckboxRow,
  DomainBadges,
  EnabledBadge,
  FieldError,
  RowActions,
  confirmDelete,
} from "./shared";
import type { NpmCertificate, NpmRedirectionHost } from "@/services/npm/types";
import {
  createRedirectionHostAction,
  deleteRedirectionHostAction,
  toggleRedirectionHostAction,
  updateRedirectionHostAction,
} from "@/app/actions/npm";

interface Draft {
  domain_names: string;
  forward_scheme: "auto" | "http" | "https";
  forward_domain_name: string;
  forward_http_code: number;
  preserve_path: boolean;
  certificate_id: number;
  ssl_forced: boolean;
  block_exploits: boolean;
  advanced_config: string;
}

const EMPTY: Draft = {
  domain_names: "",
  forward_scheme: "auto",
  forward_domain_name: "",
  forward_http_code: 301,
  preserve_path: true,
  certificate_id: 0,
  ssl_forced: false,
  block_exploits: true,
  advanced_config: "",
};

function toDraft(h: NpmRedirectionHost): Draft {
  return {
    domain_names: h.domain_names.join(", "),
    forward_scheme: h.forward_scheme,
    forward_domain_name: h.forward_domain_name,
    forward_http_code: h.forward_http_code,
    preserve_path: h.preserve_path,
    certificate_id: h.certificate_id ?? 0,
    ssl_forced: h.ssl_forced,
    block_exploits: h.block_exploits,
    advanced_config: h.advanced_config ?? "",
  };
}

export function RedirectionHostsTab({
  hosts,
  certificates,
}: {
  hosts: NpmRedirectionHost[];
  certificates: NpmCertificate[];
}) {
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<NpmRedirectionHost | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus /> New redirection
        </Button>
      </div>

      {hosts.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No redirections yet.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Domains</TableHead>
                  <TableHead>Redirects to</TableHead>
                  <TableHead>Code</TableHead>
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
                      {h.forward_scheme === "auto" ? "" : `${h.forward_scheme}://`}
                      {h.forward_domain_name}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{h.forward_http_code}</TableCell>
                    <TableCell>
                      <EnabledBadge enabled={h.enabled} />
                    </TableCell>
                    <TableCell>
                      <RowActions
                        label="redirection"
                        enabled={h.enabled}
                        onToggle={async () => {
                          const res = await toggleRedirectionHostAction(h.id, !h.enabled);
                          if (!res.ok) toast.error(res.error ?? "Could not update.");
                        }}
                        onEdit={() => {
                          setEditing(h);
                          setOpen(true);
                        }}
                        onDelete={() =>
                          confirmDelete(
                            `Delete redirection ${h.domain_names.join(", ")}?`,
                            async () => {
                              const res = await deleteRedirectionHostAction(h.id);
                              if (res.ok) toast.success("Redirection deleted.");
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
            <DialogTitle>{editing ? "Edit redirection" : "New redirection"}</DialogTitle>
          </DialogHeader>
          <RedirectionForm
            key={editing?.id ?? "new"}
            initial={editing ? toDraft(editing) : EMPTY}
            certificates={certificates}
            submitLabel={editing ? "Save changes" : "Create"}
            onCancel={() => setOpen(false)}
            onSubmit={async (draft) => {
              const res = editing
                ? await updateRedirectionHostAction(editing.id, draft)
                : await createRedirectionHostAction(draft);
              if (res.ok) {
                toast.success(editing ? "Redirection updated." : "Redirection created.");
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

function RedirectionForm({
  initial,
  certificates,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  initial: Draft;
  certificates: NpmCertificate[];
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
          placeholder="old.example.com"
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
              <SelectItem value="auto">auto</SelectItem>
              <SelectItem value="http">http</SelectItem>
              <SelectItem value="https">https</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Destination domain</Label>
          <Input
            value={d.forward_domain_name}
            onChange={(e) => set("forward_domain_name", e.target.value)}
            placeholder="new.example.com"
          />
          <FieldError errors={errs.forward_domain_name} />
        </div>
        <div className="space-y-1.5">
          <Label>HTTP code</Label>
          <Select
            value={String(d.forward_http_code)}
            onValueChange={(v) => set("forward_http_code", Number(v))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[300, 301, 302, 307, 308].map((c) => (
                <SelectItem key={c} value={String(c)}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <CertificateSelect
        value={d.certificate_id}
        onChange={(id) => set("certificate_id", id)}
        certificates={certificates}
      />

      <div className="grid grid-cols-2 gap-2">
        <CheckboxRow
          checked={d.preserve_path}
          onChange={(v) => set("preserve_path", v)}
          label="Preserve path"
        />
        <CheckboxRow
          checked={hasCert && d.ssl_forced}
          disabled={!hasCert}
          onChange={(v) => set("ssl_forced", v)}
          label="Force SSL"
        />
        <CheckboxRow
          checked={d.block_exploits}
          onChange={(v) => set("block_exploits", v)}
          label="Block common exploits"
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
