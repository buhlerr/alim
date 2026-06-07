"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { setCoolifyEnvVarAction } from "@/app/actions/coolify";
import type { CoolifyEnvVar } from "@/services/coolify/types";

export function EnvVarsEditor({
  uuid,
  initial,
}: {
  uuid: string;
  initial: CoolifyEnvVar[];
}) {
  const router = useRouter();
  const [key, setKey] = React.useState("");
  const [value, setValue] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setFieldErrors({});
    try {
      const res = await setCoolifyEnvVarAction(uuid, { key, value });
      if (res.ok) {
        toast.success(`Set ${key}.`);
        setKey("");
        setValue("");
        router.refresh();
      } else {
        setFieldErrors(res.fieldErrors ?? {});
        toast.error(res.error ?? "Could not set the variable.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      {initial.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Key</TableHead>
              <TableHead>Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {initial.map((v) => (
              <TableRow key={v.uuid ?? v.key}>
                <TableCell className="font-mono text-xs">{v.key}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {v.is_build_time ? "(build) " : ""}
                  ••••••
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="text-sm text-muted-foreground">No environment variables yet.</p>
      )}

      <form onSubmit={onAdd} className="flex flex-wrap items-start gap-2">
        <div className="space-y-1">
          <Input placeholder="KEY" value={key} onChange={(e) => setKey(e.target.value)} className="font-mono" />
          {fieldErrors.key ? <p className="text-xs text-destructive">{fieldErrors.key[0]}</p> : null}
        </div>
        <div className="flex-1 space-y-1">
          <Input placeholder="value" value={value} onChange={(e) => setValue(e.target.value)} className="font-mono" />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Plus />}
          Add / update
        </Button>
      </form>
    </div>
  );
}
