import { PageHeader } from "@/components/page-header";
import { getDeploymentOptionsAction } from "@/app/actions/deploy";
import { DeploymentWizard } from "@/components/deploy/deployment-wizard";

export const dynamic = "force-dynamic";

export default async function DeployPage() {
  const options = await getDeploymentOptionsAction();

  return (
    <div>
      <PageHeader
        title="Deploy"
        description="Stand up an application end to end: provision a database, deploy a Coolify app, and point DNS at it. Each step is optional."
      />
      <DeploymentWizard options={options} />
    </div>
  );
}
