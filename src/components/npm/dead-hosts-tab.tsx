"use client";

import * as React from "react";
import { Loader2, Plus } from "lucide-react";
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
  CertificateSelect,
  CheckboxRow,
  DomainBadges,
  EnabledBadge,
  FieldError,
  RowActions,
  confirmDelete,
} from "./shared";
import type { NpmCertificate, NpmDeadHost } from "@/services/npm/types";
import {
  createDeadHostAction,
  deleteDeadHostAction,
  toggleDeadHostAction,
  updateDeadHostAction,
} from "@/app/actions/npm";

interface Draft {
  domain_names: string;
  certificate_id: number;
  ssl_forced: boolean;
  http2_support: boolean;
  advanced_config: string;
}

const EMPTY: Draft = {
  domain_names: "",
  certificate_id: 0,
  ssl_forced: false,
  http2_support: false,
  advanced_config: "",
};

function toDraft(h: NpmDeadHost): Draft {
  return {
    domain_names: h.domain_names.join(", "),
    certificate_id: h.certificate_id ?? 0,
    ssl_forced: h.ssl_forced,
    http2_support: h.http2_support,
    advanced_config: h.advanced_config ?? "",
  };
}

export function DeadHostsTab({
  hosts,
  certificates,
}: {
  hosts: NpmDeadHost[];
  certificates: NpmCertificate[];
}) {
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<NpmDeadHost | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus /> New 404 host
        </Button>
      </div>

      {hosts.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No 404 hosts yet.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Domains</TableHead>
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
                        label="404 host"
                        enabled={h.enabled}
                        onToggle={async () => {
                          const res = await toggleDeadHostAction(h.id, !h.enabled);
                          if (!res.ok) toast.error(res.error ?? "Could not update.");
                        }}
                        onEdit={() => {
                          setEditing(h);
                          setOpen(true);
                        }}
                        onDelete={() =>
                          confirmDelete(
                            `Delete 404 host ${h.domain_names.join(", ")}?`,
                            async () => {
                              const res = await deleteDeadHostAction(h.id);
                              if (res.ok) toast.success("404 host deleted.");
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit 404 host" : "New 404 host"}</DialogTitle>
          </DialogHeader>
          <DeadHostForm
            key={editing?.id ?? "new"}
            initial={editing ? toDraft(editing) : EMPTY}
            certificates={certificates}
            submitLabel={editing ? "Save changes" : "Create"}
            onCancel={() => setOpen(false)}
            onSubmit={async (draft) => {
              const res = editing
                ? await updateDeadHostAction(editing.id, draft)
                : await createDeadHostAction(draft);
              if (res.ok) {
                toast.success(editing ? "404 host updated." : "404 host created.");
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

function DeadHostForm({
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
          placeholder="gone.example.com"
          autoFocus
        />
        <FieldError errors={errs.domain_names} />
      </div>

      <CertificateSelect
        value={d.certificate_id}
        onChange={(id) => set("certificate_id", id)}
        certificates={certificates}
      />

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
