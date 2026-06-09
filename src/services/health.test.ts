import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/coolify-config", () => ({
  isCoolifyConfigured: vi.fn(),
}));
vi.mock("@/lib/npm-config", () => ({
  isNpmConfigured: vi.fn(),
}));
vi.mock("@/lib/cloudflare-config", () => ({
  isCloudflareConfigured: vi.fn(),
}));
vi.mock("@/services/coolify/service", () => ({
  coolifyService: {
    testConnection: vi.fn(),
    listServers: vi.fn(),
    getServer: vi.fn(),
  },
}));
vi.mock("@/services/npm/service", () => ({
  npmService: {
    testConnection: vi.fn(),
  },
}));
vi.mock("@/services/cloudflare/service", () => ({
  cloudflareService: {
    testConnection: vi.fn(),
  },
}));

import { isCoolifyConfigured } from "@/lib/coolify-config";
import { isNpmConfigured } from "@/lib/npm-config";
import { isCloudflareConfigured } from "@/lib/cloudflare-config";
import { coolifyService } from "@/services/coolify/service";
import { npmService } from "@/services/npm/service";
import { cloudflareService } from "@/services/cloudflare/service";
import { getIntegrationsHealth } from "./health";

const mockIsCoolifyConfigured = isCoolifyConfigured as ReturnType<typeof vi.fn>;
const mockIsNpmConfigured = isNpmConfigured as ReturnType<typeof vi.fn>;
const mockIsCloudflareConfigured = isCloudflareConfigured as ReturnType<typeof vi.fn>;
const mockCoolifyTestConnection = coolifyService.testConnection as ReturnType<typeof vi.fn>;
const mockCoolifyListServers = coolifyService.listServers as ReturnType<typeof vi.fn>;
const mockCoolifyGetServer = coolifyService.getServer as ReturnType<typeof vi.fn>;
const mockNpmTestConnection = npmService.testConnection as ReturnType<typeof vi.fn>;
const mockCloudflareTestConnection = cloudflareService.testConnection as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  // Defaults: all configured, all ok
  mockIsCoolifyConfigured.mockResolvedValue(true);
  mockIsNpmConfigured.mockResolvedValue(true);
  mockIsCloudflareConfigured.mockResolvedValue(true);
  mockCoolifyTestConnection.mockResolvedValue({ ok: true, message: "Connection OK.", version: "4.0.0-beta.123" });
  mockNpmTestConnection.mockResolvedValue({ ok: true, message: "Connection OK." });
  mockCloudflareTestConnection.mockResolvedValue({ ok: true, message: "Token valid and active." });
  mockCoolifyListServers.mockResolvedValue([]);
});

describe("getIntegrationsHealth - not configured", () => {
  it("returns ok:false and 'Not configured' detail when coolify is not configured", async () => {
    mockIsCoolifyConfigured.mockResolvedValue(false);
    const result = await getIntegrationsHealth();
    const coolify = result.integrations.find((i) => i.key === "coolify")!;
    expect(coolify.configured).toBe(false);
    expect(coolify.ok).toBe(false);
    expect(coolify.detail).toBe("Not configured");
  });

  it("returns ok:false and 'Not configured' detail when npm is not configured", async () => {
    mockIsNpmConfigured.mockResolvedValue(false);
    const result = await getIntegrationsHealth();
    const npm = result.integrations.find((i) => i.key === "npm")!;
    expect(npm.configured).toBe(false);
    expect(npm.ok).toBe(false);
    expect(npm.detail).toBe("Not configured");
  });

  it("returns ok:false and 'Not configured' detail when cloudflare is not configured", async () => {
    mockIsCloudflareConfigured.mockResolvedValue(false);
    const result = await getIntegrationsHealth();
    const cf = result.integrations.find((i) => i.key === "cloudflare")!;
    expect(cf.configured).toBe(false);
    expect(cf.ok).toBe(false);
    expect(cf.detail).toBe("Not configured");
  });
});

