"use client";

import * as React from "react";
import { Download, KeyRound, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "next/navigation";
import {
  saveHostCredentialAction,
  deleteHostCredentialAction,
  importCoolifyHostCredentialsAction,
  type HostCredentialOption,
} from "@/app/actions/hosts";

interface CredentialFormState {
  serverUuid: string;
  serverName: string;
  serverIp: string;
  existingCredentialId?: string;
}

function CredentialForm({
  state,
  onSuccess,
  onCancel,
}: {
  state: CredentialFormState;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = React.useState(state.serverName);
  const [ipAddress, setIpAddress] = React.useState(state.serverIp ?? "");
  const [sshPort, setSshPort] = React.useState("22");
  const [sshUsername, setSshUsername] = React.useState("root");
  const [privateKey, setPrivateKey] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});

  const isEdit = Boolean(state.existingCredentialId);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFieldErrors({});
    try {
      const res = await saveHostCredentialAction({
        coolifyServerUuid: state.serverUuid,
        name: name.trim(),
        ipAddress: ipAddress.trim(),
        sshPort: parseInt(sshPort, 10),
        sshUsername: sshUsername.trim(),
        privateKey,
      });
      if (res.ok) {
        toast.success(isEdit ? "Credential updated." : "Credential saved.");
        onSuccess();
      } else {
        setFieldErrors(res.fieldErrors ?? {});
        toast.error(res.error ?? "Could not save.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="hc-name">Label</Label>
        <Input
          id="hc-name"
          placeholder="prod-server-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {fieldErrors.name ? (
          <p className="text-xs text-destructive">{fieldErrors.name[0]}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="hc-ip">IP address</Label>
        <Input
          id="hc-ip"
          placeholder="1.2.3.4"
          value={ipAddress}
          onChange={(e) => setIpAddress(e.target.value)}
        />
        {fieldErrors.ipAddress ? (
          <p className="text-xs text-destructive">{fieldErrors.ipAddress[0]}</p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="hc-port">SSH port</Label>
          <Input
            id="hc-port"
            type="number"
            min={1}
            max={65535}
            value={sshPort}
            onChange={(e) => setSshPort(e.target.value)}
          />
          {fieldErrors.sshPort ? (
            <p className="text-xs text-destructive">{fieldErrors.sshPort[0]}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="hc-user">SSH username</Label>
          <Input
            id="hc-user"
            placeholder="root"
            value={sshUsername}
            onChange={(e) => setSshUsername(e.target.value)}
          />
          {fieldErrors.sshUsername ? (
            <p className="text-xs text-destructive">{fieldErrors.sshUsername[0]}</p>
          ) : null}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="hc-key">
          Private key
          {isEdit ? (
            <span className="ml-1 text-xs text-muted-foreground">
              (paste a new key to replace the stored one)
            </span>
          ) : null}
        </Label>
        <Textarea
          id="hc-key"
          placeholder={"-----BEGIN OPENSSH PRIVATE KEY-----\n..."}
          value={privateKey}
          onChange={(e) => setPrivateKey(e.target.value)}
          rows={7}
          className="font-mono text-xs"
        />
        {fieldErrors.privateKey ? (
          <p className="text-xs text-destructive">{fieldErrors.privateKey[0]}</p>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          {isEdit ? "Update" : "Save"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function HostCredentialsManager({
  servers,
}: {
  servers: HostCredentialOption[];
}) {
  const router = useRouter();
  const [dialogState, setDialogState] = React.useState<CredentialFormState | null>(null);
  const [deleting, setDeleting] = React.useState<string | null>(null);
  const [importing, setImporting] = React.useState(false);

  async function handleImport() {
    setImporting(true);
    try {
      const res = await importCoolifyHostCredentialsAction();
      if (res.ok && res.data) {
        const { imported, skipped } = res.data;
        const skippedLines = skipped.length > 0
          ? skipped.map((s) => `${s.name}: ${s.reason}`).join("\n")
          : undefined;
        toast.success(`Imported ${imported} credential${imported === 1 ? "" : "s"}. Skipped ${skipped.length}.`, {
          description: skippedLines,
        });
        router.refresh();
      } else {
        toast.error(res.error ?? "Could not import from Coolify.");
      }
    } finally {
      setImporting(false);
    }
  }

  function openAdd(server: HostCredentialOption) {
    setDialogState({
      serverUuid: server.uuid,
      serverName: server.name,
      serverIp: server.ip ?? "",
    });
  }

  function openEdit(server: HostCredentialOption) {
    setDialogState({
      serverUuid: server.uuid,
      serverName: server.name,
      serverIp: server.ip ?? "",
      existingCredentialId: server.credentialId,
    });
  }

  async function handleDelete(server: HostCredentialOption) {
    if (!server.credentialId) return;
    setDeleting(server.credentialId);
    try {
      const res = await deleteHostCredentialAction(server.credentialId);
      if (res.ok) {
        toast.success("Credential removed.");
      } else {
        toast.error(res.error ?? "Could not remove credential.");
      }
    } finally {
      setDeleting(null);
    }
  }

  const isEdit = Boolean(dialogState?.existingCredentialId);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" onClick={handleImport} disabled={importing}>
          {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Import from Coolify
        </Button>
      </div>
      {servers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
            <KeyRound className="h-8 w-8 opacity-40" />
            <p className="text-sm">No Coolify servers found. Configure a Coolify connection first.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Server</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>SSH credential</TableHead>
                  <TableHead className="w-[140px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {servers.map((server) => (
                  <TableRow key={server.uuid}>
                    <TableCell className="font-medium">{server.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {server.ip ?? "unknown"}
                    </TableCell>
                    <TableCell>
                      {server.hasCredential ? (
                        <Badge variant="default" className="gap-1">
                          <KeyRound className="h-3 w-3" />
                          {server.credentialName ?? "stored"}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          none
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        {server.hasCredential ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openEdit(server)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDelete(server)}
                              disabled={deleting === server.credentialId}
                            >
                              {deleting === server.credentialId ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openAdd(server)}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add key
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={Boolean(dialogState)} onOpenChange={(open) => !open && setDialogState(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {isEdit ? "Update SSH credential" : "Add SSH credential"}
            </DialogTitle>
            <DialogDescription>
              {isEdit
                ? `Replace the stored SSH key for ${dialogState?.serverName}.`
                : `Store an SSH private key for ${dialogState?.serverName}. The key is encrypted at rest.`}
            </DialogDescription>
          </DialogHeader>
          {dialogState ? (
            <CredentialForm
              state={dialogState}
              onSuccess={() => setDialogState(null)}
              onCancel={() => setDialogState(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
