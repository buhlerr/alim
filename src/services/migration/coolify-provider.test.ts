import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/coolify/service", () => ({
  coolifyService: {
    listServers: vi.fn(),
    getServer: vi.fn(),
    listApplications: vi.fn(),
    getApplication: vi.fn(),
    listEnvVars: vi.fn(),
    listStorages: vi.fn(),
    listServerResources: vi.fn(),
    listProjects: vi.fn(),
    getProject: vi.fn(),
    createApplication: vi.fn(),
    setEnvVar: vi.fn(),
    deploy: vi.fn(),
    getDeployment: vi.fn(),
    updateApplication: vi.fn(),
    startApplication: vi.fn(),
    stopApplication: vi.fn(),
    deleteApplication: vi.fn(),
  },
}));

import { coolifyService } from "@/services/coolify/service";
import { coolifyPlatformProvider } from "./coolify-provider";

const cs = coolifyService as unknown as Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("coolifyPlatformProvider read methods", () => {
  it("listHosts maps servers to {id,name,ip}", async () => {
    cs.listServers.mockResolvedValue([{ uuid: "s1", name: "Server 1", ip: "10.0.0.1" }]);
    expect(await coolifyPlatformProvider.listHosts()).toEqual([
      { id: "s1", name: "Server 1", ip: "10.0.0.1" },
    ]);
  });

  it("getHostCapacity reads reachability from the server settings, metrics unavailable", async () => {
    cs.getServer.mockResolvedValue({ uuid: "s1", name: "Server 1", ip: "10.0.0.1", settings: { is_reachable: true } });
    const cap = await coolifyPlatformProvider.getHostCapacity("s1");
    expect(cap).toEqual({
      hostId: "s1", reachable: true, freeMemoryMb: 0, freeDiskMb: 0, metricsAvailable: false,
    });
  });

  it("getHostCapacity reports unreachable when getServer throws", async () => {
    cs.getServer.mockRejectedValue(new Error("nope"));
    const cap = await coolifyPlatformProvider.getHostCapacity("s1");
    expect(cap.reachable).toBe(false);
    expect(cap.metricsAvailable).toBe(false);
  });

  it("listResources maps apps with server from destination.server", async () => {
    cs.listApplications.mockResolvedValue([
      { uuid: "a1", name: "web", fqdn: "web.example.com",
        destination: { server: { uuid: "s1", name: "Server 1", ip: "10.0.0.1" } } },
    ]);
    const res = await coolifyPlatformProvider.listResources();
    expect(res[0]).toMatchObject({
      id: "a1", name: "web", hostId: "s1", hostName: "Server 1", domains: ["web.example.com"],
    });
  });

  it("inspectResource composes app + envs + persistent storages + resolved project/env", async () => {
    cs.getApplication.mockResolvedValue({
      uuid: "a1", name: "web", fqdn: "web.example.com,web.10.0.0.1.sslip.io",
      git_repository: "https://github.com/x/y", git_branch: "main",
      build_pack: "nixpacks", ports_exposes: "3000",
      environment_id: 5,
      destination: { server: { uuid: "s1", name: "Server 1", ip: "10.0.0.1" } },
    });
    cs.listEnvVars.mockResolvedValue([{ key: "NODE_ENV", value: "production" }]);
    cs.listStorages.mockResolvedValue({ persistent_storages: [{ name: "web_data", mount_path: "/data" }], file_storages: [] });
    cs.listProjects.mockResolvedValue([{ uuid: "p1", name: "Proj" }]);
    cs.getProject.mockResolvedValue({ uuid: "p1", name: "Proj", environments: [{ id: 5, uuid: "e1", name: "production" }] });

    const info = await coolifyPlatformProvider.inspectResource("a1");
    expect(info.id).toBe("a1");
    expect(info.type).toBe("application");
    expect(info.hostId).toBe("s1");
    expect(info.hostName).toBe("Server 1");
    expect(info.environment).toBe("production");
    expect(info.domains).toEqual(["web.example.com", "web.10.0.0.1.sslip.io"]);
    expect(info.envVars).toEqual([{ key: "NODE_ENV", value: "production" }]);
    expect(info.volumes).toEqual([{ name: "web_data", estimatedSizeMb: 0 }]);
    expect(info.buildConfig).toMatchObject({
      git_repository: "https://github.com/x/y", git_branch: "main",
      build_pack: "nixpacks", ports_exposes: "3000",
      project_uuid: "p1", environment_name: "production",
    });
  });

  it("resourceExistsOnHost matches by name among server resources", async () => {
    cs.listServerResources.mockResolvedValue([{ uuid: "a1", name: "web" }]);
    expect(await coolifyPlatformProvider.resourceExistsOnHost("s1", "web")).toBe(true);
    expect(await coolifyPlatformProvider.resourceExistsOnHost("s1", "other")).toBe(false);
  });
});
