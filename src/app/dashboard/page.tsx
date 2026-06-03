import Link from "next/link";
import {
  Database,
  Layers,
  PlusCircle,
  Server,
  ListChecks,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { EnvironmentBadge } from "@/components/environment-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAllTargetInfo, type Environment } from "@/lib/targets";
import { registryService } from "@/services/registry";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [stats, recent, targets] = await Promise.all([
    registryService.stats(),
    registryService.recent(8),
    Promise.resolve(getAllTargetInfo()),
  ]);

  const configuredCount = targets.filter((t) => t.configured).length;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Provision and track PostgreSQL databases across Aspyre Labs environments."
        action={
          <Button asChild>
            <Link href="/create">
              <PlusCircle /> Create database
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total databases"
          value={stats.total}
          icon={<Database className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Production"
          value={stats.byEnvironment.PRODUCTION}
          icon={<Layers className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Staging"
          value={stats.byEnvironment.STAGING}
          icon={<Layers className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Configured servers"
          value={`${configuredCount}/3`}
          icon={<Server className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Quick actions */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
            <CardDescription>Common provisioning tasks.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href="/create">
                <PlusCircle /> Create a single database
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href="/create?mode=set">
                <Layers /> Create full environment set
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href="/registry">
                <ListChecks /> Browse the registry
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Server targets */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Server targets</CardTitle>
            <CardDescription>
              Configured via environment variables. Manage on the Settings page.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {targets.map((t) => (
              <div
                key={t.environment}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="flex items-center gap-3">
                  <EnvironmentBadge
                    environment={t.environment as Environment}
                  />
                  <span className="font-mono text-sm">
                    {t.configured ? t.host : "—"}
                  </span>
                </div>
                <span
                  className={
                    t.configured
                      ? "text-xs font-medium text-emerald-600"
                      : "text-xs font-medium text-muted-foreground"
                  }
                >
                  {t.configured ? "Configured" : "Not configured"}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Recently provisioned */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Recently provisioned</CardTitle>
          <CardDescription>The latest databases created.</CardDescription>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No databases provisioned yet.{" "}
              <Link href="/create" className="underline">
                Create your first one.
              </Link>
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Application</TableHead>
                  <TableHead>Environment</TableHead>
                  <TableHead>Database</TableHead>
                  <TableHead>Host</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      {row.applicationName}
                    </TableCell>
                    <TableCell>
                      <EnvironmentBadge
                        environment={row.environment as Environment}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.databaseName}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.host}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.createdAt.toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: number | string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
