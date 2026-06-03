/**
 * Environment-based execution policy for the SQL Console.
 *
 * Pure function so the client can preview the decision (show/skip the confirm
 * modal) and the server can enforce the identical rule authoritatively.
 *
 * Rules:
 *   - Read-only queries (SELECT/SHOW/EXPLAIN/…) run immediately, every env.
 *   - Write/dangerous queries always require typed "CONFIRM" confirmation.
 *   - Production additionally can be hard-locked against writes via the
 *     POSTGRES_PROD_READONLY env var (surfaced as `prodWritesDisabled`).
 */
import type { Environment } from "./environments";
import type { QueryCategory } from "./sql-classify";

export interface PolicyDecision {
  /** Whether the query may run at all. */
  allowed: boolean;
  /** Whether typed "CONFIRM" confirmation is required before running. */
  requiresConfirmation: boolean;
  /** User-facing reason when blocked. */
  reason?: string;
}

export function evaluatePolicy(params: {
  environment: Environment;
  category: QueryCategory;
  prodWritesDisabled: boolean;
}): PolicyDecision {
  const { environment, category, prodWritesDisabled } = params;

  if (category === "read") {
    return { allowed: true, requiresConfirmation: false };
  }

  // category === "write"
  if (environment === "PRODUCTION" && prodWritesDisabled) {
    return {
      allowed: false,
      requiresConfirmation: false,
      reason:
        "Write operations are disabled on Production (POSTGRES_PROD_READONLY is set).",
    };
  }

  return { allowed: true, requiresConfirmation: true };
}
