import "server-only";
import { prisma } from "@/lib/prisma";
import type { Environment as EnvironmentRow } from "@prisma/client";

export interface CreateEnvironmentInput {
  name: string;
  description?: string | null;
  color: string;
  abbreviation?: string | null;
  readOnly?: boolean;
  requireWriteConfirm?: boolean;
}

export interface UpdateEnvironmentInput {
  name?: string;
  description?: string | null;
  color?: string;
  abbreviation?: string | null;
  readOnly?: boolean;
  requireWriteConfirm?: boolean;
}

export interface RemoveResult {
  ok: boolean;
  error?: string;
}

/** Turn a display name into a stable uppercase key stem (A–Z, 0–9, underscore). */
function slugifyKey(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

/** Lowercased slug used as the default db-name abbreviation. */
function slugifyAbbrev(name: string): string {
  return slugifyKey(name).toLowerCase();
}

export const environmentsService = {
  async list(): Promise<EnvironmentRow[]> {
    return prisma.environment.findMany({ orderBy: { sortOrder: "asc" } });
  },

  async get(key: string): Promise<EnvironmentRow | null> {
    return prisma.environment.findUnique({ where: { key } });
  },

  async create(input: CreateEnvironmentInput): Promise<EnvironmentRow> {
    const base = slugifyKey(input.name) || "ENV";
    let key = base;
    let n = 2;
    while (await prisma.environment.findUnique({ where: { key } })) {
      key = `${base}_${n++}`;
    }
    const max = await prisma.environment.aggregate({ _max: { sortOrder: true } });
    const sortOrder = (max._max.sortOrder ?? -1) + 1;
    return prisma.environment.create({
      data: {
        key,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        color: input.color,
        abbreviation:
          input.abbreviation != null
            ? input.abbreviation.trim()
            : slugifyAbbrev(input.name),
        sortOrder,
        readOnly: input.readOnly ?? false,
        requireWriteConfirm: input.requireWriteConfirm ?? true,
      },
    });
  },

  async update(key: string, input: UpdateEnvironmentInput): Promise<EnvironmentRow> {
    return prisma.environment.update({
      where: { key },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined
          ? { description: input.description?.trim() || null }
          : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
        ...(input.abbreviation !== undefined
          ? { abbreviation: input.abbreviation?.trim() || null }
          : {}),
        ...(input.readOnly !== undefined ? { readOnly: input.readOnly } : {}),
        ...(input.requireWriteConfirm !== undefined
          ? { requireWriteConfirm: input.requireWriteConfirm }
          : {}),
      },
    });
  },

  async remove(key: string): Promise<RemoveResult> {
    try {
      await prisma.environment.delete({ where: { key } });
      return { ok: true };
    } catch (err) {
      if ((err as { code?: string }).code === "P2003") {
        return {
          ok: false,
          error:
            "This environment is in use by provisioned databases or query history and can't be deleted.",
        };
      }
      throw err;
    }
  },

  async reorder(keys: string[]): Promise<void> {
    await prisma.$transaction(
      keys.map((key, index) =>
        prisma.environment.update({ where: { key }, data: { sortOrder: index } }),
      ),
    );
  },
};
