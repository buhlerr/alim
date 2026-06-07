"use client";

import * as React from "react";
import { CheckCircle2, Loader2, Plug, Save, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  saveCoolifyConfigAction,
  testCoolifyConnectionAction,
} from "@/app/actions/coolify";
import type { CoolifyConnectionResult } from "@/services/coolify/types";

export function CoolifySettingsForm({
  configured,
  initialBaseUrl = "",
}: {
  configured: boolean;
  initialBaseUrl?: string;
}) {
  const [baseUrl, setBaseUrl] = React.useState(initialBaseUrl);
  const [apiToken, setApiToken] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [test, setTest] = React.useState<CoolifyConnectionResult | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFieldErrors({});
    try {
      const res = await saveCoolifyConfigAction({ baseUrl, apiToken });
      if (res.ok) {
        toast.success("Coolify settings saved.");
        setApiToken("");
      } else {
        setFieldErrors(res.fieldErrors ?? {});
        toast.error(res.error ?? "Could not save.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function onTest() {
    setTesting(true);
    setTest(null);
    try {
      setTest(await testCoolifyConnectionAction());
    } catch {
      setTest({ ok: false, message: "Test failed unexpectedly." });
    } finally {
      setTesting(false);
    }
  }

  return (
    <form onSubmit={onSave} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="coolify-base-url">Base URL</Label>
        <Input
          id="coolify-base-url"
          placeholder="https://coolify.example.com"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
        />
        {fieldErrors.baseUrl ? (
          <p className="text-xs text-destructive">{fieldErrors.baseUrl[0]}</p>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="coolify-token">
          API token{" "}
          {configured ? (
            <span className="text-xs text-muted-foreground">
              (a token is saved — enter a new one to replace it)
            </span>
          ) : null}
        </Label>
        <Input
          id="coolify-token"
          type="password"
          placeholder={configured ? "••••••••" : "Coolify API token"}
          value={apiToken}
          onChange={(e) => setApiToken(e.target.value)}
        />
        {fieldErrors.apiToken ? (
          <p className="text-xs text-destructive">{fieldErrors.apiToken[0]}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          Save
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onTest}
          disabled={testing || !configured}
        >
          {testing ? <Loader2 className="animate-spin" /> : <Plug />}
          Test connection
        </Button>
        {test ? (
          <span
            className={`flex items-center gap-1 text-xs ${
              test.ok ? "text-emerald-600" : "text-destructive"
            }`}
          >
            {test.ok ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <XCircle className="h-3.5 w-3.5" />
            )}
            {test.ok ? `Coolify ${test.version ?? "reachable"}` : test.message}
          </span>
        ) : null}
      </div>
    </form>
  );
}
