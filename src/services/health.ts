import "server-only";

import { isCoolifyConfigured } from "@/lib/coolify-config";
import { isNpmConfigured } from "@/lib/npm-config";
import { isCloudflareConfigured } from "@/lib/cloudflare-config";
import { coolifyService } from "@/services/coolify/service";
import { npmService } from "@/services/npm/service";
import { cloudflareService } from "@/services/cloudflare/service";

export type IntegrationHealth = {
  key: "coolify" | "npm" | "cloudflare";
  label: string;
  configured: boolean;
  ok: boolean;
  detail: string;
};

export type HostHealth = {
  name: string;
  reachable: boolean;
};

export interface IntegrationsHealth {
  integrations: IntegrationHealth[];
  hosts: HostHealth[];
}

async function checkCoolify(): Promise<{ health: IntegrationHealth; isOk: boolean }> {
  try {
    const configured = await isCoolifyConfigured();
    if (!configured) {
      return {
        health: { key: "coolify", label: "Coolify", configured: false, ok: false, detail: "Not configured" },
        isOk: false,
      };
    }
    const r = await coolifyService.testConnection();
    const detail = r.ok
      ? r.version
        ? `Connected (${r.version})`
        : "Connected"
      : r.message;
    return {
      health: { key: "coolify", label: "Coolify", configured: true, ok: r.ok, detail },
      isOk: r.ok,
    };
  } catch (err) {
    return {
      health: {
        key: "coolify",
        label: "Coolify",
        configured: true,
        ok: false,
        detail: err instanceof Error ? err.message : "Unknown error",
      },
      isOk: false,
    };
  }
}

async function checkNpm(): Promise<IntegrationHealth> {
  try {
    const configured = await isNpmConfigured();
    if (!configured) {
      return { key: "npm", label: "Nginx Proxy Manager", configured: false, ok: false, detail: "Not configured" };
    }
    const r = await npmService.testConnection();
    return { key: "npm", label: "Nginx Proxy Manager", configured: true, ok: r.ok, detail: r.ok ? "Connected" : r.message };
  } catch (err) {
    return {
      key: "npm",
      label: "Nginx Proxy Manager",
      configured: true,
      ok: false,
      detail: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

async function checkCloudflare(): Promise<IntegrationHealth> {
  try {
    const configured = await isCloudflareConfigured();
    if (!configured) {
      return { key: "cloudflare", label: "Cloudflare", configured: false, ok: false, detail: "Not configured" };
    }
    const r = await cloudflareService.testConnection();
    return { key: "cloudflare", label: "Cloudflare", configured: true, ok: r.ok, detail: r.ok ? "Connected" : r.message };
  } catch (err) {
    return {
      key: "cloudflare",
      label: "Cloudflare",
      configured: true,
      ok: false,
      detail: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

async function fetchHosts(coolifyOk: boolean): Promise<HostHealth[]> {
  if (!coolifyOk) return [];
  try {
    const servers = await coolifyService.listServers();
    const results = await Promise.all(
      servers.map(async (s) => {
        try {
          const d = await coolifyService.getServer(s.uuid);
          return { name: d.name, reachable: d.settings?.is_reachable ?? false };
        } catch {
          return null;
        }
      }),
    );
    return results.filter((h): h is HostHealth => h !== null);
  } catch {
    return [];
  }
}

export async function getIntegrationsHealth(): Promise<IntegrationsHealth> {
  const [coolifyResult, npmHealth, cloudflareHealth] = await Promise.all([
    checkCoolify(),
    checkNpm(),
    checkCloudflare(),
  ]);

  const coolifyConfigured = coolifyResult.health.configured;
  const coolifyOk = coolifyConfigured && coolifyResult.isOk;

  const hosts = await fetchHosts(coolifyOk);

  return {
    integrations: [coolifyResult.health, npmHealth, cloudflareHealth],
    hosts,
  };
}
