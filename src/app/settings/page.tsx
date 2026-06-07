import { Cloud, Database, Layers } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { EnvironmentsSection } from "@/components/settings/environments-section";
import { environmentsService } from "@/services/environments";
import { toSummary } from "@/lib/environments";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getAllTargetInfo } from "@/lib/targets";
import { PostgresTargetForm } from "@/components/settings/postgres-target-form";
import { CoolifySettingsForm } from "@/components/settings/coolify-settings-form";
import { COOLIFY_SETTING_KEYS, isCoolifyConfigured } from "@/lib/coolify-config";
import { settingsService } from "@/services/settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const targets = await getAllTargetInfo();
  const environments = (await environmentsService.list()).map(toSummary);
  const coolifyConfigured = await isCoolifyConfigured();
  // Base URL is not a secret, so we pre-fill it for display. The token is never
  // sent to the client.
  const coolifyBaseUrl =
    (await settingsService.get(COOLIFY_SETTING_KEYS.baseUrl)) ??
    process.env.COOLIFY_BASE_URL ??
    "";

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Environments, database servers, and integrations."
      />

      <div className="mb-10">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <Layers className="h-4 w-4" /> Environments
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Define the environments your infrastructure uses. Everything else —
          databases, connections, and modules — is organized by these.
        </p>
        <EnvironmentsSection environments={environments} />
      </div>

      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <Database className="h-4 w-4" /> PostgreSQL servers
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Admin connection strings are stored encrypted (AES-256-GCM) and never
          displayed in full. Paste a connection string and Save; the password is
          write-only. A matching <code className="font-mono">POSTGRES_*_URL</code>{" "}
          env var is used as a fallback when no value is saved here.
        </p>
        <div className="space-y-4">
          {targets.map((t) => (
            <PostgresTargetForm key={t.environment} target={t} />
          ))}
        </div>
      </div>

      <div className="mt-10">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <Cloud className="h-4 w-4" /> Coolify
        </h2>
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-4">
              <CardTitle className="text-base">Coolify API connection</CardTitle>
              {coolifyConfigured ? (
                <Badge variant="success">Configured</Badge>
              ) : (
                <Badge variant="outline">Not configured</Badge>
              )}
            </div>
            <CardDescription>
              Stored encrypted (AES-256-GCM). Requires ENCRYPTION_KEY to be set.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CoolifySettingsForm
              configured={coolifyConfigured}
              initialBaseUrl={coolifyBaseUrl}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
