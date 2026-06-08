"use client";

import * as React from "react";
import { Loader2, Pencil, Power, PowerOff, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { NpmAccessList, NpmCertificate } from "@/services/npm/types";

export function DomainBadges({ domains }: { domains: string[] }) {
  if (!domains?.length) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {domains.map((d) => (
        <Badge key={d} variant="secondary" className="font-mono text-xs">
          {d}
        </Badge>
      ))}
    </div>
  );
}

export function EnabledBadge({ enabled }: { enabled: boolean }) {
  return enabled ? (
    <Badge variant="success">Enabled</Badge>
  ) : (
    <Badge variant="outline">Disabled</Badge>
  );
}

/** Edit / enable-disable / delete cluster shared by every resource row. */
export function RowActions({
  enabled,
  onToggle,
  onEdit,
  onDelete,
  label,
}: {
  enabled: boolean;
  onToggle: () => Promise<void> | void;
  onEdit: () => void;
  onDelete: () => Promise<void> | void;
  label: string;
}) {
  const [busy, setBusy] = React.useState(false);
  async function run(fn: () => Promise<void> | void) {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        disabled={busy}
        onClick={() => run(onToggle)}
        aria-label={enabled ? `Disable ${label}` : `Enable ${label}`}
        title={enabled ? "Disable" : "Enable"}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : enabled ? (
          <PowerOff className="h-4 w-4" />
        ) : (
          <Power className="h-4 w-4" />
        )}
      </Button>
      <Button variant="ghost" size="icon" disabled={busy} onClick={onEdit} aria-label={`Edit ${label}`}>
        <Pencil className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        disabled={busy}
        onClick={() => run(onDelete)}
        aria-label={`Delete ${label}`}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function CheckboxRow({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <Checkbox
        checked={checked}
        disabled={disabled}
        onCheckedChange={(c) => onChange(c === true)}
      />
      {label}
    </label>
  );
}

export function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className="text-xs text-destructive">{errors[0]}</p>;
}

/** Certificate picker. Value 0 = "no certificate". */
export function CertificateSelect({
  value,
  onChange,
  certificates,
}: {
  value: number;
  onChange: (id: number) => void;
  certificates: NpmCertificate[];
}) {
  return (
    <div className="space-y-1.5">
      <Label>SSL certificate</Label>
      <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="0">None</SelectItem>
          {certificates.map((c) => (
            <SelectItem key={c.id} value={String(c.id)}>
              {c.nice_name || c.domain_names?.join(", ") || `Cert #${c.id}`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Access list picker. Value 0 = "publicly accessible". */
export function AccessListSelect({
  value,
  onChange,
  accessLists,
}: {
  value: number;
  onChange: (id: number) => void;
  accessLists: NpmAccessList[];
}) {
  return (
    <div className="space-y-1.5">
      <Label>Access list</Label>
      <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="0">Publicly accessible</SelectItem>
          {accessLists.map((a) => (
            <SelectItem key={a.id} value={String(a.id)}>
              {a.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Confirm + run a delete with a window.confirm guard. */
export async function confirmDelete(message: string, fn: () => Promise<void>) {
  if (!window.confirm(message)) return;
  await fn();
}
