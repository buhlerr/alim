import { Info } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { EnvironmentBadge } from "@/components/environment-badge";
import { TestConnectionButton } from "@/components/settings/test-connection-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getAllTargetInfo, type Environment } from "@/lib/targets";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const targets = getAllTargetInfo();

  return (
    <div>
      <PageHeader
        title="Settings"
        description="PostgreSQL server targets and connection status."
      />

      <Card className="mb-6 border-sky-200 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/30">
        <CardContent className="flex gap-3 py-4 text-sm text-sky-900 dark:text-sky-200">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-1">
            <p>
              Connection strings are sourced from environment variables and are
              never displayed in full. To change a target, update the
              environment variable on the deployment (e.g. in Coolify) and
              redeploy.
            </p>
            <p className="text-xs text-sky-800/80 dark:text-sky-300/80">
              An encrypted in-app settings store (AES-256-GCM) is included in
              the codebase for a future release, where targets will be editable
              here directly.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {targets.map((t) => (
          <Card key={t.environment}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  <EnvironmentBadge
                    environment={t.environment as Environment}
                  />
                </CardTitle>
                {t.configured ? (
                  <Badge variant="success">Configured</Badge>
                ) : (
                  <Badge variant="outline">Not configured</Badge>
                )}
              </div>
              <CardDescription className="font-mono text-xs">
                {t.envVar}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    Connection (password redacted)
                  </p>
                  <code className="block rounded-md border bg-muted px-3 py-2 font-mono text-xs">
                    {t.masked ?? "— not set —"}
                  </code>
                  {t.configured ? (
                    <p className="text-xs text-muted-foreground">
                      Host: <span className="font-mono">{t.host}</span> · Port:{" "}
                      <span className="font-mono">{t.port}</span>
                    </p>
                  ) : null}
                </div>
                <TestConnectionButton
                  environment={t.environment as Environment}
                  disabled={!t.configured}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
