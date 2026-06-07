import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreateDatabaseForm } from "@/components/create/create-database-form";
import { CreateEnvSetForm } from "@/components/create/create-env-set-form";
import { getAllTargetInfo, type Environment } from "@/lib/targets";
import { environmentsService } from "@/services/environments";
import { toSummary } from "@/lib/environments";

export const dynamic = "force-dynamic";

export default async function CreatePage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;
  const targets = await getAllTargetInfo();
  const environments = (await environmentsService.list()).map(toSummary);
  const configured = targets.reduce(
    (acc, t) => {
      acc[t.environment as Environment] = t.configured;
      return acc;
    },
    {} as Record<Environment, boolean>,
  );

  const noneConfigured = targets.every((t) => !t.configured);

  return (
    <div>
      <PageHeader
        title="Create database"
        description="Provision a PostgreSQL database, user, and the privileges Prisma & NestJS need."
      />

      {noneConfigured ? (
        <Card className="mb-6 border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
          <CardContent className="py-4 text-sm text-amber-800 dark:text-amber-300">
            No PostgreSQL servers are configured yet. Add a connection string for
            an environment on the{" "}
            <a href="/settings" className="font-medium underline">
              Settings page
            </a>{" "}
            to get started.
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue={mode === "set" ? "set" : "single"}>
            <TabsList className="mb-6">
              <TabsTrigger value="single">Single database</TabsTrigger>
              <TabsTrigger value="set">Full environment set</TabsTrigger>
            </TabsList>
            <TabsContent value="single">
              <CreateDatabaseForm configured={configured} environments={environments} />
            </TabsContent>
            <TabsContent value="set">
              <CreateEnvSetForm environments={environments} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
