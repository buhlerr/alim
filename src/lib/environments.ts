/**
 * Pure, client-safe environment constants. Kept separate from `targets.ts`
 * (which is server-only because it reads connection strings) so client
 * components and shared validation can import these freely.
 */
import type { Environment as EnvironmentRow } from "@prisma/client";

/**
 * An environment key. Once a compile-time union; now a runtime-defined string
 * (the `Environment.key` column). The live list comes from `environmentsService`.
 */
export type Environment = string;

export const ENVIRONMENTS: Environment[] = [
  "PRODUCTION",
  "STAGING",
  "DEVELOPMENT",
];

export const ENVIRONMENT_LABELS: Record<Environment, string> = {
  PRODUCTION: "Production",
  STAGING: "Staging",
  DEVELOPMENT: "Development",
};

export function isEnvironment(value: unknown): value is Environment {
  return (
    typeof value === "string" && ENVIRONMENTS.includes(value as Environment)
  );
}

/** Client-safe, non-secret view of an environment passed from server to client. */
export interface EnvironmentSummary {
  key: string;
  name: string;
  description: string | null;
  color: string;
  abbreviation: string | null;
  sortOrder: number;
  readOnly: boolean;
  requireWriteConfirm: boolean;
}

/** Map a Prisma Environment row to the client-safe summary. */
export function toSummary(row: EnvironmentRow): EnvironmentSummary {
  return {
    key: row.key,
    name: row.name,
    description: row.description,
    color: row.color,
    abbreviation: row.abbreviation,
    sortOrder: row.sortOrder,
    readOnly: row.readOnly,
    requireWriteConfirm: row.requireWriteConfirm,
  };
}
