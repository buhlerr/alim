import { Badge } from "@/components/ui/badge";
import type { Environment } from "@/lib/environments";
import { ENVIRONMENT_LABELS } from "@/lib/environments";

const VARIANT: Record<
  Environment,
  "default" | "secondary" | "warning" | "destructive"
> = {
  PRODUCTION: "destructive",
  STAGING: "warning",
  DEVELOPMENT: "secondary",
};

export function EnvironmentBadge({
  environment,
}: {
  environment: Environment;
}) {
  return (
    <Badge variant={VARIANT[environment]}>
      {ENVIRONMENT_LABELS[environment]}
    </Badge>
  );
}
