"use client";

import * as React from "react";
import { BookMarked, Library, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { QUERY_LIBRARY } from "@/lib/query-library";
import type { SavedQueryDTO } from "@/app/actions/query";

export function SavedQueriesSidebar({
  saved,
  currentQuery,
  onLoad,
  onSave,
  onDelete,
}: {
  saved: SavedQueryDTO[];
  currentQuery: string;
  onLoad: (query: string) => void;
  onSave: (input: { name: string; description: string }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    if (!currentQuery.trim()) {
      toast.error("The editor is empty.");
      return;
    }
    setSaving(true);
    try {
      await onSave({ name: name.trim(), description: description.trim() });
      setDialogOpen(false);
      setName("");
      setDescription("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <BookMarked className="h-4 w-4" /> Saved queries
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setDialogOpen(true)}
          className="h-7 px-2 text-xs"
        >
          <Plus className="h-3.5 w-3.5" /> Save
        </Button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto pr-1">
        {/* User-saved */}
        {saved.length > 0 ? (
          <div className="space-y-1">
            {saved.map((q) => (
              <div
                key={q.id}
                className="group flex items-center gap-1 rounded-md hover:bg-accent"
              >
                <button
                  type="button"
                  onClick={() => onLoad(q.query)}
                  className="flex-1 truncate px-2 py-1.5 text-left text-sm"
                  title={q.description ?? q.name}
                >
                  {q.name}
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(q.id)}
                  className="mr-1 hidden rounded p-1 text-muted-foreground hover:text-destructive group-hover:block"
                  aria-label={`Delete ${q.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {/* Built-in library */}
        <div>
          <p className="mb-1 flex items-center gap-1.5 px-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <Library className="h-3.5 w-3.5" /> Library
          </p>
          <div className="space-y-0.5">
            {QUERY_LIBRARY.map((q) => (
              <button
                key={q.id}
                type="button"
                onClick={() => onLoad(q.query)}
                className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                title={q.description}
              >
                {q.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save query</DialogTitle>
            <DialogDescription>
              Saves the current editor contents to your sidebar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="sq-name">Name</Label>
              <Input
                id="sq-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Stale sessions"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sq-desc">Description (optional)</Label>
              <Textarea
                id="sq-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !name.trim()}>
              Save query
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
