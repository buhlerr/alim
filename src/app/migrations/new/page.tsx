import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { getMigrationOptionsAction } from "@/app/actions/migration";
import { MigrationWizard } from "@/components/migration/migration-wizard";

export const dynamic = "force-dynamic";

export default function NewMigrationPage() {
  return (
    <div>
      <PageHeader
        title="New Migration"
        description="Select a resource, choose clone or migrate, pick a destination, validate, review the plan, and execute."
      />
      <Suspense fallback={<ListSkeleton rows={5} />}>
        <Loader />
      </Suspense>
    </div>
  );
}

async function Loader() {
  const options = await getMigrationOptionsAction();
  return <MigrationWizard options={options} />;
}
