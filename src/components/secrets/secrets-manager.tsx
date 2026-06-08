"use client";

import * as React from "react";
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
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
import { SecretForm, type SecretDraft } from "./secret-form";
import {
  createSecretAction,
  deleteSecretAction,
  revealSecretAction,
  updateSecretAction,
} from "@/app/actions/secrets";

export interface SecretListItem {
  id: string;
  name: string;
  description: string | null;
  category: string;
  /** ISO timestamp or null. */
  lastRevealedAt: string | null;
  /** ISO timestamp. */
  createdAt: string;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function SecretsManager({ secrets }: { secrets: SecretListItem[] }) {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<SecretListItem | null>(null);

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(secret: SecretListItem) {
    setEditing(secret);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <Plus /> New secret
        </Button>
      </div>

      {secrets.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-sm text-muted-foreground">
            <KeyRound className="h-8 w-8 opacity-40" />
            <p>No secrets stored yet.</p>
            <Button variant="outline" size="sm" onClick={openCreate}>
              <Plus /> Add the first one
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Last revealed</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {secrets.map((secret) => (
                  <SecretRow
                    key={secret.id}
                    secret={secret}
                    onEdit={() => openEdit(secret)}
                  />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit secret" : "New secret"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Update this secret. Leave the value blank to keep the stored value."
                : "Store an encrypted credential. The value is never shown again until you reveal it."}
            </DialogDescription>
          </DialogHeader>
          <SecretForm
            key={editing?.id ?? "new"}
            initial={
              editing
                ? {
                    name: editing.name,
                    value: "",
                    category: editing.category,
                    description: editing.description ?? "",
                  }
                : undefined
            }
            valueOptional={Boolean(editing)}
            submitLabel={editing ? "Save changes" : "Create secret"}
            onCancel={() => setDialogOpen(false)}
            onSubmit={async (draft: SecretDraft) => {
              const res = editing
                ? await updateSecretAction(editing.id, draft)
                : await createSecretAction(draft);
              if (res.ok) {
                toast.success(editing ? "Secret updated." : "Secret created.");
                setDialogOpen(false);
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

function SecretRow({
  secret,
  onEdit,
}: {
  secret: SecretListItem;
  onEdit: () => void;
}) {
  const [revealed, setRevealed] = React.useState<string | null>(null);
  const [revealing, setRevealing] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  async function reveal() {
    setRevealing(true);
    try {
      const res = await revealSecretAction(secret.id);
      if (res.ok && res.data) {
        setRevealed(res.data.value);
      } else {
        toast.error(res.error ?? "Could not reveal the secret.");
      }
    } finally {
      setRevealing(false);
    }
  }

  async function copy() {
    const value = revealed;
    if (value == null) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy to clipboard.");
    }
  }

  async function remove() {
    if (!window.confirm(`Delete the secret "${secret.name}"? This cannot be undone.`)) {
      return;
    }
    setDeleting(true);
    try {
      const res = await deleteSecretAction(secret.id);
      if (res.ok) toast.success(`Deleted ${secret.name}.`);
      else toast.error(res.error ?? "Could not delete the secret.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{secret.name}</div>
        {secret.description ? (
          <div className="text-xs text-muted-foreground">{secret.description}</div>
        ) : null}
      </TableCell>
      <TableCell>
        <Badge variant="secondary">{secret.category}</Badge>
      </TableCell>
      <TableCell>
        {revealed == null ? (
          <span className="font-mono text-muted-foreground">••••••••</span>
        ) : (
          <span className="break-all font-mono text-sm">{revealed}</span>
        )}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {relativeTime(secret.lastRevealedAt)}
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-1">
          {revealed == null ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={reveal}
              disabled={revealing}
              aria-label="Reveal"
            >
              {revealing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="icon" onClick={copy} aria-label="Copy">
                {copied ? (
                  <Check className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setRevealed(null)}
                aria-label="Hide"
              >
                <EyeOff className="h-4 w-4" />
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onEdit}
            disabled={deleting}
            aria-label="Edit"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={remove}
            disabled={deleting}
            aria-label="Delete"
          >
            {deleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
