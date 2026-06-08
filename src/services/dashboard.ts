import "server-only";
import { isCoolifyConfigured } from "@/lib/coolify-config";
import { isNpmConfigured } from "@/lib/npm-config";
import { isCloudflareConfigured } from "@/lib/cloudflare-config";
import { coolifyService } from "@/services/coolify/service";
import { npmService } from "@/services/npm/service";
import { cloudflareService } from "@/services/cloudflare/service";

export interface IntegrationStatus {
  id: "coolify" | "npm" | "cloudflare";
  name: string;
  href: string;
  configured: boolean;
  /** True only when configured AND the count call succeeded. */
  reachable: boolean;
  /** Primary count when reachable, else null. */
  count: number | null;
  countLabel: string;
  /** Safe error message when configured but unreachable. */
  error?: string;
}

/**
 * One integration's status. Skips the network call entirely when unconfigured,
 * and never throws — a failing/slow integration degrades to "unreachable"
 * instead of breaking the dashboard.
 */
async function status(
  id: IntegrationStatus["id"],
  name: string,
  href: string,
  countLabel: string,
  configured: boolean,
  count: () => Promise<unknown[]>,
): Promise<IntegrationStatus> {
  const base = { id, name, href, countLabel, configured, reachable: false, count: null };
  if (!configured) return base;
  try {
    const items = await count();
    return { ...base, reachable: true, count: items.length };
  } catch (err) {
    return { ...base, error: err instanceof Error ? err.message : "Unreachable" };
  }
}

/** Status + primary count for each infrastructure integration, run in parallel. */
export async function getIntegrationOverview(): Promise<IntegrationStatus[]> {
  const [coolifyOk, npmOk, cfOk] = await Promise.all([
    isCoolifyConfigured(),
    isNpmConfigured(),
    isCloudflareConfigured(),
  ]);

  return Promise.all([
    status("coolify", "Coolify", "/coolify", "apps", coolifyOk, () =>
      coolifyService.listApplications(),
    ),
    status("npm", "Proxy Hosts", "/npm", "proxy hosts", npmOk, () =>
      npmService.proxyHosts.list(),
    ),
    status("cloudflare", "Cloudflare", "/cloudflare", "zones", cfOk, () =>
      cloudflareService.zones.list(),
    ),
  ]);
}
