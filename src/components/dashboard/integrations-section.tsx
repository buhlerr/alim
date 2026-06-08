import Link from "next/link";
import { CheckCircle2, XCircle, Plug } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getIntegrationOverview, type IntegrationStatus } from "@/services/dashboard";

/**
 * Async server component for the dashboard's Integrations row. Rendered inside a
 * Suspense boundary so the (potentially slow) external status calls stream in
 * without blocking the rest of the dashboard's first paint.
 */
export async function IntegrationsSection() {
  const integrations = await getIntegrationOverview();
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {integrations.map((s) => (
        <IntegrationCard key={s.id} status={s} />
      ))}
    </div>
  );
}

export function IntegrationsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-28 w-full" />
      ))}
    </div>
  );
}

function IntegrationCard({ status }: { status: IntegrationStatus }) {
  return (
    <Link href={status.href} className="block">
      <Card className="h-full transition-colors hover:border-primary/50">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base">{status.name}</CardTitle>
          {!status.configured ? (
            <Badge variant="outline">Not configured</Badge>
          ) : status.reachable ? (
            <Badge variant="success">
              <CheckCircle2 className="mr-1 h-3 w-3" /> Connected
            </Badge>
          ) : (
            <Badge variant="destructive">
              <XCircle className="mr-1 h-3 w-3" /> Unreachable
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          {status.reachable ? (
            <div className="text-2xl font-bold">
              {status.count}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                {status.countLabel}
              </span>
            </div>
          ) : (
            <p className="flex items-center gap-1 text-sm text-muted-foreground">
              <Plug className="h-3.5 w-3.5" />
              {status.configured ? "Could not reach the service" : "Configure in Settings"}
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
