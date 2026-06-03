"use client";

import * as React from "react";
import { CheckCircle2, Loader2, Plug, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  testConnectionAction,
  type TestConnectionResult,
} from "@/app/actions/provision";
import type { Environment } from "@/lib/environments";

export function TestConnectionButton({
  environment,
  disabled,
}: {
  environment: Environment;
  disabled?: boolean;
}) {
  const [pending, setPending] = React.useState(false);
  const [result, setResult] = React.useState<TestConnectionResult | null>(null);

  async function onTest() {
    setPending(true);
    setResult(null);
    try {
      setResult(await testConnectionAction(environment));
    } catch {
      setResult({ ok: false, message: "Test failed unexpectedly." });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onTest}
        disabled={disabled || pending}
      >
        {pending ? <Loader2 className="animate-spin" /> : <Plug />}
        Test connection
      </Button>
      {result ? (
        <span
          className={`flex items-center gap-1 text-xs ${
            result.ok ? "text-emerald-600" : "text-destructive"
          }`}
        >
          {result.ok ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : (
            <XCircle className="h-3.5 w-3.5" />
          )}
          {result.serverVersion ?? result.message}
        </span>
      ) : null}
    </div>
  );
}
