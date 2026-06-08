"use client";

import * as React from "react";
import { CheckCircle2, Loader2, Plug, Save, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  saveCloudflareConfigAction,
  testCloudflareConnectionAction,
} from "@/app/actions/cloudflare";
import type { CloudflareConnectionResult } from "@/services/cloudflare/types";

export function CloudflareSettingsForm({
  configured,
  initialAccountId = "",
}: {
  configured: boolean;
  initialAccountId?: string;
}) {
  const [apiToken, setApiToken] = React.useState("");
  const [accountId, setAccountId] = React.useState(initialAccountId);
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [test, setTest] = React.useState<CloudflareConnectionResult | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFieldErrors({});
    try {
      const res = await saveCloudflareConfigAction({ apiToken, accountId });
      if (res.ok) {
        toast.success("Cloudflare settings saved.");
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
      // Test the typed token if present, else fall back to the saved one.
      setTest(await testCloudflareConnectionAction({ apiToken: apiToken.trim() }));
    } catch {
      setTest({ ok: false, message: "Test failed unexpectedly." });
    } finally {
      setTesting(false);
    }
  }

  const canTest = apiToken.trim().length > 0 || configured;

  return (
    <form onSubmit={onSave} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="cf-token">
          API token{" "}
          {configured ? (
            <span className="text-xs text-muted-foreground">
              (a token is saved — enter a new one to replace it)
            </span>
          ) : null}
        </Label>
        <Input
          id="cf-token"
          type="password"
          placeholder={configured ? "••••••••" : "Cloudflare API token"}
          value={apiToken}
          onChange={(e) => setApiToken(e.target.value)}
        />
        {fieldErrors.apiToken ? (
          <p className="text-xs text-destructive">{fieldErrors.apiToken[0]}</p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Use an <strong className="font-semibold text-foreground">API Token</strong>{" "}
          (Cloudflare → My Profile → API Tokens → Create Token) — not your Global
          API Key.{" "}
          <a
            href="https://dash.cloudflare.com/profile/api-tokens"
            target="_blank"
            rel="noreferrer"
            className="text-signal underline underline-offset-2"
          >
            Create one →
          </a>
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cf-account">
          Account ID{" "}
          <span className="text-xs text-muted-foreground">(required for tunnels)</span>
        </Label>
        <Input
          id="cf-account"
          placeholder="32-character account id"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">
          Identifies your whole Cloudflare account (covers all domains). Only the
          Tunnels features need it; DNS and TLS work with the token alone.
        </p>
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
          disabled={testing || !canTest}
        >
          {testing ? <Loader2 className="animate-spin" /> : <Plug />}
          Test connection
        </Button>
      </div>
      {test ? (
        <p
          className={`flex items-start gap-1.5 text-xs ${
            test.ok ? "text-ok" : "text-destructive"
          }`}
        >
          {test.ok ? (
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          ) : (
            <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          )}
          <span>{test.message}</span>
        </p>
      ) : null}
    </form>
  );
}
