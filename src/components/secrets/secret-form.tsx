"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SECRET_CATEGORIES } from "@/lib/secrets-validation";

export interface SecretDraft {
  name: string;
  value: string;
  category: string;
  description: string;
}

const EMPTY: SecretDraft = {
  name: "",
  value: "",
  category: "API Token",
  description: "",
};

export function SecretForm({
  initial,
  valueOptional,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  initial?: SecretDraft;
  /** When true (edit mode), a blank value keeps the stored secret. */
  valueOptional?: boolean;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (
    draft: SecretDraft,
  ) => Promise<{ ok: boolean; fieldErrors?: Record<string, string[]> }>;
}) {
  const [draft, setDraft] = React.useState<SecretDraft>(initial ?? EMPTY);
  const [pending, setPending] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});

  function set<K extends keyof SecretDraft>(key: K, value: SecretDraft[K]) {
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
      <div className="space-y-1.5">
        <Label>Name</Label>
        <Input
          value={draft.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="e.g. Stripe API key"
          autoFocus
        />
        {fieldErrors.name ? (
          <p className="text-xs text-destructive">{fieldErrors.name[0]}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label>Category</Label>
        <Select value={draft.category} onValueChange={(v) => set("category", v)}>
          <SelectTrigger>
            <SelectValue placeholder="Choose a category" />
          </SelectTrigger>
          <SelectContent>
            {SECRET_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {fieldErrors.category ? (
          <p className="text-xs text-destructive">{fieldErrors.category[0]}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label>Value</Label>
        <Textarea
          value={draft.value}
          onChange={(e) => set("value", e.target.value)}
          rows={3}
          className="font-mono"
          placeholder={
            valueOptional ? "Leave blank to keep the stored value" : "The secret value"
          }
        />
        {fieldErrors.value ? (
          <p className="text-xs text-destructive">{fieldErrors.value[0]}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label>Description (optional)</Label>
        <Textarea
          value={draft.description}
          onChange={(e) => set("description", e.target.value)}
          rows={2}
        />
      </div>

      <div className="flex items-center justify-end gap-2">
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
