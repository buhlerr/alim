import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./client", () => ({ cfFetch: vi.fn() }));
vi.mock("@/lib/cloudflare-config", () => ({ getCloudflareConfig: vi.fn() }));

import { cfFetch } from "./client";
import { getCloudflareConfig } from "@/lib/cloudflare-config";
import { cloudflareService } from "./service";
import { CloudflareError } from "./types";

const f = cfFetch as unknown as ReturnType<typeof vi.fn>;
const getConfig = getCloudflareConfig as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  getConfig.mockResolvedValue({ apiToken: "tok", accountId: "acct" });
});

describe("zones", () => {
  it("list GETs /zones", async () => {
    f.mockResolvedValue([]);
    await cloudflareService.zones.list();
    expect(f).toHaveBeenCalledWith({ path: "/zones", query: { per_page: 50 } });
  });
});

describe("tunnels", () => {
  it("list GETs the account cfd_tunnel endpoint", async () => {
    f.mockResolvedValue([]);
    await cloudflareService.tunnels.list();
    expect(f).toHaveBeenCalledWith({
      path: "/accounts/acct/cfd_tunnel",
      query: { is_deleted: false },
    });
  });

  it("create POSTs name + cloudflare-managed config", async () => {
    f.mockResolvedValue({ id: "t1", name: "web" });
    await cloudflareService.tunnels.create("web");
    expect(f).toHaveBeenCalledWith({
      path: "/accounts/acct/cfd_tunnel",
      method: "POST",
      body: { name: "web", config_src: "cloudflare" },
    });
  });

  it("remove DELETEs the tunnel", async () => {
    f.mockResolvedValue({});
    await cloudflareService.tunnels.remove("t1");
    expect(f).toHaveBeenCalledWith({
      path: "/accounts/acct/cfd_tunnel/t1",
      method: "DELETE",
    });
  });

  it("getConfig returns the ingress list", async () => {
    f.mockResolvedValue({ config: { ingress: [{ service: "http_status:404" }] } });
    const cfg = await cloudflareService.tunnels.getConfig("t1");
    expect(f).toHaveBeenCalledWith({ path: "/accounts/acct/cfd_tunnel/t1/configurations" });
    expect(cfg.ingress).toEqual([{ service: "http_status:404" }]);
  });

  it("putConfig PUTs the wrapped config", async () => {
    f.mockResolvedValue({});
    const ingress = [{ hostname: "a.com", service: "http://localhost:3000" }];
    await cloudflareService.tunnels.putConfig("t1", ingress);
    expect(f).toHaveBeenCalledWith({
      path: "/accounts/acct/cfd_tunnel/t1/configurations",
      method: "PUT",
      body: { config: { ingress } },
    });
  });

  it("throws NO_ACCOUNT when the account id is missing", async () => {
    getConfig.mockResolvedValue({ apiToken: "tok", accountId: "" });
    await expect(cloudflareService.tunnels.list()).rejects.toMatchObject({
      code: "NO_ACCOUNT",
    });
  });
});

describe("dns", () => {
  it("list GETs zone dns_records", async () => {
    f.mockResolvedValue([]);
    await cloudflareService.dns.list("z1");
    expect(f).toHaveBeenCalledWith({ path: "/zones/z1/dns_records", query: { per_page: 100 } });
  });

  it("create POSTs the record", async () => {
    f.mockResolvedValue({ id: "d1" });
    const req = { type: "A", name: "a.com", content: "1.2.3.4", proxied: true, ttl: 1 };
    await cloudflareService.dns.create("z1", req);
    expect(f).toHaveBeenCalledWith({ path: "/zones/z1/dns_records", method: "POST", body: req });
  });

  it("update PUTs the record", async () => {
    f.mockResolvedValue({ id: "d1" });
    const req = { type: "A", name: "a.com", content: "5.6.7.8", proxied: false, ttl: 1 };
    await cloudflareService.dns.update("z1", "d1", req);
    expect(f).toHaveBeenCalledWith({ path: "/zones/z1/dns_records/d1", method: "PUT", body: req });
  });

  it("remove DELETEs the record", async () => {
    f.mockResolvedValue({});
    await cloudflareService.dns.remove("z1", "d1");
    expect(f).toHaveBeenCalledWith({ path: "/zones/z1/dns_records/d1", method: "DELETE" });
  });
});

describe("tls", () => {
  it("getSettings reads ssl mode and always_use_https", async () => {
    f.mockImplementation(async ({ path }: { path: string }) =>
      path.endsWith("/ssl") ? { value: "full" } : { value: "on" },
    );
    const out = await cloudflareService.tls.getSettings("z1");
    expect(out).toEqual({ ssl: "full", always_use_https: true });
  });

  it("setSslMode PATCHes the value", async () => {
    f.mockResolvedValue({ value: "strict" });
    await cloudflareService.tls.setSslMode("z1", "strict");
    expect(f).toHaveBeenCalledWith({
      path: "/zones/z1/settings/ssl",
      method: "PATCH",
      body: { value: "strict" },
    });
  });

  it("setAlwaysUseHttps maps boolean to on/off", async () => {
    f.mockResolvedValue({ value: "off" });
    await cloudflareService.tls.setAlwaysUseHttps("z1", false);
    expect(f).toHaveBeenCalledWith({
      path: "/zones/z1/settings/always_use_https",
      method: "PATCH",
      body: { value: "off" },
    });
  });
});

describe("testConnection", () => {
  it("returns ok when token verify succeeds", async () => {
    f.mockResolvedValue({ status: "active" });
    const res = await cloudflareService.testConnection();
    expect(f).toHaveBeenCalledWith({ path: "/user/tokens/verify" });
    expect(res.ok).toBe(true);
  });

  it("returns a friendly failure on CloudflareError", async () => {
    f.mockRejectedValue(new CloudflareError("The Cloudflare API token was rejected.", "INVALID_TOKEN"));
    const res = await cloudflareService.testConnection();
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/rejected/);
  });

  it("verifies an explicitly provided token without using saved config", async () => {
    f.mockResolvedValue({ status: "active" });
    await cloudflareService.testConnection("explicit-token");
    expect(f).toHaveBeenCalledWith({
      path: "/user/tokens/verify",
      tokenOverride: "explicit-token",
    });
  });

  it("guides toward API Token vs Global API Key on a 401", async () => {
    f.mockRejectedValue(new CloudflareError("rejected", "INVALID_TOKEN"));
    const res = await cloudflareService.testConnection();
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/API Token/i);
    expect(res.message).toMatch(/Global API Key/i);
  });

  it("treats a malformed-token 400 like an invalid token", async () => {
    f.mockRejectedValue(new CloudflareError("Cloudflare returned an unexpected error (HTTP 400).", "HTTP_400"));
    const res = await cloudflareService.testConnection();
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/API Token/i);
    expect(res.message).toMatch(/Global API Key/i);
  });

  it("explains a permission failure on a 403", async () => {
    f.mockRejectedValue(new CloudflareError("forbidden", "FORBIDDEN"));
    const res = await cloudflareService.testConnection();
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/permission/i);
  });

  it("flags a valid-but-inactive token", async () => {
    f.mockResolvedValue({ status: "disabled" });
    const res = await cloudflareService.testConnection();
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/disabled/i);
  });
});
