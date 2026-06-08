"use server";

import { revalidatePath } from "next/cache";
import type { ZodError } from "zod";

import { NPM_SETTING_KEYS, isNpmConfigured, getNpmConfig } from "@/lib/npm-config";
import { settingsService } from "@/services/settings";
import { npmService } from "@/services/npm/service";
import { clearToken } from "@/services/npm/auth";
import { NpmError } from "@/services/npm/types";
import type {
  NpmAccessList,
  NpmCertificate,
  NpmConnectionResult,
  NpmDeadHost,
  NpmProxyHost,
  NpmRedirectionHost,
  NpmStream,
  ProxyHostRequest,
  RedirectionHostRequest,
  DeadHostRequest,
} from "@/services/npm/types";
import {
  npmConfigSchema,
  proxyHostSchema,
  redirectionHostSchema,
  streamSchema,
  deadHostSchema,
  letsEncryptSchema,
  parseDomains,
  type ProxyHostInput,
  type RedirectionHostInput,
  type DeadHostInput,
} from "@/lib/npm-validation";
import { auditService, type AuditEvent } from "@/services/audit";
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from "@/lib/audit";

export interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  data?: T;
}

function toMessage(err: unknown): string {
  if (err instanceof NpmError) return err.message;
  return "Something went wrong talking to Nginx Proxy Manager. Check the server logs.";
}

function zodFail<T = undefined>(error: ZodError): ActionResult<T> {
  return {
    ok: false,
    error: "Please fix the highlighted fields.",
    fieldErrors: error.flatten().fieldErrors as Record<string, string[]>,
  };
}

/** Run a read against NPM, normalizing failures into an ActionResult. */
async function read<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    return { ok: false, error: toMessage(err) };
  }
}

/** Run a data-returning mutation, audit on success, and revalidate /npm. */
async function mutate<T>(
  fn: () => Promise<T>,
  audit: (result: T) => AuditEvent,
): Promise<ActionResult<T>> {
  try {
    const result = await fn();
    await auditService.record(audit(result));
    revalidatePath("/npm");
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: toMessage(err) };
  }
}

/** Run a void mutation (delete/toggle), audit on success, and revalidate. */
async function mutateVoid(
  fn: () => Promise<unknown>,
  audit: AuditEvent,
): Promise<ActionResult> {
  try {
    await fn();
    await auditService.record(audit);
    revalidatePath("/npm");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toMessage(err) };
  }
}

// ---- Connection / config ----

export async function saveNpmConfigAction(input: unknown): Promise<ActionResult> {
  const parsed = npmConfigSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);

  const secret = parsed.data.secret?.trim() ?? "";
  // Required on first-time setup; a blank password on update keeps the stored
  // one (we never echo it back to the client).
  if (!secret && !(await settingsService.has(NPM_SETTING_KEYS.secret))) {
    return {
      ok: false,
      error: "A password is required.",
      fieldErrors: { secret: ["Password is required"] },
    };
  }
  try {
    await settingsService.set(NPM_SETTING_KEYS.baseUrl, parsed.data.baseUrl);
    await settingsService.set(NPM_SETTING_KEYS.identity, parsed.data.identity);
    if (secret) await settingsService.set(NPM_SETTING_KEYS.secret, secret);

    // Drop any cached JWT so the next call mints one with the new credentials.
    const config = await getNpmConfig();
    if (config) clearToken(config);

    await auditService.record({
      action: AUDIT_ACTIONS.NPM_CONFIG_SAVE,
      summary: "Saved Nginx Proxy Manager connection",
      targetType: AUDIT_TARGET_TYPES.SETTING,
      metadata: { baseUrl: parsed.data.baseUrl, passwordChanged: Boolean(secret) },
    });
    revalidatePath("/settings");
    revalidatePath("/npm");
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "Could not save the settings. Is ENCRYPTION_KEY configured?",
    };
  }
}

export async function testNpmConnectionAction(): Promise<NpmConnectionResult> {
  if (!(await isNpmConfigured())) {
    return { ok: false, message: "Nginx Proxy Manager is not configured yet." };
  }
  return npmService.testConnection();
}

