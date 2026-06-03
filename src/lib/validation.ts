import { z } from "zod";
import { ENVIRONMENTS } from "./environments";

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

export const environmentSchema = z.enum(
  ENVIRONMENTS as [string, ...string[]],
);

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

/** Input for creating a full environment set (prod + staging + dev). */
export const createEnvSetSchema = z.object({
  applicationName: z
    .string()
    .min(1, "Application name is required")
    .max(100, "Application name is too long"),
  notes: z.string().max(1000).optional().or(z.literal("")),
});

export type CreateEnvSetInput = z.infer<typeof createEnvSetSchema>;

/** Assert an identifier is safe to interpolate into SQL. Throws otherwise. */
export function assertSafeIdentifier(value: string): string {
  if (!IDENTIFIER_REGEX.test(value) || value.length > MAX_IDENTIFIER_LENGTH) {
    throw new Error(`Invalid SQL identifier: "${value}"`);
  }
  return value;
}
