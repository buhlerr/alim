import { z } from "zod";

/** Wizard submission schema. Maps a valid form into a create-migration call. */
export const createMigrationSchema = z.object({
  migrationType: z.enum(["clone", "migrate"]),
  sourceResourceId: z.string().trim().min(1, "Select a resource"),
  destinationHost: z.string().trim().min(1, "Select a destination host"),
  destinationResourceName: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(100)
    .regex(/^[a-z0-9][a-z0-9-]*$/i, "Use letters, numbers and hyphens"),
  npmEnabled: z.boolean().optional(),
  cloudflareEnabled: z.boolean().optional(),
  destinationProjectUuid: z.string().optional(),
  destinationEnvironmentName: z.string().optional(),
});

export type CreateMigrationInput = z.infer<typeof createMigrationSchema>;
