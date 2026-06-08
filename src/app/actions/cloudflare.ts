"use server";

import { revalidatePath } from "next/cache";
import type { ZodError } from "zod";

import {
  CLOUDFLARE_SETTING_KEYS,
  isCloudflareConfigured,
} from "@/lib/cloudflare-config";
import { settingsService } from "@/services/settings";
import { cloudflareService } from "@/services/cloudflare/service";
import { CloudflareError } from "@/services/cloudflare/types";
import type {
  CfDnsRecord,
  CfIngressRule,
  CfTlsSettings,
  CfTunnel,
  CfZone,
  CloudflareConnectionResult,
} from "@/services/cloudflare/types";
import {
  cloudflareConfigSchema,
  tunnelCreateSchema,
  tunnelRouteSchema,
  dnsRecordSchema,
  tlsSchema,
} from "@/lib/cloudflare-validation";
import { auditService, type AuditEvent } from "@/services/audit";
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from "@/lib/audit";

export interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  data?: T;
}

function toMessage(err: unknown): string {
  if (err instanceof CloudflareError) return err.message;
  return "Something went wrong talking to Cloudflare. Check the server logs.";
}

function zodFail<T = undefined>(error: ZodError): ActionResult<T> {
  return {
    ok: false,
    error: "Please fix the highlighted fields.",
    fieldErrors: error.flatten().fieldErrors as Record<string, string[]>,
  };
}

async function read<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    return { ok: false, error: toMessage(err) };
  }
}

async function mutateData<T>(
  fn: () => Promise<T>,
  audit: (result: T) => AuditEvent,
): Promise<ActionResult<T>> {
  try {
    const result = await fn();
    await auditService.record(audit(result));
    revalidatePath("/cloudflare");
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: toMessage(err) };
  }
}

async function mutateVoid(
  fn: () => Promise<unknown>,
  audit: AuditEvent,
): Promise<ActionResult> {
  try {
    await fn();
    await auditService.record(audit);
    revalidatePath("/cloudflare");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toMessage(err) };
  }
}

// ---- Config / connection ----

export async function saveCloudflareConfigAction(input: unknown): Promise<ActionResult> {
  const parsed = cloudflareConfigSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);

  const token = parsed.data.apiToken?.trim() ?? "";
  if (!token && !(await settingsService.has(CLOUDFLARE_SETTING_KEYS.apiToken))) {
    return {
      ok: false,
      error: "An API token is required.",
      fieldErrors: { apiToken: ["API token is required"] },
    };
  }
  try {
    if (token) await settingsService.set(CLOUDFLARE_SETTING_KEYS.apiToken, token);
    await settingsService.set(
      CLOUDFLARE_SETTING_KEYS.accountId,
      parsed.data.accountId?.trim() ?? "",
    );
    await auditService.record({
      action: AUDIT_ACTIONS.CF_CONFIG_SAVE,
      summary: "Saved Cloudflare connection",
      targetType: AUDIT_TARGET_TYPES.SETTING,
      metadata: { tokenChanged: Boolean(token) },
    });
    revalidatePath("/settings");
    revalidatePath("/cloudflare");
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not save the settings. Is ENCRYPTION_KEY configured?" };
  }
}

export async function testCloudflareConnectionAction(
  input?: unknown,
): Promise<CloudflareConnectionResult> {
  // Optionally test a token the user typed but hasn't saved yet.
  const token =
    typeof input === "object" && input !== null && "apiToken" in input
      ? String((input as { apiToken?: unknown }).apiToken ?? "").trim()
      : "";

  if (token) return cloudflareService.testConnection(token);

  if (!(await isCloudflareConfigured())) {
    return { ok: false, message: "Enter an API token to test, or save one first." };
  }
  return cloudflareService.testConnection();
}

export async function getZonesAction(): Promise<ActionResult<CfZone[]>> {
  return read(() => cloudflareService.zones.list());
}

// ---- Tunnels ----

export async function getTunnelsAction(): Promise<ActionResult<CfTunnel[]>> {
  return read(() => cloudflareService.tunnels.list());
}

export async function createTunnelAction(input: unknown): Promise<ActionResult<CfTunnel>> {
  const parsed = tunnelCreateSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  return mutateData(
    () => cloudflareService.tunnels.create(parsed.data.name),
    (tunnel) => ({
      action: AUDIT_ACTIONS.CF_TUNNEL_CREATE,
      summary: `Created tunnel ${parsed.data.name}`,
      targetType: AUDIT_TARGET_TYPES.CF_TUNNEL,
      targetId: tunnel?.id ?? "",
    }),
  );
}

export async function deleteTunnelAction(id: string): Promise<ActionResult> {
  return mutateVoid(() => cloudflareService.tunnels.remove(id), {
    action: AUDIT_ACTIONS.CF_TUNNEL_DELETE,
    summary: `Deleted tunnel ${id}`,
    targetType: AUDIT_TARGET_TYPES.CF_TUNNEL,
    targetId: id,
  });
}

