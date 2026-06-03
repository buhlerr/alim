import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreateDatabaseForm } from "@/components/create/create-database-form";
import { CreateEnvSetForm } from "@/components/create/create-env-set-form";
import { getAllTargetInfo, type Environment } from "@/lib/targets";

export const dynamic = "force-dynamic";

export default async function CreatePage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;
  const targets = getAllTargetInfo();
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
            No PostgreSQL servers are configured yet. Set{" "}
            <code className="font-mono">POSTGRES_PROD_URL</code>,{" "}
            <code className="font-mono">POSTGRES_STAGING_URL</code>, or{" "}
            <code className="font-mono">POSTGRES_DEV_URL</code> in the
            environment, then check the Settings page.
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
              <CreateDatabaseForm configured={configured} />
            </TabsContent>
            <TabsContent value="set">
              <CreateEnvSetForm />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
