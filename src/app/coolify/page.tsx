import { Suspense } from "react";
import Link from "next/link";
import { Cloud, PlusCircle, ExternalLink } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { isCoolifyConfigured } from "@/lib/coolify-config";
import { getCoolifyApplicationsAction } from "@/app/actions/coolify";

export const dynamic = "force-dynamic";

export default async function CoolifyPage() {
  const configured = await isCoolifyConfigured();

  if (!configured) {
    return (
      <div>
        <PageHeader
          title="Coolify"
          description="Create, configure, and deploy applications via Coolify."
        />
        <Card className="border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
          <CardContent className="flex flex-col items-start gap-3 py-6 text-sm">
            <p>Coolify is not connected yet.</p>
            <Button asChild>
              <Link href="/settings">Configure in Settings</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Coolify applications"
        description="Applications managed by your Coolify instance."
        action={
          <Button asChild>
            <Link href="/coolify/new">
              <PlusCircle /> New application
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<ListSkeleton rows={3} />}>
        <CoolifyApps />
      </Suspense>
    </div>
  );
}

async function CoolifyApps() {
  const res = await getCoolifyApplicationsAction();

  return (
    <>
      {!res.ok ? (
        <Card className="border-destructive/40">
          <CardContent className="py-6 text-sm text-destructive">
            {res.error}
          </CardContent>
        </Card>
      ) : res.data && res.data.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {res.data.map((app) => (
            <Link key={app.uuid} href={`/coolify/${app.uuid}`} className="block">
              <Card className="h-full transition-colors hover:border-primary/50">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Cloud className="h-4 w-4 text-muted-foreground" />
                    <CardTitle className="text-base">{app.name}</CardTitle>
                  </div>
                  <CardDescription className="font-mono text-xs">
                    {app.status ?? "unknown"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-1 text-xs text-muted-foreground">
                  {app.fqdn ? (
                    <p className="flex items-center gap-1">
                      <ExternalLink className="h-3 w-3" />
                      {app.fqdn}
                    </p>
                  ) : null}
                  {app.git_repository ? (
                    <p className="truncate font-mono">{app.git_repository}</p>
                  ) : null}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No applications found.{" "}
            <Link href="/coolify/new" className="underline">
              Create the first one.
            </Link>
          </CardContent>
        </Card>
      )}
    </>
  );
}
