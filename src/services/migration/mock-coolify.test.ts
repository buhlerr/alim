import { describe, it, expect } from "vitest";
import { mockCoolifyProvider } from "./mock-coolify";

describe("mockCoolifyProvider", () => {
  it("lists hosts with ip addresses", async () => {
    const hosts = await mockCoolifyProvider.listHosts();
    expect(hosts.length).toBeGreaterThanOrEqual(2);
    expect(hosts[0]).toHaveProperty("ip");
  });

  it("inspects a known resource including domains and volumes", async () => {
    const resources = await mockCoolifyProvider.listResources();
    const info = await mockCoolifyProvider.inspectResource(resources[0].id);
    expect(info.id).toBe(resources[0].id);
    expect(Array.isArray(info.domains)).toBe(true);
    expect(Array.isArray(info.volumes)).toBe(true);
  });

  it("exposes a volumeless resource and a volume-bearing resource", async () => {
    const resources = await mockCoolifyProvider.listResources();
    const infos = await Promise.all(
      resources.map((r) => mockCoolifyProvider.inspectResource(r.id)),
    );
    expect(infos.some((i) => i.volumes.length === 0)).toBe(true);
    expect(infos.some((i) => i.volumes.length > 0)).toBe(true);
  });

  it("reports reachable hosts with capacity", async () => {
    const hosts = await mockCoolifyProvider.listHosts();
    const cap = await mockCoolifyProvider.getHostCapacity(hosts[0].id);
    expect(cap.reachable).toBe(true);
    expect(cap.freeMemoryMb).toBeGreaterThan(0);
    expect(cap.freeDiskMb).toBeGreaterThan(0);
  });

  it("generates an sslip.io validation url", async () => {
    const url = await mockCoolifyProvider.generateValidationUrl("res-1", "192.168.100.11");
    expect(url).toMatch(/^https:\/\/[a-z0-9]+\.192\.168\.100\.11\.sslip\.io$/);
  });

  it("detects no duplicate for an unused name", async () => {
    const hosts = await mockCoolifyProvider.listHosts();
    expect(await mockCoolifyProvider.resourceExistsOnHost(hosts[0].id, "totally-unused-xyz")).toBe(false);
  });
});
