import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { isCoolifyConfigured } from "@/lib/coolify-config";
import { CreateApplicationForm } from "@/components/coolify/create-application-form";

export const dynamic = "force-dynamic";

export default async function NewCoolifyApplicationPage() {
  if (!(await isCoolifyConfigured())) {
    redirect("/coolify");
  }
  return (
    <div>
      <PageHeader
        title="New Coolify application"
        description="Create and configure an application without opening Coolify."
      />
      <Card>
        <CardContent className="pt-6">
          <CreateApplicationForm />
        </CardContent>
      </Card>
    </div>
  );
}
