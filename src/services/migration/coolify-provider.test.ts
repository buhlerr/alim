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
    createApplicationPrivateGithubApp: vi.fn(),
    listGithubApps: vi.fn(),
    setEnvVar: vi.fn(),
    setEnvVarsBulk: vi.fn(),
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

  it("createResource builds from the snapshot and bulk-replicates env vars", async () => {
    cs.createApplication.mockResolvedValue({ uuid: "dest1" });
    cs.setEnvVarsBulk.mockResolvedValue(undefined);
    const res = await coolifyPlatformProvider.createResource({
      name: "web-copy", destinationHostId: "s2", snapshot,
    } as any);
    expect(res).toEqual({ resourceId: "dest1" });
    expect(cs.createApplication).toHaveBeenCalledWith(expect.objectContaining({
      project_uuid: "p1", server_uuid: "s2", environment_name: "production",
      git_repository: "https://github.com/x/y", git_branch: "main",
      build_pack: "nixpacks", ports_exposes: "3000", name: "web-copy",
    }));
    expect(cs.setEnvVarsBulk).toHaveBeenCalledWith("dest1", [{ key: "NODE_ENV", value: "production" }]);
  });

  it("createResource replicates set build commands/directories via PATCH, skipping empty ones", async () => {
    cs.createApplication.mockResolvedValue({ uuid: "dest1" });
    cs.updateApplication.mockResolvedValue(undefined);
    cs.setEnvVarsBulk.mockResolvedValue(undefined);
    await coolifyPlatformProvider.createResource({
      name: "web-copy", destinationHostId: "s2",
      snapshot: {
        ...snapshot,
        buildConfig: {
          ...snapshot.buildConfig,
          install_command: "",
          build_command: "npm install && npm run build",
          start_command: "npm start",
          base_directory: "/",
          publish_directory: "/",
        },
      },
    } as any);
    expect(cs.updateApplication).toHaveBeenCalledWith("dest1", {
      build_command: "npm install && npm run build",
      start_command: "npm start",
      base_directory: "/",
      publish_directory: "/",
    });
  });

  it("createResource uses the private GitHub App path for a private-repo source", async () => {
    cs.listGithubApps.mockResolvedValue([
      { id: 0, uuid: "public-gh", name: "Public GitHub", is_public: true },
      { id: 1, uuid: "gh-private", name: "my-app", is_public: false },
    ]);
    cs.createApplicationPrivateGithubApp.mockResolvedValue({ uuid: "dest1" });
    cs.setEnvVarsBulk.mockResolvedValue(undefined);
    await coolifyPlatformProvider.createResource({
      name: "web-copy", destinationHostId: "s2",
      snapshot: {
        ...snapshot,
        buildConfig: {
          ...snapshot.buildConfig,
          git_repository: "owner/repo",
          source_id: 1,
          source_type: "App\\Models\\GithubApp",
        },
      },
    } as any);
    expect(cs.createApplicationPrivateGithubApp).toHaveBeenCalledWith(expect.objectContaining({
      github_app_uuid: "gh-private",
      git_repository: "owner/repo", // raw owner/repo, not a URL
      server_uuid: "s2",
      project_uuid: "p1",
    }));
    expect(cs.createApplication).not.toHaveBeenCalled();
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

  it("deployResource tolerates a transient poll error and keeps polling", async () => {
    cs.deploy.mockResolvedValue({ deployments: [{ deployment_uuid: "d1" }] });
    cs.getDeployment
      .mockRejectedValueOnce(new Error("Timed out reaching the Coolify server."))
      .mockResolvedValueOnce({ status: "finished" });
    await coolifyPlatformProvider.deployResource("dest1");
    expect(cs.getDeployment).toHaveBeenCalledTimes(2);
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

  it("switchEndpoints clears source domains, sets destination domains, and redeploys", async () => {
    cs.updateApplication.mockResolvedValue(undefined);
    cs.deploy.mockResolvedValue({ deployments: [{ deployment_uuid: "d1" }] });
    cs.getDeployment.mockResolvedValue({ status: "finished" });

    await coolifyPlatformProvider.switchEndpoints({
      sourceResourceId: "src-1",
      destinationResourceId: "dest-1",
      domains: ["app.example.com"],
    });

    expect(cs.updateApplication).toHaveBeenNthCalledWith(1, "src-1", { domains: "" });
    expect(cs.updateApplication).toHaveBeenNthCalledWith(2, "dest-1", { domains: "app.example.com" });
    expect(cs.deploy).toHaveBeenCalledWith("dest-1");
  });

  it("switchEndpoints is a no-op when domains array is empty", async () => {
    await coolifyPlatformProvider.switchEndpoints({
      sourceResourceId: "src-1",
      destinationResourceId: "dest-1",
      domains: [],
    });
    expect(cs.updateApplication).not.toHaveBeenCalled();
    expect(cs.deploy).not.toHaveBeenCalled();
  });
});
