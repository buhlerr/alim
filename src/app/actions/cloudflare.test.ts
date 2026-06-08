import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/services/audit", () => ({ auditService: { record: vi.fn() } }));
vi.mock("@/lib/cloudflare-config", () => ({
  CLOUDFLARE_SETTING_KEYS: { apiToken: "cloudflare.apiToken", accountId: "cloudflare.accountId" },
  isCloudflareConfigured: vi.fn(),
}));
vi.mock("@/services/settings", () => ({
  settingsService: { set: vi.fn(), has: vi.fn() },
}));
vi.mock("@/services/cloudflare/service", () => ({
  cloudflareService: {
    tunnels: { create: vi.fn(), getConfig: vi.fn(), putConfig: vi.fn() },
    dns: { create: vi.fn(), remove: vi.fn() },
    tls: { setSslMode: vi.fn(), setAlwaysUseHttps: vi.fn() },
  },
}));

import { auditService } from "@/services/audit";
import { cloudflareService } from "@/services/cloudflare/service";
import {
  createDnsRecordAction,
  saveTunnelRouteAction,
  deleteTunnelRouteAction,
  updateTlsSettingsAction,
} from "./cloudflare";

const dnsCreate = cloudflareService.dns.create as unknown as ReturnType<typeof vi.fn>;
const getConfig = cloudflareService.tunnels.getConfig as unknown as ReturnType<typeof vi.fn>;
const putConfig = cloudflareService.tunnels.putConfig as unknown as ReturnType<typeof vi.fn>;
const setSsl = cloudflareService.tls.setSslMode as unknown as ReturnType<typeof vi.fn>;
const setAhttps = cloudflareService.tls.setAlwaysUseHttps as unknown as ReturnType<typeof vi.fn>;
const record = auditService.record as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("createDnsRecordAction", () => {
  it("creates a record (ttl defaulted) and audits it", async () => {
    dnsCreate.mockResolvedValue({ id: "d1" });
    const res = await createDnsRecordAction("z1", {
      type: "A",
      name: "app.example.com",
      content: "1.2.3.4",
    });
    expect(res.ok).toBe(true);
    expect(dnsCreate).toHaveBeenCalledWith(
      "z1",
      expect.objectContaining({ type: "A", name: "app.example.com", ttl: 1 }),
    );
    expect(record.mock.calls[0][0].action).toBe("cloudflare.dns.create");
  });

  it("rejects invalid input without calling the service", async () => {
    const res = await createDnsRecordAction("z1", { type: "ZZ", name: "", content: "" });
    expect(res.ok).toBe(false);
    expect(dnsCreate).not.toHaveBeenCalled();
  });
});

describe("saveTunnelRouteAction", () => {
  it("adds a route while preserving the trailing catch-all", async () => {
    getConfig.mockResolvedValue({
      ingress: [
        { hostname: "old.example.com", service: "http://localhost:1" },
        { service: "http_status:404" },
      ],
    });
    putConfig.mockResolvedValue(undefined);

    const res = await saveTunnelRouteAction("t1", {
      hostname: "new.example.com",
      service: "http://localhost:3000",
    });
    expect(res.ok).toBe(true);
    const ingress = putConfig.mock.calls[0][1];
    expect(ingress).toEqual([
      { hostname: "old.example.com", service: "http://localhost:1" },
      { hostname: "new.example.com", service: "http://localhost:3000" },
      { service: "http_status:404" },
    ]);
    expect(record.mock.calls[0][0].action).toBe("cloudflare.tunnel.route_update");
  });

  it("replaces an existing route for the same hostname", async () => {
    getConfig.mockResolvedValue({
      ingress: [
        { hostname: "app.example.com", service: "http://old:1" },
        { service: "http_status:404" },
      ],
    });
    putConfig.mockResolvedValue(undefined);
    await saveTunnelRouteAction("t1", {
      hostname: "app.example.com",
      service: "http://new:2",
    });
    const ingress = putConfig.mock.calls[0][1];
    expect(ingress).toEqual([
      { hostname: "app.example.com", service: "http://new:2" },
      { service: "http_status:404" },
    ]);
  });
});

describe("deleteTunnelRouteAction", () => {
  it("removes the named route and keeps the catch-all", async () => {
    getConfig.mockResolvedValue({
      ingress: [
        { hostname: "a.example.com", service: "http://x:1" },
        { hostname: "b.example.com", service: "http://x:2" },
        { service: "http_status:404" },
      ],
    });
    putConfig.mockResolvedValue(undefined);
    await deleteTunnelRouteAction("t1", "a.example.com");
    const ingress = putConfig.mock.calls[0][1];
    expect(ingress).toEqual([
      { hostname: "b.example.com", service: "http://x:2" },
      { service: "http_status:404" },
    ]);
  });
});

describe("updateTlsSettingsAction", () => {
  it("sets both the SSL mode and always-use-https, then audits", async () => {
    setSsl.mockResolvedValue(undefined);
    setAhttps.mockResolvedValue(undefined);
    const res = await updateTlsSettingsAction("z1", { ssl: "full", always_use_https: true });
    expect(res.ok).toBe(true);
    expect(setSsl).toHaveBeenCalledWith("z1", "full");
    expect(setAhttps).toHaveBeenCalledWith("z1", true);
    expect(record.mock.calls[0][0].action).toBe("cloudflare.tls.update");
  });

  it("rejects an invalid ssl mode", async () => {
    const res = await updateTlsSettingsAction("z1", { ssl: "nope", always_use_https: false });
    expect(res.ok).toBe(false);
    expect(setSsl).not.toHaveBeenCalled();
  });
});
