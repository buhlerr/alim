import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./provider", () => ({
  platformProvider: {
    listHosts: vi.fn(),
    getHostCapacity: vi.fn(),
    inspectResource: vi.fn(),
    resourceExistsOnHost: vi.fn(),
  },
}));

import { platformProvider } from "./provider";
import { validationService } from "./validation";

const p = platformProvider as unknown as Record<string, ReturnType<typeof vi.fn>>;

const SOURCE = {
  id: "app-n8n",
  name: "n8n",
  environment: "PRODUCTION",
  hostId: "server-2",
  hostName: "Server 2",
  domains: ["app.example.com"],
  type: "compose",
  envVars: [],
  buildConfig: {},
  volumes: [{ name: "n8n_data", estimatedSizeMb: 512 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  p.listHosts.mockResolvedValue([{ id: "server-3", name: "Server 3", ip: "192.168.100.11" }]);
  p.getHostCapacity.mockResolvedValue({
    hostId: "server-3",
    reachable: true,
    freeMemoryMb: 8192,
    freeDiskMb: 102400,
    metricsAvailable: true,
  });
  p.inspectResource.mockResolvedValue(SOURCE);
  p.resourceExistsOnHost.mockResolvedValue(false);
});

describe("validationService.validate", () => {
  it("passes blocking checks for a reachable host with no duplicate (capacity advisory)", async () => {
    const report = await validationService.validate({
      sourceResourceId: "app-n8n",
      destinationHost: "server-3",
      destinationResourceName: "n8n",
    });
    expect(report.ok).toBe(true);
    expect(report.checks.map((c) => c.key)).toEqual([
      "host_exists",
      "host_reachable",
      "disk",
      "memory",
      "duplicate_name",
    ]);
    expect(report.checks.find((c) => c.key === "host_exists")?.advisory).toBeFalsy();
    expect(report.checks.find((c) => c.key === "disk")?.advisory).toBe(true);
  });

  it("classifies a custom-domain resource as public with NPM+CF defaults on", async () => {
    const report = await validationService.validate({
      sourceResourceId: "app-n8n",
      destinationHost: "server-3",
      destinationResourceName: "n8n",
    });
    expect(report.exposure).toBe("public");
    expect(report.defaults).toEqual({ npmEnabled: true, cloudflareEnabled: true });
    expect(report.volumes).toHaveLength(1);
  });

  it("fails when the destination host does not exist", async () => {
    p.listHosts.mockResolvedValue([]);
    const report = await validationService.validate({
      sourceResourceId: "app-n8n",
      destinationHost: "server-9",
      destinationResourceName: "n8n",
    });
    expect(report.ok).toBe(false);
    expect(report.checks.find((c) => c.key === "host_exists")?.pass).toBe(false);
  });

  it("marks disk/memory advisory and does NOT block when metrics are low but present", async () => {
    p.getHostCapacity.mockResolvedValue({
      hostId: "server-3", reachable: true, freeMemoryMb: 1, freeDiskMb: 1, metricsAvailable: true,
    });
    const report = await validationService.validate({
      sourceResourceId: "app-n8n", destinationHost: "server-3", destinationResourceName: "n8n",
    });
    expect(report.checks.find((c) => c.key === "disk")?.advisory).toBe(true);
    expect(report.ok).toBe(true);
  });

  it("shows disk/memory as not-measured when metrics are unavailable (API-only)", async () => {
    p.getHostCapacity.mockResolvedValue({
      hostId: "server-3", reachable: true, freeMemoryMb: 0, freeDiskMb: 0, metricsAvailable: false,
    });
    const report = await validationService.validate({
      sourceResourceId: "app-n8n", destinationHost: "server-3", destinationResourceName: "n8n",
    });
    const disk = report.checks.find((c) => c.key === "disk");
    expect(disk?.advisory).toBe(true);
    expect(disk?.pass).toBe(true);
    expect(disk?.detail).toMatch(/not measured/i);
    expect(report.ok).toBe(true);
  });

  it("fails the duplicate-name check when the name is taken", async () => {
    p.resourceExistsOnHost.mockResolvedValue(true);
    const report = await validationService.validate({
      sourceResourceId: "app-n8n",
      destinationHost: "server-3",
      destinationResourceName: "duplicate-name",
    });
    expect(report.checks.find((c) => c.key === "duplicate_name")?.pass).toBe(false);
    expect(report.ok).toBe(false);
  });
});