describe("getIntegrationsHealth - configured and ok", () => {
  it("returns ok:true with version in detail when coolify reports a version", async () => {
    const result = await getIntegrationsHealth();
    const coolify = result.integrations.find((i) => i.key === "coolify")!;
    expect(coolify.configured).toBe(true);
    expect(coolify.ok).toBe(true);
    expect(coolify.detail).toBe("Connected (4.0.0-beta.123)");
  });

  it("returns ok:true with 'Connected' when coolify has no version", async () => {
    mockCoolifyTestConnection.mockResolvedValue({ ok: true, message: "Connection OK." });
    const result = await getIntegrationsHealth();
    const coolify = result.integrations.find((i) => i.key === "coolify")!;
    expect(coolify.ok).toBe(true);
    expect(coolify.detail).toBe("Connected");
  });

  it("returns ok:true for npm when configured and connection succeeds", async () => {
    const result = await getIntegrationsHealth();
    const npm = result.integrations.find((i) => i.key === "npm")!;
    expect(npm.configured).toBe(true);
    expect(npm.ok).toBe(true);
  });

  it("returns ok:true for cloudflare when configured and connection succeeds", async () => {
    const result = await getIntegrationsHealth();
    const cf = result.integrations.find((i) => i.key === "cloudflare")!;
    expect(cf.configured).toBe(true);
    expect(cf.ok).toBe(true);
  });
});

describe("getIntegrationsHealth - testConnection failure", () => {
  it("maps coolify testConnection failure to ok:false with the error message", async () => {
    mockCoolifyTestConnection.mockResolvedValue({ ok: false, message: "Could not reach Coolify." });
    const result = await getIntegrationsHealth();
    const coolify = result.integrations.find((i) => i.key === "coolify")!;
    expect(coolify.ok).toBe(false);
    expect(coolify.detail).toBe("Could not reach Coolify.");
  });

  it("maps npm testConnection failure to ok:false with the error message", async () => {
    mockNpmTestConnection.mockResolvedValue({ ok: false, message: "Could not reach Nginx Proxy Manager." });
    const result = await getIntegrationsHealth();
    const npm = result.integrations.find((i) => i.key === "npm")!;
    expect(npm.ok).toBe(false);
    expect(npm.detail).toBe("Could not reach Nginx Proxy Manager.");
  });

  it("maps cloudflare testConnection failure to ok:false with the error message", async () => {
    mockCloudflareTestConnection.mockResolvedValue({ ok: false, message: "Token rejected (401)." });
    const result = await getIntegrationsHealth();
    const cf = result.integrations.find((i) => i.key === "cloudflare")!;
    expect(cf.ok).toBe(false);
    expect(cf.detail).toBe("Token rejected (401).");
  });

  it("handles thrown errors from testConnection without throwing the whole result", async () => {
    mockCoolifyTestConnection.mockRejectedValue(new Error("network error"));
    const result = await getIntegrationsHealth();
    const coolify = result.integrations.find((i) => i.key === "coolify")!;
    expect(coolify.ok).toBe(false);
    expect(typeof coolify.detail).toBe("string");
  });
});

describe("getIntegrationsHealth - hosts", () => {
  it("returns host reachability from listServers/getServer when coolify is ok", async () => {
    mockCoolifyListServers.mockResolvedValue([{ uuid: "uuid-1", name: "prod" }]);
    mockCoolifyGetServer.mockResolvedValue({ uuid: "uuid-1", name: "prod", settings: { is_reachable: true } });
    const result = await getIntegrationsHealth();
    expect(result.hosts).toEqual([{ name: "prod", reachable: true }]);
  });

  it("defaults reachable to false when settings.is_reachable is absent", async () => {
    mockCoolifyListServers.mockResolvedValue([{ uuid: "uuid-2", name: "staging" }]);
    mockCoolifyGetServer.mockResolvedValue({ uuid: "uuid-2", name: "staging" });
    const result = await getIntegrationsHealth();
    expect(result.hosts).toEqual([{ name: "staging", reachable: false }]);
  });

  it("returns empty hosts when coolify is not configured", async () => {
    mockIsCoolifyConfigured.mockResolvedValue(false);
    const result = await getIntegrationsHealth();
    expect(result.hosts).toEqual([]);
  });

  it("returns empty hosts when coolify testConnection fails", async () => {
    mockCoolifyTestConnection.mockResolvedValue({ ok: false, message: "Could not reach Coolify." });
    const result = await getIntegrationsHealth();
    expect(result.hosts).toEqual([]);
  });

  it("returns empty hosts when listServers throws", async () => {
    mockCoolifyListServers.mockRejectedValue(new Error("failed"));
    const result = await getIntegrationsHealth();
    expect(result.hosts).toEqual([]);
  });

  it("skips a host that throws but still returns the others", async () => {
    mockCoolifyListServers.mockResolvedValue([
      { uuid: "uuid-good", name: "good" },
      { uuid: "uuid-bad", name: "bad" },
    ]);
    mockCoolifyGetServer
      .mockResolvedValueOnce({ uuid: "uuid-good", name: "good", settings: { is_reachable: true } })
      .mockRejectedValueOnce(new Error("bad host failed"));
    const result = await getIntegrationsHealth();
    expect(result.hosts).toEqual([{ name: "good", reachable: true }]);
  });
});
