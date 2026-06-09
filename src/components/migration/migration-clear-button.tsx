"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
  DialogTrigger,
} from "@/components/ui/dialog";
import { clearMigrationsAction } from "@/app/actions/migration";

/**
 * Clears finished (completed/failed/rolled_back) migration records from the
 * list after a confirmation. In-progress migrations are left untouched, and no
 * Coolify resources are affected.
 */
export function MigrationClearButton() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function clear() {
    setBusy(true);
    const res = await clearMigrationsAction();
    setBusy(false);
    setOpen(false);
    if (!res.ok || !res.data) {
      toast.error(res.error ?? "Could not clear migrations.");
      return;
    }
    toast.success(
      res.data.deleted === 0
        ? "No finished migrations to clear."
        : `Cleared ${res.data.deleted} finished migration${res.data.deleted === 1 ? "" : "s"}.`,
    );
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Trash2 className="h-4 w-4" />
          Clear finished
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Clear finished migrations?</DialogTitle>
          <DialogDescription>
            Removes completed, failed, and rolled-back migration records from the
            list. In-progress migrations are kept, and no Coolify resources are
            affected.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" disabled={busy}>
              Cancel
            </Button>
          </DialogClose>
          <Button variant="destructive" onClick={clear} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Clear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
