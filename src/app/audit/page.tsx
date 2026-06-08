import { PageHeader } from "@/components/page-header";
import { auditService } from "@/services/audit";
import { AuditView, type AuditRow } from "@/components/audit/audit-view";

export const dynamic = "force-dynamic";

interface SearchParams {
  action?: string;
  actor?: string;
  targetType?: string;
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { action, actor, targetType } = await searchParams;

  const entries = await auditService.list({
    action: action || undefined,
    actor: actor || undefined,
    targetType: targetType || undefined,
  });

  const rows: AuditRow[] = entries.map((e) => ({
    id: e.id,
    createdAt: e.createdAt.toISOString(),
    actor: e.actor,
    action: e.action,
    targetType: e.targetType,
    targetId: e.targetId,
    summary: e.summary,
    success: e.success,
    environment: e.environment,
    metadata: (e.metadata ?? null) as Record<string, unknown> | null,
  }));

  return (
    <div>
      <PageHeader
        title="Audit Log"
        description="Every state-changing action across the platform, newest first."
      />
      <AuditView
        rows={rows}
        filters={{ action: action ?? "", actor: actor ?? "", targetType: targetType ?? "" }}
      />
    </div>
  );
}
