"use client";

import * as React from "react";
import { CheckCircle2, Loader2, Plug, Save, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  saveNpmConfigAction,
  testNpmConnectionAction,
} from "@/app/actions/npm";
import type { NpmConnectionResult } from "@/services/npm/types";

export function NpmSettingsForm({
  configured,
  initialBaseUrl = "",
  initialIdentity = "",
}: {
  configured: boolean;
  initialBaseUrl?: string;
  initialIdentity?: string;
}) {
  const [baseUrl, setBaseUrl] = React.useState(initialBaseUrl);
  const [identity, setIdentity] = React.useState(initialIdentity);
  const [secret, setSecret] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [test, setTest] = React.useState<NpmConnectionResult | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFieldErrors({});
    try {
      const res = await saveNpmConfigAction({ baseUrl, identity, secret });
      if (res.ok) {
        toast.success("Nginx Proxy Manager settings saved.");
        setSecret("");
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
      setTest(await testNpmConnectionAction());
    } catch {
      setTest({ ok: false, message: "Test failed unexpectedly." });
    } finally {
      setTesting(false);
    }
  }

  return (
    <form onSubmit={onSave} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="npm-base-url">Base URL</Label>
        <Input
          id="npm-base-url"
          placeholder="https://npm.example.com"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
        />
        {fieldErrors.baseUrl ? (
          <p className="text-xs text-destructive">{fieldErrors.baseUrl[0]}</p>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="npm-identity">Admin email</Label>
        <Input
          id="npm-identity"
          type="email"
          placeholder="admin@example.com"
          value={identity}
          onChange={(e) => setIdentity(e.target.value)}
        />
        {fieldErrors.identity ? (
          <p className="text-xs text-destructive">{fieldErrors.identity[0]}</p>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="npm-secret">
          Password{" "}
          {configured ? (
            <span className="text-xs text-muted-foreground">
              (a password is saved — enter a new one to replace it)
            </span>
          ) : null}
        </Label>
        <Input
          id="npm-secret"
          type="password"
          placeholder={configured ? "••••••••" : "Admin password"}
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
        />
        {fieldErrors.secret ? (
          <p className="text-xs text-destructive">{fieldErrors.secret[0]}</p>
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
            {test.ok ? `NPM ${test.version ?? "reachable"}` : test.message}
          </span>
        ) : null}
      </div>
    </form>
  );
}
