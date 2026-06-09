import "server-only";
import { prisma } from "@/lib/prisma";
import type { Environment } from "@/lib/targets";
import type { ProvisionedDatabase } from "@prisma/client";

/**
 * Registry service: CRUD over the `provisioned_databases` table.
 *
 * Passwords are never accepted or stored here. The registry holds only
 * non-secret metadata.
 */

export interface RecordInput {
  applicationName: string;
  environment: Environment;
  databaseName: string;
  username: string;
  host: string;
  notes?: string | null;
  createdBy?: string;
}

export const registryService = {
  /**
   * Insert (or update-in-place) a provisioning record. Idempotent on
   * (environment, host, databaseName) so re-provisioning the same target
   * doesn't create duplicate rows.
   */
  async record(input: RecordInput): Promise<ProvisionedDatabase> {
    const createdBy =
      input.createdBy || process.env.PROVISIONED_BY || "internal-admin";
    return prisma.provisionedDatabase.upsert({
      where: {
        env_host_db: {
          environment: input.environment,
          host: input.host,
          databaseName: input.databaseName,
        },
      },
      create: {
        applicationName: input.applicationName,
        environment: input.environment,
        databaseName: input.databaseName,
        username: input.username,
        host: input.host,
        notes: input.notes || null,
        createdBy,
      },
      update: {
        applicationName: input.applicationName,
        username: input.username,
        notes: input.notes || null,
      },
    });
  },

  /** List all records, optionally filtered by a free-text search query. */
  async list(query?: string): Promise<ProvisionedDatabase[]> {
    const q = query?.trim();
    return prisma.provisionedDatabase.findMany({
      where: q
        ? {
            OR: [
              { applicationName: { contains: q, mode: "insensitive" } },
              { databaseName: { contains: q, mode: "insensitive" } },
              { username: { contains: q, mode: "insensitive" } },
            ],
          }
        : undefined,
      orderBy: { createdAt: "desc" },
    });
  },

  /** Most recent N records, for the dashboard. */
  async recent(limit = 5): Promise<ProvisionedDatabase[]> {
    return prisma.provisionedDatabase.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  },

  async getById(id: string): Promise<ProvisionedDatabase | null> {
    return prisma.provisionedDatabase.findUnique({ where: { id } });
  },

  /** Aggregate counts for the dashboard cards, keyed by environment key. */
  async stats(): Promise<{
    total: number;
    byEnvironment: Record<string, number>;
  }> {
    const grouped = await prisma.provisionedDatabase.groupBy({
      by: ["environment"],
      _count: { _all: true },
    });
    const byEnvironment: Record<string, number> = {};
    let total = 0;
    for (const row of grouped) {
      byEnvironment[row.environment] = row._count._all;
      total += row._count._all;
    }
    return { total, byEnvironment };
  },
};
