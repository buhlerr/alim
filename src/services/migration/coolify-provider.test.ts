import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

describe("coolifyPlatformProvider action methods", () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });
  afterEach(() => { vi.useRealTimers(); });

  const snapshot = {
    id: "src", name: "web", environment: "production",
    hostId: "s1", hostName: "Server 1", domains: ["web.example.com"],
    type: "application",
    envVars: [{ key: "NODE_ENV", value: "production" }],
    buildConfig: {
      git_repository: "https://github.com/x/y", git_branch: "main",
      build_pack: "nixpacks", ports_exposes: "3000",
      project_uuid: "p1", environment_name: "production",
    },
    volumes: [],
  };

  it("createResource builds from the snapshot and replicates env vars", async () => {
    cs.createApplication.mockResolvedValue({ uuid: "dest1" });
    cs.setEnvVar.mockResolvedValue(undefined);
    const res = await coolifyPlatformProvider.createResource({
      name: "web-copy", destinationHostId: "s2", snapshot,
    } as any);
    expect(res).toEqual({ resourceId: "dest1" });
    expect(cs.createApplication).toHaveBeenCalledWith(expect.objectContaining({
      project_uuid: "p1", server_uuid: "s2", environment_name: "production",
      git_repository: "https://github.com/x/y", git_branch: "main",
      build_pack: "nixpacks", ports_exposes: "3000", name: "web-copy",
    }));
    expect(cs.setEnvVar).toHaveBeenCalledWith("dest1", "NODE_ENV", "production");
  });

  it("createResource normalizes an owner/repo git value to a full GitHub URL", async () => {
    cs.createApplication.mockResolvedValue({ uuid: "dest1" });
    cs.setEnvVar.mockResolvedValue(undefined);
    await coolifyPlatformProvider.createResource({
      name: "web-copy", destinationHostId: "s2",
      snapshot: { ...snapshot, buildConfig: { ...snapshot.buildConfig, git_repository: "aasimenator/aspyrelabs-web" } },
    } as any);
    expect(cs.createApplication).toHaveBeenCalledWith(expect.objectContaining({
      git_repository: "https://github.com/aasimenator/aspyrelabs-web",
    }));
  });

  it("createResource throws when project cannot be inferred", async () => {
    await expect(coolifyPlatformProvider.createResource({
      name: "web-copy", destinationHostId: "s2",
      snapshot: { ...snapshot, buildConfig: { ...snapshot.buildConfig, project_uuid: "" } },
    } as any)).rejects.toThrow(/project/i);
  });

  it("deployResource polls until the deployment finishes", async () => {
    cs.deploy.mockResolvedValue({ deployments: [{ deployment_uuid: "d1" }] });
    cs.getDeployment
      .mockResolvedValueOnce({ status: "in_progress" })
      .mockResolvedValueOnce({ status: "finished" });
    await coolifyPlatformProvider.deployResource("dest1");
    expect(cs.deploy).toHaveBeenCalledWith("dest1");
    expect(cs.getDeployment).toHaveBeenCalledTimes(2);
  });

  it("deployResource throws when the deployment fails", async () => {
    cs.deploy.mockResolvedValue({ deployments: [{ deployment_uuid: "d1" }] });
    cs.getDeployment.mockResolvedValue({ status: "failed" });
    await expect(coolifyPlatformProvider.deployResource("dest1")).rejects.toThrow(/deploy/i);
  });

  it("generateValidationUrl returns the Coolify-assigned fqdn when present", async () => {
    cs.getApplication.mockResolvedValue({ uuid: "dest1", name: "web", fqdn: "https://abc.10.0.0.2.sslip.io" });
    const url = await coolifyPlatformProvider.generateValidationUrl("dest1", "10.0.0.2");
    expect(url).toBe("https://abc.10.0.0.2.sslip.io");
  });

  it("stop/start/delete delegate to the service", async () => {
    cs.stopApplication.mockResolvedValue(undefined);
    cs.startApplication.mockResolvedValue(undefined);
    cs.deleteApplication.mockResolvedValue(undefined);
    await coolifyPlatformProvider.stopResource("a1");
    await coolifyPlatformProvider.startResource("a1");
    await coolifyPlatformProvider.deleteResource("a1");
    expect(cs.stopApplication).toHaveBeenCalledWith("a1");
    expect(cs.startApplication).toHaveBeenCalledWith("a1");
    expect(cs.deleteApplication).toHaveBeenCalledWith("a1");
  });
});
