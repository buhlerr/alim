/**
 * Client-safe audit constants. The `action` and `targetType` columns are free
 * strings at the DB level; these constants keep the values consistent across
 * the instrumented server actions and drive the audit viewer's filters.
 *
 * No server-only imports here so the constants can be used in client filter UI.
 */

export const AUDIT_ACTIONS = {
  DATABASE_PROVISION: "database.provision",
  DATABASE_DROP: "database.drop",
  COOLIFY_CONFIG_SAVE: "coolify.config.save",
  COOLIFY_APP_CREATE: "coolify.app.create",
  COOLIFY_APP_DEPLOY: "coolify.app.deploy",
  COOLIFY_ENV_UPDATE: "coolify.env.update",
  ENVIRONMENT_CREATE: "environment.create",
  ENVIRONMENT_UPDATE: "environment.update",
  ENVIRONMENT_DELETE: "environment.delete",
  ENVIRONMENT_REORDER: "environment.reorder",
  SETTINGS_UPDATE: "settings.update",
  SECRET_CREATE: "secret.create",
  SECRET_UPDATE: "secret.update",
  SECRET_DELETE: "secret.delete",
  SECRET_REVEAL: "secret.reveal",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export const AUDIT_TARGET_TYPES = {
  DATABASE: "database",
  COOLIFY_APP: "coolify_app",
  ENVIRONMENT: "environment",
  SETTING: "setting",
  SECRET: "secret",
} as const;

export type AuditTargetType =
  (typeof AUDIT_TARGET_TYPES)[keyof typeof AUDIT_TARGET_TYPES];

/** Human-readable label for an action key (falls back to the raw key). */
export function actionLabel(action: string): string {
  const labels: Record<string, string> = {
    [AUDIT_ACTIONS.DATABASE_PROVISION]: "Provisioned database",
    [AUDIT_ACTIONS.DATABASE_DROP]: "Dropped database",
    [AUDIT_ACTIONS.COOLIFY_CONFIG_SAVE]: "Saved Coolify config",
    [AUDIT_ACTIONS.COOLIFY_APP_CREATE]: "Created Coolify app",
    [AUDIT_ACTIONS.COOLIFY_APP_DEPLOY]: "Deployed Coolify app",
    [AUDIT_ACTIONS.COOLIFY_ENV_UPDATE]: "Updated Coolify env vars",
    [AUDIT_ACTIONS.ENVIRONMENT_CREATE]: "Created environment",
    [AUDIT_ACTIONS.ENVIRONMENT_UPDATE]: "Updated environment",
    [AUDIT_ACTIONS.ENVIRONMENT_DELETE]: "Deleted environment",
    [AUDIT_ACTIONS.ENVIRONMENT_REORDER]: "Reordered environments",
    [AUDIT_ACTIONS.SETTINGS_UPDATE]: "Updated settings",
    [AUDIT_ACTIONS.SECRET_CREATE]: "Created secret",
    [AUDIT_ACTIONS.SECRET_UPDATE]: "Updated secret",
    [AUDIT_ACTIONS.SECRET_DELETE]: "Deleted secret",
    [AUDIT_ACTIONS.SECRET_REVEAL]: "Revealed secret",
  };
  return labels[action] ?? action;
}
