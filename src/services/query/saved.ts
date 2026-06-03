import "server-only";
import { prisma } from "@/lib/prisma";
import type { SavedQuery } from "@prisma/client";

/** User-saved queries (the built-in library lives in @/lib/query-library). */
export const savedQueryService = {
  async list(): Promise<SavedQuery[]> {
    return prisma.savedQuery.findMany({ orderBy: { name: "asc" } });
  },

  async create(input: {
    name: string;
    description?: string | null;
    query: string;
  }): Promise<SavedQuery> {
    return prisma.savedQuery.create({
      data: {
        name: input.name.trim().slice(0, 120),
        description: input.description?.trim().slice(0, 500) || null,
        query: input.query.slice(0, 100_000),
      },
    });
  },

  async remove(id: string): Promise<void> {
    await prisma.savedQuery.delete({ where: { id } });
  },
};
