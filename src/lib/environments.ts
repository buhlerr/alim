/**
 * Pure, client-safe environment constants. Kept separate from `targets.ts`
 * (which is server-only because it reads connection strings) so client
 * components and shared validation can import these freely.
 */

export type Environment = "PRODUCTION" | "STAGING" | "DEVELOPMENT";

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
