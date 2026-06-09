import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { getMigrationJobAction } from "@/app/actions/migration";
import { MigrationJobView } from "@/components/migration/migration-job-view";

export const dynamic = "force-dynamic";

export default async function MigrationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await getMigrationJobAction(id);
  if (!res.ok || !res.data) notFound();
  const job = res.data;
  return (
    <div>
      <PageHeader
        title={`${job.sourceResourceName} → ${job.destinationResourceName}`}
        description={`${job.migrationType} · ${job.sourceHostName} → ${job.destinationHostName}`}
      />
      <MigrationJobView initialJob={job} />
    </div>
  );
}
