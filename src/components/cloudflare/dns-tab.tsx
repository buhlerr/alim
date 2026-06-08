"use client";

import * as React from "react";
import { Loader2, Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { CheckboxRow } from "@/components/npm/shared";
import { ZonePicker } from "./zone-picker";
import { DNS_RECORD_TYPES } from "@/lib/cloudflare-validation";
import type { CfDnsRecord, CfZone } from "@/services/cloudflare/types";
import {
  createDnsRecordAction,
  deleteDnsRecordAction,
  getDnsRecordsAction,
  updateDnsRecordAction,
} from "@/app/actions/cloudflare";

interface Draft {
  type: string;
  name: string;
  content: string;
  proxied: boolean;
  ttl: string;
}

const EMPTY: Draft = {
  type: "A",
  name: "",
  content: "",
  proxied: false,
  ttl: "1",
};

function toDraft(r: CfDnsRecord): Draft {
  return {
    type: r.type,
    name: r.name,
    content: r.content,
    proxied: Boolean(r.proxied),
    ttl: String(r.ttl ?? 1),
  };
}

export function DnsTab({ zones }: { zones: CfZone[] }) {
  const [zoneId, setZoneId] = React.useState(zones[0]?.id ?? "");
  const [records, setRecords] = React.useState<CfDnsRecord[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<CfDnsRecord | null>(null);

  const load = React.useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    const res = await getDnsRecordsAction(id);
    if (res.ok) setRecords(res.data ?? []);
    else toast.error(res.error ?? "Could not load records.");
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load(zoneId);
  }, [zoneId, load]);

  if (zones.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No zones available for this API token.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <ZonePicker zones={zones} value={zoneId} onChange={setZoneId} />
        <Button
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus /> New record
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading records…
        </div>
      ) : records.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No DNS records in this zone.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Content</TableHead>
                  <TableHead>Proxied</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Badge variant="secondary">{r.type}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.name}</TableCell>
                    <TableCell className="max-w-xs truncate font-mono text-xs">
                      {r.content}
                    </TableCell>
                    <TableCell>
                      {r.proxied ? (
                        <Badge variant="success">Proxied</Badge>
                      ) : (
                        <Badge variant="outline">DNS only</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Edit"
                          onClick={() => {
                            setEditing(r);
                            setOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <DeleteRecordButton
                          zoneId={zoneId}
                          record={r}
                          onDone={() => load(zoneId)}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit DNS record" : "New DNS record"}</DialogTitle>
          </DialogHeader>
          <DnsForm
            key={editing?.id ?? "new"}
            initial={editing ? toDraft(editing) : EMPTY}
            submitLabel={editing ? "Save changes" : "Create"}
            onCancel={() => setOpen(false)}
            onSubmit={async (draft) => {
              const res = editing
                ? await updateDnsRecordAction(zoneId, editing.id, draft)
                : await createDnsRecordAction(zoneId, draft);
              if (res.ok) {
                toast.success(editing ? "Record updated." : "Record created.");
                setOpen(false);
                await load(zoneId);
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

function DeleteRecordButton({
  zoneId,
  record,
  onDone,
}: {
  zoneId: string;
  record: CfDnsRecord;
  onDone: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={busy}
      aria-label="Delete"
      onClick={async () => {
        if (!window.confirm(`Delete ${record.type} record ${record.name}?`)) return;
        setBusy(true);
        try {
          const res = await deleteDnsRecordAction(zoneId, record.id);
          if (res.ok) {
            toast.success("Record deleted.");
            onDone();
          } else toast.error(res.error ?? "Could not delete.");
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
    </Button>
  );
}

function DnsForm({
  initial,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  initial: Draft;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (
    draft: Draft,
  ) => Promise<{ ok: boolean; fieldErrors?: Record<string, string[]> }>;
}) {
  const [d, setD] = React.useState<Draft>(initial);
  const [pending, setPending] = React.useState(false);
  const [errs, setErrs] = React.useState<Record<string, string[]>>({});

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
      <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
        <div className="space-y-1.5">
          <Label>Type</Label>
          <Select value={d.type} onValueChange={(v) => set("type", v)}>
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
            value={d.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="app or app.example.com"
            autoFocus
          />
          {errs.name ? <p className="text-xs text-destructive">{errs.name[0]}</p> : null}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Content</Label>
        <Input
          value={d.content}
          onChange={(e) => set("content", e.target.value)}
          placeholder="1.2.3.4 or target.example.com"
          className="font-mono"
        />
        {errs.content ? <p className="text-xs text-destructive">{errs.content[0]}</p> : null}
      </div>

      <div className="flex items-center gap-6">
        <div className="space-y-1.5">
          <Label>TTL (1 = auto)</Label>
          <Input
            value={d.ttl}
            onChange={(e) => set("ttl", e.target.value)}
            className="w-28"
            inputMode="numeric"
          />
        </div>
        <CheckboxRow
          checked={d.proxied}
          onChange={(v) => set("proxied", v)}
          label="Proxy through Cloudflare"
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
