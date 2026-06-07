import { PageHeader } from "@/components/page-header";
import { QueryConsole } from "@/components/query/query-console";
import { getAllTargetInfo, type Environment } from "@/lib/targets";
import { environmentsService } from "@/services/environments";
import { toSummary } from "@/lib/environments";
import { savedQueryService } from "@/services/query/saved";
import { historyService } from "@/services/query/history";

export const dynamic = "force-dynamic";

export default async function QueryPage() {
  const targets = await getAllTargetInfo();
  const configured = targets.reduce(
    (acc, t) => {
      acc[t.environment as Environment] = t.configured;
      return acc;
    },
    {} as Record<Environment, boolean>,
  );

  const environments = (await environmentsService.list()).map(toSummary);

  const [savedRows, historyRows] = await Promise.all([
    savedQueryService.list(),
    historyService.recent(50),
  ]);

  const initialSaved = savedRows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    query: r.query,
  }));

  const initialHistory = historyRows.map((r) => ({
    id: r.id,
    environment: r.environment as Environment,
    databaseName: r.databaseName,
    query: r.query,
    queryType: r.queryType,
    executionTimeMs: r.executionTimeMs,
    success: r.success,
    errorMessage: r.errorMessage,
    executedAt: r.executedAt.toISOString(),
  }));

  return (
    <div>
      <PageHeader
        title="SQL Query Console"
        description="Run SQL against Production, Staging, and Development servers. Reads run immediately; writes require confirmation."
      />
      <QueryConsole
        configured={configured}
        environments={environments}
        initialSaved={initialSaved}
        initialHistory={initialHistory}
      />
    </div>
  );
}
