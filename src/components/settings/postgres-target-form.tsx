"use client";

import * as React from "react";
import {
  CheckCircle2,
  Loader2,
  Plug,
  Save,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EnvironmentBadge } from "@/components/environment-badge";
import {
  clearPostgresTargetAction,
  savePostgresTargetAction,
  testConnectionAction,
  type TestConnectionResult,
} from "@/app/actions/provision";
import type { Environment } from "@/lib/environments";

/** Client-safe, non-secret description of a target passed from the server. */
export interface PostgresTargetView {
  environment: Environment;
  label: string;
  configured: boolean;
  source: "settings" | "env" | null;
  host: string | null;
  port: number | null;
  masked: string | null;
}

export function PostgresTargetForm({ target }: { target: PostgresTargetView }) {
  const [value, setValue] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [clearing, setClearing] = React.useState(false);
  const [test, setTest] = React.useState<TestConnectionResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await savePostgresTargetAction(target.environment, value);
      if (res.ok) {
        toast.success(`${target.label} connection saved.`);
        setValue("");
        setTest(null);
      } else {
        setError(res.error ?? "Could not save.");
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
      setTest(await testConnectionAction(target.environment));
    } catch {
      setTest({ ok: false, message: "Test failed unexpectedly." });
    } finally {
      setTesting(false);
    }
  }

  async function onClear() {
    setClearing(true);
    try {
      const res = await clearPostgresTargetAction(target.environment);
      if (res.ok) {
        toast.success(`${target.label} connection cleared.`);
        setTest(null);
      } else {
        toast.error(res.error ?? "Could not clear.");
      }
    } finally {
      setClearing(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <EnvironmentBadge environment={target.environment} />
          </CardTitle>
          {target.configured ? (
            <Badge variant="success">
              {target.source === "env" ? "Configured (env)" : "Configured"}
            </Badge>
          ) : (
            <Badge variant="outline">Not configured</Badge>
          )}
        </div>
        {target.configured ? (
          <CardDescription className="font-mono text-xs">
            {target.masked}
            {target.host ? ` · ${target.host}:${target.port}` : ""}
          </CardDescription>
        ) : (
          <CardDescription>No connection set.</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <form onSubmit={onSave} className="space-y-3">
          <Input
            type="password"
            placeholder={
              target.configured
                ? "Enter a new connection string to replace it"
                : "postgresql://admin:password@host:5432/postgres"
            }
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="font-mono"
          />
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="sm" disabled={saving || !value}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              Save
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onTest}
              disabled={testing || !target.configured}
            >
              {testing ? <Loader2 className="animate-spin" /> : <Plug />}
              Test connection
            </Button>
            {target.source === "settings" ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClear}
                disabled={clearing}
              >
                {clearing ? <Loader2 className="animate-spin" /> : <Trash2 />}
                Clear
              </Button>
            ) : null}
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
                {test.ok ? (test.serverVersion ?? "Connection OK.") : test.message}
              </span>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
