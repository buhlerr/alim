"use client";

import * as React from "react";
import { Loader2, Rocket } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { deployCoolifyApplicationAction } from "@/app/actions/coolify";

export function DeployButton({ uuid }: { uuid: string }) {
  const [pending, setPending] = React.useState(false);
  async function onDeploy() {
    setPending(true);
    try {
      const res = await deployCoolifyApplicationAction(uuid);
      if (res.ok) {
        toast.success(res.data?.message ?? "Deployment queued.");
      } else {
        toast.error(res.error ?? "Could not trigger deployment.");
      }
    } finally {
      setPending(false);
    }
  }
  return (
    <Button onClick={onDeploy} disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : <Rocket />}
      Deploy
    </Button>
  );
}
