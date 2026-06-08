import "server-only";
import { getCloudflareConfig } from "@/lib/cloudflare-config";
import { cfFetch } from "./client";
import { CloudflareError, type CfTunnel, type CfTunnelConfig, type CfIngressRule } from "./types";

/** Resolve the account-scoped tunnel base path, requiring an account ID. */
async function tunnelBase(): Promise<string> {
  const config = await getCloudflareConfig();
  if (!config?.accountId) {
    throw new CloudflareError(
      "Set your Cloudflare Account ID in Settings to manage tunnels.",
      "NO_ACCOUNT",
    );
  }
  return `/accounts/${config.accountId}/cfd_tunnel`;
}

export const tunnels = {
  async list(): Promise<CfTunnel[]> {
    return cfFetch<CfTunnel[]>({ path: await tunnelBase(), query: { is_deleted: false } });
  },

  async create(name: string): Promise<CfTunnel> {
    return cfFetch<CfTunnel>({
      path: await tunnelBase(),
      method: "POST",
      // config_src "cloudflare" lets us manage ingress via the API.
      body: { name, config_src: "cloudflare" },
    });
  },

  async remove(id: string): Promise<void> {
    await cfFetch<void>({ path: `${await tunnelBase()}/${id}`, method: "DELETE" });
  },

  async getConfig(id: string): Promise<CfTunnelConfig> {
    const result = await cfFetch<{ config?: CfTunnelConfig }>({
      path: `${await tunnelBase()}/${id}/configurations`,
    });
    return result?.config ?? { ingress: [] };
  },

  async putConfig(id: string, ingress: CfIngressRule[]): Promise<void> {
    await cfFetch<void>({
      path: `${await tunnelBase()}/${id}/configurations`,
      method: "PUT",
      body: { config: { ingress } },
    });
  },
};
