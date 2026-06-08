"use client";

import * as React from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
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
import { DomainBadges, FieldError, confirmDelete } from "./shared";
import type { NpmCertificate } from "@/services/npm/types";
import {
  deleteCertificateAction,
  requestCertificateAction,
} from "@/app/actions/npm";

export function CertificatesTab({
  certificates,
}: {
  certificates: NpmCertificate[];
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}>
          <Plus /> Request Let&apos;s Encrypt
        </Button>
      </div>

      {certificates.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No certificates yet.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Domains</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {certificates.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-sm">
                      {c.nice_name || `Cert #${c.id}`}
                    </TableCell>
                    <TableCell>
                      <DomainBadges domains={c.domain_names} />
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{c.provider}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {c.expires_on ? new Date(c.expires_on).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <CertDeleteButton id={c.id} name={c.nice_name || `Cert #${c.id}`} />
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
            <DialogTitle>Request Let&apos;s Encrypt certificate</DialogTitle>
          </DialogHeader>
          <LetsEncryptForm onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CertDeleteButton({ id, name }: { id: number; name: string }) {
  const [busy, setBusy] = React.useState(false);
  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={busy}
      aria-label={`Delete ${name}`}
      onClick={() =>
        confirmDelete(`Delete certificate ${name}?`, async () => {
          setBusy(true);
          try {
            const res = await deleteCertificateAction(id);
            if (res.ok) toast.success("Certificate deleted.");
            else toast.error(res.error ?? "Could not delete.");
          } finally {
            setBusy(false);
          }
        })
      }
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
    </Button>
  );
}

function LetsEncryptForm({ onDone }: { onDone: () => void }) {
  const [domains, setDomains] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [errs, setErrs] = React.useState<Record<string, string[]>>({});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setErrs({});
    try {
      const res = await requestCertificateAction({ domain_names: domains, email });
      if (res.ok) {
        toast.success("Certificate requested.");
        onDone();
      } else if (res.fieldErrors) {
        setErrs(res.fieldErrors);
      } else {
        toast.error(res.error ?? "Could not request the certificate.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Domain names</Label>
        <Input
          value={domains}
          onChange={(e) => setDomains(e.target.value)}
          placeholder="app.example.com, www.example.com"
          autoFocus
        />
        <FieldError errors={errs.domain_names} />
      </div>
      <div className="space-y-1.5">
        <Label>Email</Label>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
        <FieldError errors={errs.email} />
      </div>
      <p className="text-xs text-muted-foreground">
        The domains must already resolve to this Nginx Proxy Manager server for
        the HTTP-01 challenge to succeed.
      </p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Request
        </Button>
      </div>
    </form>
  );
}