/** Certificates + access lists, for populating host forms. */
export async function getNpmFormOptionsAction(): Promise<
  ActionResult<{ certificates: NpmCertificate[]; accessLists: NpmAccessList[] }>
> {
  try {
    const [certificates, accessLists] = await Promise.all([
      npmService.certificates.list(),
      npmService.accessLists.list(),
    ]);
    return { ok: true, data: { certificates, accessLists } };
  } catch (err) {
    return { ok: false, error: toMessage(err) };
  }
}

// ---- Request builders ----

function toProxyRequest(d: ProxyHostInput): ProxyHostRequest {
  const hasCert = d.certificate_id > 0;
  return {
    domain_names: parseDomains(d.domain_names),
    forward_scheme: d.forward_scheme,
    forward_host: d.forward_host.trim(),
    forward_port: d.forward_port,
    certificate_id: d.certificate_id,
    // SSL options only make sense with a certificate attached.
    ssl_forced: hasCert && d.ssl_forced,
    http2_support: hasCert && d.http2_support,
    hsts_enabled: hasCert && d.hsts_enabled,
    block_exploits: d.block_exploits,
    caching_enabled: d.caching_enabled,
    allow_websocket_upgrade: d.allow_websocket_upgrade,
    access_list_id: d.access_list_id,
    advanced_config: d.advanced_config || "",
  };
}

function toRedirectionRequest(d: RedirectionHostInput): RedirectionHostRequest {
  const hasCert = d.certificate_id > 0;
  return {
    domain_names: parseDomains(d.domain_names),
    forward_scheme: d.forward_scheme,
    forward_domain_name: d.forward_domain_name.trim(),
    forward_http_code: d.forward_http_code,
    preserve_path: d.preserve_path,
    certificate_id: d.certificate_id,
    ssl_forced: hasCert && d.ssl_forced,
    block_exploits: d.block_exploits,
    advanced_config: d.advanced_config || "",
  };
}

function toDeadHostRequest(d: DeadHostInput): DeadHostRequest {
  const hasCert = d.certificate_id > 0;
  return {
    domain_names: parseDomains(d.domain_names),
    certificate_id: d.certificate_id,
    ssl_forced: hasCert && d.ssl_forced,
    http2_support: hasCert && d.http2_support,
    advanced_config: d.advanced_config || "",
  };
}

// ---- Proxy hosts ----

export async function getProxyHostsAction(): Promise<ActionResult<NpmProxyHost[]>> {
  return read(() => npmService.proxyHosts.list());
}

export async function createProxyHostAction(
  input: unknown,
): Promise<ActionResult<NpmProxyHost>> {
  const parsed = proxyHostSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  return mutate(
    () => npmService.proxyHosts.create(toProxyRequest(parsed.data)),
    (host) => ({
      action: AUDIT_ACTIONS.NPM_PROXY_HOST_CREATE,
      summary: `Created proxy host ${parseDomains(parsed.data.domain_names).join(", ")}`,
      targetType: AUDIT_TARGET_TYPES.NPM_PROXY_HOST,
      targetId: String(host?.id ?? ""),
    }),
  );
}

export async function updateProxyHostAction(
  id: number,
  input: unknown,
): Promise<ActionResult<NpmProxyHost>> {
  const parsed = proxyHostSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  return mutate(
    () => npmService.proxyHosts.update(id, toProxyRequest(parsed.data)),
    () => ({
      action: AUDIT_ACTIONS.NPM_PROXY_HOST_UPDATE,
      summary: `Updated proxy host ${id}`,
      targetType: AUDIT_TARGET_TYPES.NPM_PROXY_HOST,
      targetId: String(id),
    }),
  );
}

export async function deleteProxyHostAction(id: number): Promise<ActionResult> {
  return mutateVoid(() => npmService.proxyHosts.remove(id), {
    action: AUDIT_ACTIONS.NPM_PROXY_HOST_DELETE,
    summary: `Deleted proxy host ${id}`,
    targetType: AUDIT_TARGET_TYPES.NPM_PROXY_HOST,
    targetId: String(id),
  });
}

