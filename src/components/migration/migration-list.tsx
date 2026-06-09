import Link from "next/link";
import { ArrowRight } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { MigrationJobRow } from "@/services/migration/store";
import { MigrationStatusBadge } from "./migration-status-badge";

export function MigrationList({ jobs }: { jobs: MigrationJobRow[] }) {
  if (jobs.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
        No migrations yet. Start one with &ldquo;New Migration&rdquo;.
      </div>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Resource</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Route</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {jobs.map((job) => (
          <TableRow key={job.id} className="cursor-pointer">
            <TableCell>
              <Link href={`/migrations/${job.id}`} className="font-medium hover:underline">
                {job.sourceResourceName}
                {job.destinationResourceName !== job.sourceResourceName
                  ? ` → ${job.destinationResourceName}`
                  : ""}
              </Link>
            </TableCell>
            <TableCell className="capitalize">{job.migrationType}</TableCell>
            <TableCell className="text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 text-xs">
                {job.sourceHostName}
                <ArrowRight className="h-3 w-3" />
                {job.destinationHostName}
              </span>
            </TableCell>
            <TableCell>
              <MigrationStatusBadge status={job.status} />
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {new Date(job.createdAt).toLocaleString()}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
