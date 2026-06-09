"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { deleteMigrationAction } from "@/app/actions/migration";
import { isTerminalStatus } from "@/lib/migration";

interface MigrationRowActionsProps {
  jobId: string;
  status: string;
}

/**
 * Renders a trash-icon delete button for terminal migration rows
 * (completed/failed/rolled_back). Non-terminal rows render nothing since
 * in-progress jobs may still own live resources.
 */
export function MigrationRowActions({ jobId, status }: MigrationRowActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  if (!isTerminalStatus(status)) return null;

  async function handleDelete() {
    if (!window.confirm("Delete this migration record? This cannot be undone.")) return;
    setBusy(true);
    const res = await deleteMigrationAction(jobId);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error ?? "Could not delete migration.");
      return;
    }
    toast.success("Migration deleted.");
    router.refresh();
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label="Delete migration"
      onClick={handleDelete}
      disabled={busy}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Trash2 className="h-4 w-4 text-destructive" />
      )}
    </Button>
  );
}
