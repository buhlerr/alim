import Link from "next/link";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { migrationStore } from "@/services/migration/store";
import { MigrationList } from "@/components/migration/migration-list";

export const dynamic = "force-dynamic";

export default async function MigrationsPage() {
  const jobs = await migrationStore.listJobs();
  return (
    <div>
      <PageHeader
        title="Migrations"
        description="Move or clone Coolify resources between servers with validation, manual approval, and resumable progress."
        action={
          <Button asChild>
            <Link href="/migrations/new">
              <Plus className="h-4 w-4" />
              New Migration
            </Link>
          </Button>
        }
      />
      <MigrationList jobs={jobs} />
    </div>
  );
}
