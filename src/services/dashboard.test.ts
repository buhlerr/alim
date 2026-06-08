import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/coolify-config", () => ({ isCoolifyConfigured: vi.fn() }));
vi.mock("@/lib/npm-config", () => ({ isNpmConfigured: vi.fn() }));
vi.mock("@/lib/cloudflare-config", () => ({ isCloudflareConfigured: vi.fn() }));
vi.mock("@/services/coolify/service", () => ({
  coolifyService: { listApplications: vi.fn() },
}));
vi.mock("@/services/npm/service", () => ({
  npmService: { proxyHosts: { list: vi.fn() } },
}));
vi.mock("@/services/cloudflare/service", () => ({
  cloudflareService: { zones: { list: vi.fn() } },
}));

import { isCoolifyConfigured } from "@/lib/coolify-config";
import { isNpmConfigured } from "@/lib/npm-config";
import { isCloudflareConfigured } from "@/lib/cloudflare-config";
import { coolifyService } from "@/services/coolify/service";
import { npmService } from "@/services/npm/service";
import { cloudflareService } from "@/services/cloudflare/service";
import { getIntegrationOverview } from "./dashboard";

const cfg = {
  coolify: isCoolifyConfigured as unknown as ReturnType<typeof vi.fn>,
  npm: isNpmConfigured as unknown as ReturnType<typeof vi.fn>,
  cf: isCloudflareConfigured as unknown as ReturnType<typeof vi.fn>,
};
const apps = coolifyService.listApplications as unknown as ReturnType<typeof vi.fn>;
const hosts = npmService.proxyHosts.list as unknown as ReturnType<typeof vi.fn>;
const zones = cloudflareService.zones.list as unknown as ReturnType<typeof vi.fn>;

function find(list: Awaited<ReturnType<typeof getIntegrationOverview>>, id: string) {
  return list.find((s) => s.id === id)!;
}

beforeEach(() => {
  vi.clearAllMocks();
  cfg.coolify.mockResolvedValue(false);
  cfg.npm.mockResolvedValue(false);
  cfg.cf.mockResolvedValue(false);
});

describe("getIntegrationOverview", () => {
  it("reports not-configured integrations without calling their APIs", async () => {
    const list = await getIntegrationOverview();
    const c = find(list, "coolify");
    expect(c.configured).toBe(false);
    expect(c.reachable).toBe(false);
    expect(c.count).toBeNull();
    expect(apps).not.toHaveBeenCalled();
    expect(hosts).not.toHaveBeenCalled();
    expect(zones).not.toHaveBeenCalled();
  });

  it("returns counts for reachable, configured integrations", async () => {
    cfg.coolify.mockResolvedValue(true);
    cfg.npm.mockResolvedValue(true);
    cfg.cf.mockResolvedValue(true);
    apps.mockResolvedValue([{}, {}, {}]);
    hosts.mockResolvedValue([{}]);
    zones.mockResolvedValue([{}, {}]);

    const list = await getIntegrationOverview();
    expect(find(list, "coolify")).toMatchObject({ configured: true, reachable: true, count: 3 });
    expect(find(list, "npm")).toMatchObject({ reachable: true, count: 1 });
    expect(find(list, "cloudflare")).toMatchObject({ reachable: true, count: 2 });
  });

  it("marks a configured-but-failing integration unreachable without throwing", async () => {
    cfg.coolify.mockResolvedValue(true);
    apps.mockRejectedValue(new Error("connection refused"));
    const list = await getIntegrationOverview();
    const c = find(list, "coolify");
    expect(c.configured).toBe(true);
    expect(c.reachable).toBe(false);
    expect(c.count).toBeNull();
    expect(c.error).toBeTruthy();
  });

  it("always returns the three infrastructure integrations", async () => {
    const list = await getIntegrationOverview();
    expect(list.map((s) => s.id).sort()).toEqual(["cloudflare", "coolify", "npm"]);
  });
});
