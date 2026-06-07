import { z } from "zod";
import { PALETTE_KEYS } from "./environment-palette";

/**
 * PostgreSQL identifier rule used throughout the app.
 *
 * This regex is also the SQL-injection guard for identifiers: Postgres cannot
 * bind-parameter object names (database/role names), so they are interpolated
 * into SQL after being quoted. By constraining them to `[a-z][a-z0-9_]*` we
 * guarantee the quoted identifier can never break out of its quotes.
 */
export const IDENTIFIER_REGEX = /^[a-z][a-z0-9_]*$/;
export const MAX_IDENTIFIER_LENGTH = 63; // Postgres NAMEDATALEN - 1

export const identifierSchema = z
  .string()
  .min(1, "Required")
  .max(MAX_IDENTIFIER_LENGTH, `Must be ${MAX_IDENTIFIER_LENGTH} characters or fewer`)
  .regex(
    IDENTIFIER_REGEX,
    "Must start with a letter and contain only lowercase letters, numbers, and underscores",
  );

// An environment key. Existence against the live list is verified in actions.
export const environmentSchema = z.string().min(1, "Environment is required");

/** Input for creating a single database. */
export const createDatabaseSchema = z.object({
  environment: environmentSchema,
  applicationName: z
    .string()
    .min(1, "Application name is required")
    .max(100, "Application name is too long"),
  databaseName: identifierSchema,
  username: identifierSchema,
  password: z
    .string()
    .min(16, "Password must be at least 16 characters")
    .max(128, "Password is too long"),
  notes: z.string().max(1000).optional().or(z.literal("")),
});

export type CreateDatabaseInput = z.infer<typeof createDatabaseSchema>;

/** Input for creating a full environment set (one per configured environment). */
export const createEnvSetSchema = z.object({
  applicationName: z
    .string()
    .min(1, "Application name is required")
    .max(100, "Application name is too long"),
  notes: z.string().max(1000).optional().or(z.literal("")),
});

export type CreateEnvSetInput = z.infer<typeof createEnvSetSchema>;

/**
 * A PostgreSQL admin connection string, used by the Settings page to store a
 * target's connection in the encrypted settings store.
 */
export const postgresConnectionSchema = z
  .string()
  .min(1, "Connection string is required")
  .refine((v) => {
    try {
      const u = new URL(v.trim());
      return u.protocol === "postgres:" || u.protocol === "postgresql:";
    } catch {
      return false;
    }
  }, "Must be a valid postgres:// or postgresql:// connection string");

/** Assert an identifier is safe to interpolate into SQL. Throws otherwise. */
export function assertSafeIdentifier(value: string): string {
  if (!IDENTIFIER_REGEX.test(value) || value.length > MAX_IDENTIFIER_LENGTH) {
    throw new Error(`Invalid SQL identifier: "${value}"`);
  }
  return value;
}

/** Input for creating/updating an environment from the Settings UI. */
export const environmentInputSchema = z.object({
  name: z.string().min(1, "Name is required").max(60, "Name is too long"),
  description: z.string().max(500).optional().or(z.literal("")),
  color: z.enum(PALETTE_KEYS as [string, ...string[]]),
  abbreviation: z
    .string()
    .max(30)
    .regex(/^[a-z0-9_]*$/, "Lowercase letters, numbers, and underscores only")
    .optional()
    .or(z.literal("")),
  readOnly: z.boolean().optional(),
  requireWriteConfirm: z.boolean().optional(),
});
export type EnvironmentInput = z.infer<typeof environmentInputSchema>;
