import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getCoolifyApplicationAction,
  getCoolifyEnvVarsAction,
} from "@/app/actions/coolify";
import { DeployButton } from "@/components/coolify/deploy-button";
import { EnvVarsEditor } from "@/components/coolify/env-vars-editor";
import { ApplicationSettingsForm } from "@/components/coolify/application-settings-form";

export const dynamic = "force-dynamic";

export default async function CoolifyApplicationPage({
  params,
}: {
  params: Promise<{ uuid: string }>;
}) {
  const { uuid } = await params;
  const [appRes, envRes] = await Promise.all([
    getCoolifyApplicationAction(uuid),
    getCoolifyEnvVarsAction(uuid),
  ]);

  if (!appRes.ok || !appRes.data) {
    return (
      <div>
        <PageHeader title="Application" description="Coolify application detail." />
        <Card className="border-destructive/40">
          <CardContent className="py-6 text-sm text-destructive">
            {appRes.error ?? "Application not found."}
          </CardContent>
        </Card>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/coolify"><ArrowLeft /> Back to applications</Link>
        </Button>
      </div>
    );
  }

  const app = appRes.data;

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
          <Link href="/coolify"><ArrowLeft /> Applications</Link>
        </Button>
        <PageHeader
          title={app.name}
          description={app.status ?? "unknown"}
          action={<DeployButton uuid={uuid} />}
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Overview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {app.fqdn ? (
            <p className="flex items-center gap-1">
              <ExternalLink className="h-3.5 w-3.5" />
              <a href={app.fqdn} className="underline" target="_blank" rel="noreferrer">{app.fqdn}</a>
            </p>
          ) : null}
          {app.git_repository ? (
            <p className="font-mono text-xs text-muted-foreground">
              {app.git_repository} @ {app.git_branch ?? "—"}
            </p>
          ) : null}
          {app.build_pack ? (
            <p className="text-xs text-muted-foreground">Build pack: {app.build_pack}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Environment variables</CardTitle>
          <CardDescription>Values are write-only here; existing values are masked.</CardDescription>
        </CardHeader>
        <CardContent>
          <EnvVarsEditor uuid={uuid} initial={envRes.ok ? envRes.data ?? [] : []} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Settings</CardTitle>
          <CardDescription>Domains, build command, and start command.</CardDescription>
        </CardHeader>
        <CardContent>
          <ApplicationSettingsForm
            uuid={uuid}
            initial={{
              domains: app.fqdn ?? "",
              build_command: "",
              start_command: "",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
