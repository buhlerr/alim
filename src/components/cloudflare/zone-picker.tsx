"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CfZone } from "@/services/cloudflare/types";

export function ZonePicker({
  zones,
  value,
  onChange,
}: {
  zones: CfZone[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Zone</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-64">
          <SelectValue placeholder="Select a zone" />
        </SelectTrigger>
        <SelectContent>
          {zones.map((z) => (
            <SelectItem key={z.id} value={z.id}>
              {z.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
