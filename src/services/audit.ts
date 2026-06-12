import "server-only";
import type { Prisma, AuditLog as AuditLogRow } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentActor } from "@/lib/auth/server";

export type { AuditLogRow };

/**
 * Append-only audit log over the `AuditLog` table. `record()` is best-effort:
 * it never throws into the caller, so instrumenting an action with auditing can
 * never break the action itself.
 */

export interface AuditEvent {
  action: string;
  summary: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
  success?: boolean;
  environment?: string | null;
  /** Defaults to the configured single-admin identity. */
  actor?: string;
}

export interface AuditListFilters {
  action?: string;
  actor?: string;
  targetType?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}

const DEFAULT_LIMIT = 200;

/**
 * The actor to attribute an action to. Prefers the authenticated user resolved
 * by the auth gate; falls back to PROVISIONED_BY (non-request contexts such as
 * scripts), then a static default.
 */
export async function getActor(): Promise<string> {
  return (
    (await getCurrentActor()) ||
    process.env.PROVISIONED_BY?.trim() ||
    "internal-admin"
  );
}

export const auditService = {
  async record(event: AuditEvent): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          actor: event.actor ?? (await getActor()),
          action: event.action,
          summary: event.summary,
          targetType: event.targetType ?? null,
          targetId: event.targetId ?? null,
          metadata:
            event.metadata == null
              ? undefined
              : (event.metadata as Prisma.InputJsonValue),
          success: event.success ?? true,
          environment: event.environment ?? null,
        },
      });
    } catch (err) {
      // Best-effort: auditing must never break the operation it records.
      console.error("[audit] failed to record event", event.action, err);
    }
  },

  async list(filters: AuditListFilters = {}): Promise<AuditLogRow[]> {
    const where: Prisma.AuditLogWhereInput = {};
    if (filters.action) where.action = filters.action;
    if (filters.actor) where.actor = filters.actor;
    if (filters.targetType) where.targetType = filters.targetType;
    if (filters.from || filters.to) {
      where.createdAt = {
        ...(filters.from ? { gte: filters.from } : {}),
        ...(filters.to ? { lte: filters.to } : {}),
      };
    }
    return prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: filters.limit ?? DEFAULT_LIMIT,
    });
  },
};
