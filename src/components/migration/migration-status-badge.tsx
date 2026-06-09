import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, type MigrationStatus } from "@/lib/migration";
import { cn } from "@/lib/utils";

const TONE: Record<MigrationStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  validating: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  provisioning: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  transferring: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  deploying: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  awaiting_approval: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  cutting_over: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  completed: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  failed: "bg-red-500/15 text-red-600 dark:text-red-400",
  rolled_back: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
};

export function MigrationStatusBadge({ status }: { status: string }) {
  const s = status as MigrationStatus;
  return (
    <Badge variant="outline" className={cn("border-transparent", TONE[s] ?? TONE.pending)}>
      {STATUS_LABELS[s] ?? status}
    </Badge>
  );
}
