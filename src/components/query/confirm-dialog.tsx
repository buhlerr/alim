"use client";

import * as React from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EnvironmentBadge } from "@/components/environment-badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const CONFIRM_WORD = "CONFIRM";

export function ConfirmDialog({
  open,
  onOpenChange,
  environment,
  database,
  dangerousKeywords,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  environment: { key: string; name: string; color: string };
  database: string;
  dangerousKeywords: string[];
  pending: boolean;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = React.useState("");
  const matches = typed.trim().toUpperCase() === CONFIRM_WORD;

  React.useEffect(() => {
    if (open) setTyped("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Confirm dangerous query
          </DialogTitle>
          <DialogDescription>
            This query modifies data, schema, or privileges. Review the target
            before continuing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-md border p-3">
            <span className="text-xs font-medium text-muted-foreground">
              Environment
            </span>
            <EnvironmentBadge environment={environment} />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <span className="text-xs font-medium text-muted-foreground">
              Database
            </span>
            <span className="font-mono text-sm">{database}</span>
          </div>
          {dangerousKeywords.length > 0 ? (
            <div className="flex items-center justify-between rounded-md border p-3">
              <span className="text-xs font-medium text-muted-foreground">
                Operations
              </span>
              <span className="font-mono text-sm text-destructive">
                {dangerousKeywords.join(", ")}
              </span>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="confirm-input">
              Type <span className="font-mono font-semibold">{CONFIRM_WORD}</span> to
              proceed
            </Label>
            <Input
              id="confirm-input"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={CONFIRM_WORD}
              className="font-mono"
              autoComplete="off"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && matches && !pending) onConfirm();
              }}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!matches || pending}
            onClick={onConfirm}
          >
            {pending ? <Loader2 className="animate-spin" /> : null}
            Execute on {environment.name}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
