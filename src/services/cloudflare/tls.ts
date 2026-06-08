import "server-only";
import { cfFetch } from "./client";
import type { CfSslMode, CfTlsSettings } from "./types";

export const tls = {
  async getSettings(zoneId: string): Promise<CfTlsSettings> {
    const [ssl, ahttps] = await Promise.all([
      cfFetch<{ value: CfSslMode }>({ path: `/zones/${zoneId}/settings/ssl` }),
      cfFetch<{ value: string }>({ path: `/zones/${zoneId}/settings/always_use_https` }),
    ]);
    return { ssl: ssl.value, always_use_https: ahttps.value === "on" };
  },

  async setSslMode(zoneId: string, value: CfSslMode): Promise<void> {
    await cfFetch<void>({ path: `/zones/${zoneId}/settings/ssl`, method: "PATCH", body: { value } });
  },

  async setAlwaysUseHttps(zoneId: string, on: boolean): Promise<void> {
    await cfFetch<void>({
      path: `/zones/${zoneId}/settings/always_use_https`,
      method: "PATCH",
      body: { value: on ? "on" : "off" },
    });
  },
};
