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
import { CheckboxRow, EnabledBadge, FieldError, RowActions, confirmDelete } from "./shared";
import type { NpmStream } from "@/services/npm/types";
import {
  createStreamAction,
  deleteStreamAction,
  toggleStreamAction,
  updateStreamAction,
} from "@/app/actions/npm";

interface Draft {
  incoming_port: string;
  forwarding_host: string;
  forwarding_port: string;
  tcp_forwarding: boolean;
  udp_forwarding: boolean;
}

const EMPTY: Draft = {
  incoming_port: "",
  forwarding_host: "",
  forwarding_port: "",
  tcp_forwarding: true,
  udp_forwarding: false,
};

function toDraft(s: NpmStream): Draft {
  return {
    incoming_port: String(s.incoming_port),
    forwarding_host: s.forwarding_host,
    forwarding_port: String(s.forwarding_port),
    tcp_forwarding: s.tcp_forwarding,
    udp_forwarding: s.udp_forwarding,
  };
}

function protocols(s: NpmStream): string {
  return [s.tcp_forwarding && "TCP", s.udp_forwarding && "UDP"].filter(Boolean).join(" + ");
}

export function StreamsTab({ streams }: { streams: NpmStream[] }) {
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<NpmStream | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus /> New stream
        </Button>
      </div>

      {streams.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No streams yet.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Incoming port</TableHead>
                  <TableHead>Forwards to</TableHead>
                  <TableHead>Protocol</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {streams.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs">{s.incoming_port}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {s.forwarding_host}:{s.forwarding_port}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{protocols(s) || "—"}</Badge>
                    </TableCell>
                    <TableCell>
                      <EnabledBadge enabled={s.enabled} />
                    </TableCell>
                    <TableCell>
                      <RowActions
                        label="stream"
                        enabled={s.enabled}
                        onToggle={async () => {
                          const res = await toggleStreamAction(s.id, !s.enabled);
                          if (!res.ok) toast.error(res.error ?? "Could not update.");
                        }}
                        onEdit={() => {
                          setEditing(s);
                          setOpen(true);
                        }}
                        onDelete={() =>
                          confirmDelete(`Delete stream on port ${s.incoming_port}?`, async () => {
                            const res = await deleteStreamAction(s.id);
                            if (res.ok) toast.success("Stream deleted.");
                            else toast.error(res.error ?? "Could not delete.");
                          })
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
            <DialogTitle>{editing ? "Edit stream" : "New stream"}</DialogTitle>
          </DialogHeader>
          <StreamForm
            key={editing?.id ?? "new"}
            initial={editing ? toDraft(editing) : EMPTY}
            submitLabel={editing ? "Save changes" : "Create"}
            onCancel={() => setOpen(false)}
            onSubmit={async (draft) => {
              const res = editing
                ? await updateStreamAction(editing.id, draft)
                : await createStreamAction(draft);
              if (res.ok) {
                toast.success(editing ? "Stream updated." : "Stream created.");
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

function StreamForm({
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
      <div className="space-y-1.5">
        <Label>Incoming port</Label>
        <Input
          value={d.incoming_port}
          onChange={(e) => set("incoming_port", e.target.value)}
          placeholder="2222"
          inputMode="numeric"
          autoFocus
        />
        <FieldError errors={errs.incoming_port} />
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
        <div className="space-y-1.5">
          <Label>Forwarding host</Label>
          <Input
            value={d.forwarding_host}
            onChange={(e) => set("forwarding_host", e.target.value)}
            placeholder="10.0.0.9"
          />
          <FieldError errors={errs.forwarding_host} />
        </div>
        <div className="space-y-1.5">
          <Label>Forwarding port</Label>
          <Input
            value={d.forwarding_port}
            onChange={(e) => set("forwarding_port", e.target.value)}
            placeholder="22"
            inputMode="numeric"
          />
          <FieldError errors={errs.forwarding_port} />
        </div>
      </div>

      <div className="flex gap-6">
        <CheckboxRow
          checked={d.tcp_forwarding}
          onChange={(v) => set("tcp_forwarding", v)}
          label="TCP"
        />
        <CheckboxRow
          checked={d.udp_forwarding}
          onChange={(v) => set("udp_forwarding", v)}
          label="UDP"
        />
      </div>
      <FieldError errors={errs.tcp_forwarding} />

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
