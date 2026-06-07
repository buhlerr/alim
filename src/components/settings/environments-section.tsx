"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { EnvironmentBadge } from "@/components/environment-badge";
import { PALETTE, PALETTE_KEYS } from "@/lib/environment-palette";
import { cn } from "@/lib/utils";
import type { EnvironmentSummary } from "@/lib/environments";
import {
  createEnvironmentAction,
  deleteEnvironmentAction,
  reorderEnvironmentsAction,
  updateEnvironmentAction,
} from "@/app/actions/environments";

type Draft = {
  name: string;
  description: string;
  color: string;
  abbreviation: string;
  readOnly: boolean;
  requireWriteConfirm: boolean;
};

const EMPTY: Draft = {
  name: "",
  description: "",
  color: "blue",
  abbreviation: "",
  readOnly: false,
  requireWriteConfirm: true,
};

export function EnvironmentsSection({ environments }: { environments: EnvironmentSummary[] }) {
  const [editingKey, setEditingKey] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        {environments.map((env, i) => (
          <EnvRow
            key={env.key}
            env={env}
            isFirst={i === 0}
            isLast={i === environments.length - 1}
            editing={editingKey === env.key}
            onEdit={() => setEditingKey(env.key)}
            onCancel={() => setEditingKey(null)}
            allKeys={environments.map((e) => e.key)}
          />
        ))}
      </div>

      {adding ? (
        <Card>
          <CardContent className="pt-6">
            <EnvForm
              initial={EMPTY}
              submitLabel="Create environment"
              onCancel={() => setAdding(false)}
              onSubmit={async (draft) => {
                const res = await createEnvironmentAction(draft);
                if (res.ok) {
                  toast.success("Environment created.");
                  setAdding(false);
                } else {
                  toast.error(res.error ?? "Could not create.");
                }
                return res;
              }}
            />
          </CardContent>
        </Card>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          <Plus /> Add environment
        </Button>
      )}
    </div>
  );
}

function EnvRow({
  env,
  isFirst,
  isLast,
  editing,
  onEdit,
  onCancel,
  allKeys,
}: {
  env: EnvironmentSummary;
  isFirst: boolean;
  isLast: boolean;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  allKeys: string[];
}) {
  const [busy, setBusy] = React.useState(false);

  async function move(dir: -1 | 1) {
    const idx = allKeys.indexOf(env.key);
    const next = [...allKeys];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setBusy(true);
    try {
      const res = await reorderEnvironmentsAction(next);
      if (!res.ok) toast.error(res.error ?? "Could not reorder.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const res = await deleteEnvironmentAction(env.key);
      if (res.ok) toast.success(`Deleted ${env.name}.`);
      else toast.error(res.error ?? "Could not delete.");
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <Card>
        <CardContent className="pt-6">
          <EnvForm
            initial={{
              name: env.name,
              description: env.description ?? "",
              color: env.color,
              abbreviation: env.abbreviation ?? "",
              readOnly: env.readOnly,
              requireWriteConfirm: env.requireWriteConfirm,
            }}
            submitLabel="Save changes"
            onCancel={onCancel}
            onSubmit={async (draft) => {
              const res = await updateEnvironmentAction(env.key, draft);
              if (res.ok) {
                toast.success("Environment updated.");
                onCancel();
              } else {
                toast.error(res.error ?? "Could not update.");
              }
              return res;
            }}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
      <div className="flex min-w-0 items-center gap-3">
        <EnvironmentBadge environment={env} />
        <span className="truncate text-sm text-muted-foreground">{env.description}</span>
        {env.readOnly ? (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide">Read-only</span>
        ) : null}
        {env.requireWriteConfirm ? (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide">Confirm writes</span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="icon" onClick={() => move(-1)} disabled={isFirst || busy} aria-label="Move up">
          <ChevronUp className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => move(1)} disabled={isLast || busy} aria-label="Move down">
          <ChevronDown className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onEdit} disabled={busy} aria-label="Edit">
          <Pencil className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={remove} disabled={busy} aria-label="Delete">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

function EnvForm({
  initial,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  initial: Draft;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (draft: Draft) => Promise<{ ok: boolean; fieldErrors?: Record<string, string[]> }>;
}) {
  const [draft, setDraft] = React.useState<Draft>(initial);
  const [pending, setPending] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setFieldErrors({});
    try {
      const res = await onSubmit(draft);
      if (!res.ok && res.fieldErrors) setFieldErrors(res.fieldErrors);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. QA" autoFocus />
          {fieldErrors.name ? <p className="text-xs text-destructive">{fieldErrors.name[0]}</p> : null}
        </div>
        <div className="space-y-1.5">
          <Label>Name suffix (for db/user names)</Label>
          <Input
            value={draft.abbreviation}
            onChange={(e) => set("abbreviation", e.target.value)}
            placeholder="e.g. qa (blank = no suffix)"
            className="font-mono"
          />
          {fieldErrors.abbreviation ? <p className="text-xs text-destructive">{fieldErrors.abbreviation[0]}</p> : null}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Description</Label>
        <Textarea value={draft.description} onChange={(e) => set("description", e.target.value)} rows={2} />
      </div>

      <div className="space-y-1.5">
        <Label>Color</Label>
        <div className="flex flex-wrap gap-2">
          {PALETTE_KEYS.map((key) => (
            <button
              type="button"
              key={key}
              onClick={() => set("color", key)}
              aria-label={PALETTE[key].label}
              className={cn(
                "h-7 w-7 rounded-full ring-offset-2 transition",
                PALETTE[key].dotClass,
                draft.color === key ? "ring-2 ring-foreground" : "",
              )}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={draft.readOnly} onCheckedChange={(c) => set("readOnly", c === true)} />
          Read-only (block SQL writes)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={draft.requireWriteConfirm} onCheckedChange={(c) => set("requireWriteConfirm", c === true)} />
          Require confirmation for writes
        </label>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          {submitLabel}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
