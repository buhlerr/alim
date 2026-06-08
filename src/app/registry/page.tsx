import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { RegistrySearch } from "@/components/registry/registry-search";
import {
  RegistryTable,
  type RegistryRow,
} from "@/components/registry/registry-table";
import { toSummary } from "@/lib/environments";
import { environmentsService } from "@/services/environments";
import { registryService } from "@/services/registry";

export const dynamic = "force-dynamic";

export default async function RegistryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const records = await registryService.list(q);
  const envList = (await environmentsService.list()).map(toSummary);
  const envByKey = new Map(envList.map((e) => [e.key, e]));

  const rows: RegistryRow[] = records.map((r) => ({
    id: r.id,
    applicationName: r.applicationName,
    environment: (() => {
      const e = envByKey.get(r.environment);
      return { key: r.environment, name: e?.name ?? r.environment, color: e?.color ?? "slate" };
    })(),
    databaseName: r.databaseName,
    username: r.username,
    host: r.host,
    createdAt: r.createdAt.toISOString(),
    createdBy: r.createdBy,
    notes: r.notes,
  }));

  return (
    <div>
      <PageHeader
        title="Databases"
        description={`${rows.length} provisioned database${rows.length === 1 ? "" : "s"}.`}
      />

      <div className="mb-4">
        <Suspense fallback={null}>
          <RegistrySearch />
        </Suspense>
      </div>

      <Card>
        <CardContent className="pt-6">
          <RegistryTable rows={rows} />
        </CardContent>
      </Card>
    </div>
  );
}