export async function toggleProxyHostAction(
  id: number,
  enable: boolean,
): Promise<ActionResult> {
  return mutateVoid(
    () => (enable ? npmService.proxyHosts.enable(id) : npmService.proxyHosts.disable(id)),
    {
      action: AUDIT_ACTIONS.NPM_PROXY_HOST_TOGGLE,
      summary: `${enable ? "Enabled" : "Disabled"} proxy host ${id}`,
      targetType: AUDIT_TARGET_TYPES.NPM_PROXY_HOST,
      targetId: String(id),
      metadata: { enabled: enable },
    },
  );
}

// ---- Redirection hosts ----

export async function getRedirectionHostsAction(): Promise<
  ActionResult<NpmRedirectionHost[]>
> {
  return read(() => npmService.redirectionHosts.list());
}

export async function createRedirectionHostAction(
  input: unknown,
): Promise<ActionResult<NpmRedirectionHost>> {
  const parsed = redirectionHostSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  return mutate(
    () => npmService.redirectionHosts.create(toRedirectionRequest(parsed.data)),
    (host) => ({
      action: AUDIT_ACTIONS.NPM_REDIRECTION_CREATE,
      summary: `Created redirection ${parseDomains(parsed.data.domain_names).join(", ")}`,
      targetType: AUDIT_TARGET_TYPES.NPM_REDIRECTION,
      targetId: String(host?.id ?? ""),
    }),
  );
}

export async function updateRedirectionHostAction(
  id: number,
  input: unknown,
): Promise<ActionResult<NpmRedirectionHost>> {
  const parsed = redirectionHostSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  return mutate(
    () => npmService.redirectionHosts.update(id, toRedirectionRequest(parsed.data)),
    () => ({
      action: AUDIT_ACTIONS.NPM_REDIRECTION_UPDATE,
      summary: `Updated redirection ${id}`,
      targetType: AUDIT_TARGET_TYPES.NPM_REDIRECTION,
      targetId: String(id),
    }),
  );
}

export async function deleteRedirectionHostAction(id: number): Promise<ActionResult> {
  return mutateVoid(() => npmService.redirectionHosts.remove(id), {
    action: AUDIT_ACTIONS.NPM_REDIRECTION_DELETE,
    summary: `Deleted redirection ${id}`,
    targetType: AUDIT_TARGET_TYPES.NPM_REDIRECTION,
    targetId: String(id),
  });
}

export async function toggleRedirectionHostAction(
  id: number,
  enable: boolean,
): Promise<ActionResult> {
  return mutateVoid(
    () =>
      enable
        ? npmService.redirectionHosts.enable(id)
        : npmService.redirectionHosts.disable(id),
    {
      action: AUDIT_ACTIONS.NPM_REDIRECTION_TOGGLE,
      summary: `${enable ? "Enabled" : "Disabled"} redirection ${id}`,
      targetType: AUDIT_TARGET_TYPES.NPM_REDIRECTION,
      targetId: String(id),
      metadata: { enabled: enable },
    },
  );
}

// ---- Streams ----

export async function getStreamsAction(): Promise<ActionResult<NpmStream[]>> {
  return read(() => npmService.streams.list());
}

export async function createStreamAction(
  input: unknown,
): Promise<ActionResult<NpmStream>> {
  const parsed = streamSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  return mutate(
    () => npmService.streams.create(parsed.data),
    (stream) => ({
      action: AUDIT_ACTIONS.NPM_STREAM_CREATE,
      summary: `Created stream :${parsed.data.incoming_port}`,
      targetType: AUDIT_TARGET_TYPES.NPM_STREAM,
      targetId: String(stream?.id ?? ""),
    }),
  );
}

export async function updateStreamAction(
  id: number,
  input: unknown,
): Promise<ActionResult<NpmStream>> {
  const parsed = streamSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  return mutate(
    () => npmService.streams.update(id, parsed.data),
    () => ({
      action: AUDIT_ACTIONS.NPM_STREAM_UPDATE,
      summary: `Updated stream ${id}`,
      targetType: AUDIT_TARGET_TYPES.NPM_STREAM,
      targetId: String(id),
    }),
  );
}

export async function deleteStreamAction(id: number): Promise<ActionResult> {
  return mutateVoid(() => npmService.streams.remove(id), {
    action: AUDIT_ACTIONS.NPM_STREAM_DELETE,
    summary: `Deleted stream ${id}`,
    targetType: AUDIT_TARGET_TYPES.NPM_STREAM,
    targetId: String(id),
  });
}

