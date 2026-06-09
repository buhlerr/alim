/**
 * Client-safe migration constants, unions, and pure helpers. No server-only
 * imports so wizard/list/detail client components and shared validation can use
 * these freely.
 */

export type ResourceType = "application" | "service" | "database";
export const RESOURCE_TYPES: ResourceType[] = ["application", "service", "database"];

export type MigrationType = "clone" | "migrate";
export const MIGRATION_TYPES: MigrationType[] = ["clone", "migrate"];

export type MigrationStatus =
  | "pending"
  | "validating"
  | "provisioning"
  | "transferring"
  | "deploying"
  | "awaiting_approval"
  | "cutting_over"
  | "completed"
  | "failed"
  | "rolled_back";

export type StepStatus = "pending" | "running" | "success" | "failed" | "skipped";
export type LogLevel = "info" | "warn" | "error";
export type Exposure = "internal" | "public";

const TERMINAL: MigrationStatus[] = ["completed", "failed", "rolled_back"];

export function isTerminalStatus(status: string): boolean {
  return (TERMINAL as string[]).includes(status);
}

export const STATUS_LABELS: Record<MigrationStatus, string> = {
  pending: "Pending",
  validating: "Validating",
  provisioning: "Provisioning",
  transferring: "Transferring",
  deploying: "Deploying",
  awaiting_approval: "Awaiting approval",
  cutting_over: "Cutting over",
  completed: "Completed",
  failed: "Failed",
  rolled_back: "Rolled back",
};

/** Strip scheme + path and report whether the host is an sslip.io address. */
export function isSslipDomain(domain: string): boolean {
  const host = domain
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
  return host === "sslip.io" || host.endsWith(".sslip.io");
}

/**
 * Resources whose only domains are sslip.io (or which have none) are internal;
 * any custom domain makes a resource public.
 */
export function classifyExposure(domains: string[]): Exposure {
  const real = domains.map((d) => d.trim()).filter(Boolean);
  if (real.length === 0) return "internal";
  return real.every(isSslipDomain) ? "internal" : "public";
}

export interface ExposureDefaults {
  npmEnabled: boolean;
  cloudflareEnabled: boolean;
}

export function defaultFlags(exposure: Exposure): ExposureDefaults {
  return exposure === "public"
    ? { npmEnabled: true, cloudflareEnabled: true }
    : { npmEnabled: false, cloudflareEnabled: false };
}

/** e.g. buildSslipUrl("abc123", "192.168.100.11") -> https://abc123.192.168.100.11.sslip.io */
export function buildSslipUrl(subdomain: string, hostIp: string): string {
  return `https://${subdomain}.${hostIp}.sslip.io`;
}
