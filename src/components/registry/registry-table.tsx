"use client";

import * as React from "react";
import { Eye } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/copy-button";
import { EnvironmentBadge } from "@/components/environment-badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface RegistryRow {
  id: string;
  applicationName: string;
  environment: { key: string; name: string; color: string };
  databaseName: string;
  username: string;
  host: string;
  createdAt: string; // ISO
  createdBy: string;
  notes: string | null;
}

export function RegistryTable({ rows }: { rows: RegistryRow[] }) {
  const [selected, setSelected] = React.useState<RegistryRow | null>(null);

  if (rows.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        No databases match your search.
      </p>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Application</TableHead>
            <TableHead>Environment</TableHead>
            <TableHead>Database</TableHead>
            <TableHead>Username</TableHead>
            <TableHead>Host</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="text-right">Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium">
                {row.applicationName}
              </TableCell>
              <TableCell>
                <EnvironmentBadge environment={row.environment} />
              </TableCell>
              <TableCell className="font-mono text-xs">
                {row.databaseName}
              </TableCell>
              <TableCell className="font-mono text-xs">
                {row.username}
              </TableCell>
              <TableCell className="font-mono text-xs">{row.host}</TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {new Date(row.createdAt).toLocaleDateString()}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelected(row)}
                  aria-label="View details"
                >
                  <Eye className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <DialogContent>
          {selected ? (
            <>
              <DialogHeader>
                <DialogTitle>{selected.applicationName}</DialogTitle>
                <DialogDescription>
                  Provisioned database details. Passwords are never stored.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <DetailRow label="Environment">
                  <EnvironmentBadge environment={selected.environment} />
                </DetailRow>
                <Separator />
                <CopyableRow label="Database" value={selected.databaseName} />
                <CopyableRow label="Username" value={selected.username} />
                <CopyableRow label="Host" value={selected.host} />
                <Separator />
                <DetailRow label="Created">
                  <span className="text-sm">
                    {new Date(selected.createdAt).toLocaleString()}
                  </span>
                </DetailRow>
                <DetailRow label="Created by">
                  <span className="text-sm">{selected.createdBy}</span>
                </DetailRow>
                {selected.notes ? (
                  <DetailRow label="Notes">
                    <span className="text-sm">{selected.notes}</span>
                  </DetailRow>
                ) : null}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function CopyableRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm">{value}</span>
        <CopyButton value={value} size="icon" variant="ghost" />
      </div>
    </div>
  );
}
