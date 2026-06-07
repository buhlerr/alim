/**
 * Per-environment execution policy for the SQL Console.
 *
 * Pure function so the client can preview the decision (show/skip the confirm
 * modal) and the server can enforce the identical rule authoritatively.
 *
 *   - Reads run immediately, every environment.
 *   - Writes are blocked when the environment is read-only.
 *   - Otherwise writes require typed "CONFIRM" when the environment's
 *     requireWriteConfirm flag is set.
 */
import type { QueryCategory } from "./sql-classify";

export interface PolicyDecision {
  allowed: boolean;
  requiresConfirmation: boolean;
  reason?: string;
}

export function evaluatePolicy(params: {
  category: QueryCategory;
  readOnly: boolean;
  requireWriteConfirm: boolean;
}): PolicyDecision {
  const { category, readOnly, requireWriteConfirm } = params;

  if (category === "read") {
    return { allowed: true, requiresConfirmation: false };
  }
  if (readOnly) {
    return {
      allowed: false,
      requiresConfirmation: false,
      reason: "Write operations are disabled on this environment (it is marked read-only).",
    };
  }
  return { allowed: true, requiresConfirmation: requireWriteConfirm };
}
