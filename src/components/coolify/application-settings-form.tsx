"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateCoolifyApplicationAction } from "@/app/actions/coolify";

export function ApplicationSettingsForm({
  uuid,
  initial,
}: {
  uuid: string;
  initial: { domains: string; build_command: string; start_command: string };
}) {
  const router = useRouter();
  const [form, setForm] = React.useState(initial);
  const [pending, setPending] = React.useState(false);

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      const res = await updateCoolifyApplicationAction(uuid, form);
      if (res.ok) {
        toast.success("Application updated.");
        router.refresh();
      } else {
        toast.error(res.error ?? "Could not update the application.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="domains">Domains</Label>
        <Input id="domains" value={form.domains} onChange={(e) => set("domains", e.target.value)} placeholder="https://app.example.com" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="build">Build command</Label>
        <Input id="build" value={form.build_command} onChange={(e) => set("build_command", e.target.value)} className="font-mono" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="start">Start command</Label>
        <Input id="start" value={form.start_command} onChange={(e) => set("start_command", e.target.value)} className="font-mono" />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Save />}
        Save changes
      </Button>
    </form>
  );
}
