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
  NPM_CONFIG_SAVE: "npm.config.save",
  NPM_PROXY_HOST_CREATE: "npm.proxy_host.create",
  NPM_PROXY_HOST_UPDATE: "npm.proxy_host.update",
  NPM_PROXY_HOST_DELETE: "npm.proxy_host.delete",
  NPM_PROXY_HOST_TOGGLE: "npm.proxy_host.toggle",
  NPM_REDIRECTION_CREATE: "npm.redirection.create",
  NPM_REDIRECTION_UPDATE: "npm.redirection.update",
  NPM_REDIRECTION_DELETE: "npm.redirection.delete",
  NPM_REDIRECTION_TOGGLE: "npm.redirection.toggle",
  NPM_STREAM_CREATE: "npm.stream.create",
  NPM_STREAM_UPDATE: "npm.stream.update",
  NPM_STREAM_DELETE: "npm.stream.delete",
  NPM_STREAM_TOGGLE: "npm.stream.toggle",
  NPM_DEAD_HOST_CREATE: "npm.dead_host.create",
  NPM_DEAD_HOST_UPDATE: "npm.dead_host.update",
  NPM_DEAD_HOST_DELETE: "npm.dead_host.delete",
  NPM_DEAD_HOST_TOGGLE: "npm.dead_host.toggle",
  NPM_CERTIFICATE_REQUEST: "npm.certificate.request",
  NPM_CERTIFICATE_DELETE: "npm.certificate.delete",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export const AUDIT_TARGET_TYPES = {
  DATABASE: "database",
  COOLIFY_APP: "coolify_app",
  ENVIRONMENT: "environment",
  SETTING: "setting",
  SECRET: "secret",
  NPM_PROXY_HOST: "npm_proxy_host",
  NPM_REDIRECTION: "npm_redirection",
  NPM_STREAM: "npm_stream",
  NPM_DEAD_HOST: "npm_dead_host",
  NPM_CERTIFICATE: "npm_certificate",
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
    [AUDIT_ACTIONS.NPM_CONFIG_SAVE]: "Saved NPM config",
    [AUDIT_ACTIONS.NPM_PROXY_HOST_CREATE]: "Created proxy host",
    [AUDIT_ACTIONS.NPM_PROXY_HOST_UPDATE]: "Updated proxy host",
    [AUDIT_ACTIONS.NPM_PROXY_HOST_DELETE]: "Deleted proxy host",
    [AUDIT_ACTIONS.NPM_PROXY_HOST_TOGGLE]: "Toggled proxy host",
    [AUDIT_ACTIONS.NPM_REDIRECTION_CREATE]: "Created redirection",
    [AUDIT_ACTIONS.NPM_REDIRECTION_UPDATE]: "Updated redirection",
    [AUDIT_ACTIONS.NPM_REDIRECTION_DELETE]: "Deleted redirection",
    [AUDIT_ACTIONS.NPM_REDIRECTION_TOGGLE]: "Toggled redirection",
    [AUDIT_ACTIONS.NPM_STREAM_CREATE]: "Created stream",
    [AUDIT_ACTIONS.NPM_STREAM_UPDATE]: "Updated stream",
    [AUDIT_ACTIONS.NPM_STREAM_DELETE]: "Deleted stream",
    [AUDIT_ACTIONS.NPM_STREAM_TOGGLE]: "Toggled stream",
    [AUDIT_ACTIONS.NPM_DEAD_HOST_CREATE]: "Created 404 host",
    [AUDIT_ACTIONS.NPM_DEAD_HOST_UPDATE]: "Updated 404 host",
    [AUDIT_ACTIONS.NPM_DEAD_HOST_DELETE]: "Deleted 404 host",
    [AUDIT_ACTIONS.NPM_DEAD_HOST_TOGGLE]: "Toggled 404 host",
    [AUDIT_ACTIONS.NPM_CERTIFICATE_REQUEST]: "Requested certificate",
    [AUDIT_ACTIONS.NPM_CERTIFICATE_DELETE]: "Deleted certificate",
  };
  return labels[action] ?? action;
}