export async function getTunnelRoutesAction(id: string): Promise<ActionResult<CfIngressRule[]>> {
  return read(async () => (await cloudflareService.tunnels.getConfig(id)).ingress);
}

/** Insert/update a public-hostname route, preserving a trailing catch-all. */
function withRoute(
  ingress: CfIngressRule[],
  hostname: string,
  service: string,
  path?: string,
): CfIngressRule[] {
  const rules = ingress.filter((r) => r.hostname && r.hostname !== hostname);
  rules.push({ hostname, service, ...(path ? { path } : {}) });
  return [...rules, { service: "http_status:404" }];
}

export async function saveTunnelRouteAction(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = tunnelRouteSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  return mutateVoid(
    async () => {
      const config = await cloudflareService.tunnels.getConfig(id);
      const next = withRoute(
        config.ingress,
        parsed.data.hostname,
        parsed.data.service,
        parsed.data.path || undefined,
      );
      await cloudflareService.tunnels.putConfig(id, next);
    },
    {
      action: AUDIT_ACTIONS.CF_TUNNEL_ROUTE_UPDATE,
      summary: `Routed ${parsed.data.hostname} on tunnel ${id}`,
      targetType: AUDIT_TARGET_TYPES.CF_TUNNEL,
      targetId: id,
      metadata: { hostname: parsed.data.hostname, service: parsed.data.service },
    },
  );
}

export async function deleteTunnelRouteAction(
  id: string,
  hostname: string,
): Promise<ActionResult> {
  return mutateVoid(
    async () => {
      const config = await cloudflareService.tunnels.getConfig(id);
      const rules = config.ingress.filter((r) => r.hostname && r.hostname !== hostname);
      await cloudflareService.tunnels.putConfig(id, [
        ...rules,
        { service: "http_status:404" },
      ]);
    },
    {
      action: AUDIT_ACTIONS.CF_TUNNEL_ROUTE_UPDATE,
      summary: `Removed route ${hostname} from tunnel ${id}`,
      targetType: AUDIT_TARGET_TYPES.CF_TUNNEL,
      targetId: id,
      metadata: { hostname, removed: true },
    },
  );
}

// ---- DNS ----

export async function getDnsRecordsAction(zoneId: string): Promise<ActionResult<CfDnsRecord[]>> {
  return read(() => cloudflareService.dns.list(zoneId));
}

export async function createDnsRecordAction(
  zoneId: string,
  input: unknown,
): Promise<ActionResult<CfDnsRecord>> {
  const parsed = dnsRecordSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  return mutateData(
    () => cloudflareService.dns.create(zoneId, parsed.data),
    (record) => ({
      action: AUDIT_ACTIONS.CF_DNS_CREATE,
      summary: `Created ${parsed.data.type} record ${parsed.data.name}`,
      targetType: AUDIT_TARGET_TYPES.CF_DNS_RECORD,
      targetId: record?.id ?? "",
      metadata: { zoneId },
    }),
  );
}

export async function updateDnsRecordAction(
  zoneId: string,
  id: string,
  input: unknown,
): Promise<ActionResult<CfDnsRecord>> {
  const parsed = dnsRecordSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  return mutateData(
    () => cloudflareService.dns.update(zoneId, id, parsed.data),
    () => ({
      action: AUDIT_ACTIONS.CF_DNS_UPDATE,
      summary: `Updated ${parsed.data.type} record ${parsed.data.name}`,
      targetType: AUDIT_TARGET_TYPES.CF_DNS_RECORD,
      targetId: id,
      metadata: { zoneId },
    }),
  );
}

export async function deleteDnsRecordAction(
  zoneId: string,
  id: string,
): Promise<ActionResult> {
  return mutateVoid(() => cloudflareService.dns.remove(zoneId, id), {
    action: AUDIT_ACTIONS.CF_DNS_DELETE,
    summary: `Deleted DNS record ${id}`,
    targetType: AUDIT_TARGET_TYPES.CF_DNS_RECORD,
    targetId: id,
    metadata: { zoneId },
  });
}

// ---- TLS ----

export async function getTlsSettingsAction(zoneId: string): Promise<ActionResult<CfTlsSettings>> {
  return read(() => cloudflareService.tls.getSettings(zoneId));
}

export async function updateTlsSettingsAction(
  zoneId: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = tlsSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  return mutateVoid(
    async () => {
      await cloudflareService.tls.setSslMode(zoneId, parsed.data.ssl);
      await cloudflareService.tls.setAlwaysUseHttps(zoneId, parsed.data.always_use_https);
    },
    {
      action: AUDIT_ACTIONS.CF_TLS_UPDATE,
      summary: `Set SSL ${parsed.data.ssl} on zone ${zoneId}`,
      targetType: AUDIT_TARGET_TYPES.CF_ZONE,
      targetId: zoneId,
      metadata: {
        ssl: parsed.data.ssl,
        always_use_https: parsed.data.always_use_https,
      },
    },
  );
}
