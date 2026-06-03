import "server-only";
import { prisma } from "@/lib/prisma";
import type { Environment } from "@/lib/targets";
import type { QueryHistory } from "@prisma/client";

/**
 * Query history — metadata only. Connection strings and passwords are never
 * passed in or stored. The query text itself IS stored for review/re-run.
 */
export const historyService = {
  async record(input: {
    environment: Environment;
    databaseName: string;
    query: string;
    queryType: string;
    executionTimeMs?: number | null;
    success: boolean;
    errorMessage?: string | null;
  }): Promise<void> {
    await prisma.queryHistory.create({
      data: {
        environment: input.environment,
        databaseName: input.databaseName,
        query: input.query.slice(0, 100_000), // guard against absurd payloads
        queryType: input.queryType,
        executionTimeMs: input.executionTimeMs ?? null,
        success: input.success,
        errorMessage: input.errorMessage?.slice(0, 2000) ?? null,
      },
    });
  },

  async recent(limit = 50): Promise<QueryHistory[]> {
    return prisma.queryHistory.findMany({
      orderBy: { executedAt: "desc" },
      take: limit,
    });
  },
};
