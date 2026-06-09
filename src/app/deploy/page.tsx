import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { getDeploymentOptionsAction } from "@/app/actions/deploy";
import { DeploymentWizard } from "@/components/deploy/deployment-wizard";

export const dynamic = "force-dynamic";

export default function DeployPage() {
  return (
    <div>
      <PageHeader
        title="Deploy"
        description="Stand up an application end to end: provision a database, deploy a Coolify app, and point DNS at it. Each step is optional."
      />
      <Suspense fallback={<ListSkeleton rows={4} />}>
        <DeployWizardLoader />
      </Suspense>
    </div>
  );
}

async function DeployWizardLoader() {
  // Loads Coolify projects/servers + Cloudflare zones; streamed so a slow
  // integration doesn't block the page shell.
  const options = await getDeploymentOptionsAction();
  return <DeploymentWizard options={options} />;
}