export async function toggleStreamAction(
  id: number,
  enable: boolean,
): Promise<ActionResult> {
  return mutateVoid(
    () => (enable ? npmService.streams.enable(id) : npmService.streams.disable(id)),
    {
      action: AUDIT_ACTIONS.NPM_STREAM_TOGGLE,
      summary: `${enable ? "Enabled" : "Disabled"} stream ${id}`,
      targetType: AUDIT_TARGET_TYPES.NPM_STREAM,
      targetId: String(id),
      metadata: { enabled: enable },
    },
  );
}

// ---- 404 / dead hosts ----

export async function getDeadHostsAction(): Promise<ActionResult<NpmDeadHost[]>> {
  return read(() => npmService.deadHosts.list());
}

export async function createDeadHostAction(
  input: unknown,
): Promise<ActionResult<NpmDeadHost>> {
  const parsed = deadHostSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  return mutate(
    () => npmService.deadHosts.create(toDeadHostRequest(parsed.data)),
    (host) => ({
      action: AUDIT_ACTIONS.NPM_DEAD_HOST_CREATE,
      summary: `Created 404 host ${parseDomains(parsed.data.domain_names).join(", ")}`,
      targetType: AUDIT_TARGET_TYPES.NPM_DEAD_HOST,
      targetId: String(host?.id ?? ""),
    }),
  );
}

export async function updateDeadHostAction(
  id: number,
  input: unknown,
): Promise<ActionResult<NpmDeadHost>> {
  const parsed = deadHostSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  return mutate(
    () => npmService.deadHosts.update(id, toDeadHostRequest(parsed.data)),
    () => ({
      action: AUDIT_ACTIONS.NPM_DEAD_HOST_UPDATE,
      summary: `Updated 404 host ${id}`,
      targetType: AUDIT_TARGET_TYPES.NPM_DEAD_HOST,
      targetId: String(id),
    }),
  );
}

export async function deleteDeadHostAction(id: number): Promise<ActionResult> {
  return mutateVoid(() => npmService.deadHosts.remove(id), {
    action: AUDIT_ACTIONS.NPM_DEAD_HOST_DELETE,
    summary: `Deleted 404 host ${id}`,
    targetType: AUDIT_TARGET_TYPES.NPM_DEAD_HOST,
    targetId: String(id),
  });
}

export async function toggleDeadHostAction(
  id: number,
  enable: boolean,
): Promise<ActionResult> {
  return mutateVoid(
    () => (enable ? npmService.deadHosts.enable(id) : npmService.deadHosts.disable(id)),
    {
      action: AUDIT_ACTIONS.NPM_DEAD_HOST_TOGGLE,
      summary: `${enable ? "Enabled" : "Disabled"} 404 host ${id}`,
      targetType: AUDIT_TARGET_TYPES.NPM_DEAD_HOST,
      targetId: String(id),
      metadata: { enabled: enable },
    },
  );
}

// ---- Certificates ----

export async function getCertificatesAction(): Promise<ActionResult<NpmCertificate[]>> {
  return read(() => npmService.certificates.list());
}

export async function requestCertificateAction(
  input: unknown,
): Promise<ActionResult<NpmCertificate>> {
  const parsed = letsEncryptSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const domainNames = parseDomains(parsed.data.domain_names);
  return mutate(
    () =>
      npmService.certificates.requestLetsEncrypt({
        domainNames,
        email: parsed.data.email,
      }),
    (cert) => ({
      action: AUDIT_ACTIONS.NPM_CERTIFICATE_REQUEST,
      summary: `Requested Let's Encrypt cert for ${domainNames.join(", ")}`,
      targetType: AUDIT_TARGET_TYPES.NPM_CERTIFICATE,
      targetId: String(cert?.id ?? ""),
    }),
  );
}

export async function deleteCertificateAction(id: number): Promise<ActionResult> {
  return mutateVoid(() => npmService.certificates.remove(id), {
    action: AUDIT_ACTIONS.NPM_CERTIFICATE_DELETE,
    summary: `Deleted certificate ${id}`,
    targetType: AUDIT_TARGET_TYPES.NPM_CERTIFICATE,
    targetId: String(id),
  });
}
