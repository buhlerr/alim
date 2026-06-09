import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./host-credentials", () => ({
  hostCredentialsService: {
    getByServerUuid: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("./ssh", () => ({
  readCapacity: vi.fn(),
}));

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
    // Service methods
    listServices: vi.fn(),
    getService: vi.fn(),
    listServiceEnvs: vi.fn(),
    listServiceStorages: vi.fn(),
    createService: vi.fn(),
    startService: vi.fn(),
    stopService: vi.fn(),
    deleteService: vi.fn(),
    // Database methods
    listDatabases: vi.fn(),
    getDatabase: vi.fn(),
    startDatabase: vi.fn(),
    stopDatabase: vi.fn(),
    deleteDatabase: vi.fn(),
  },
}));

import { coolifyService } from "@/services/coolify/service";
import { hostCredentialsService } from "./host-credentials";
import * as sshMod from "./ssh";
import { coolifyPlatformProvider } from "./coolify-provider";

const cs = coolifyService as unknown as Record<string, ReturnType<typeof vi.fn>>;
const hcs = hostCredentialsService as unknown as Record<string, ReturnType<typeof vi.fn>>;
const sshFns = sshMod as unknown as Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no credential stored -- keeps existing capacity tests green.
  hcs.getByServerUuid.mockResolvedValue(null);
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

  it("getHostCapacity returns SSH-measured values when a credential exists", async () => {
    cs.getServer.mockResolvedValue({ uuid: "s1", settings: { is_reachable: true } });
    hcs.getByServerUuid.mockResolvedValue({
      ipAddress: "10.0.0.5",
      sshPort: 22,
      sshUsername: "root",
      privateKey: () => "FAKE_KEY",
    });
    sshFns.readCapacity.mockResolvedValue({ freeMemoryMb: 2048, freeDiskMb: 10240 });

    const cap = await coolifyPlatformProvider.getHostCapacity("s1");

    expect(sshFns.readCapacity).toHaveBeenCalledWith({
      host: "10.0.0.5",
      port: 22,
      username: "root",
      privateKey: "FAKE_KEY",
    });
    expect(cap).toEqual({
      hostId: "s1",
      reachable: true,
      freeMemoryMb: 2048,
      freeDiskMb: 10240,
      metricsAvailable: true,
    });
  });

  it("getHostCapacity falls back to zero metrics when ssh.readCapacity throws", async () => {
    cs.getServer.mockResolvedValue({ uuid: "s1", settings: { is_reachable: true } });
    hcs.getByServerUuid.mockResolvedValue({
      ipAddress: "10.0.0.5",
      sshPort: 22,
      sshUsername: "root",
      privateKey: () => "FAKE_KEY",
    });
    sshFns.readCapacity.mockRejectedValue(new Error("SSH connection refused"));

    const cap = await coolifyPlatformProvider.getHostCapacity("s1");

    expect(cap).toEqual({
      hostId: "s1",
      reachable: true,
      freeMemoryMb: 0,
      freeDiskMb: 0,
      metricsAvailable: false,
    });
  });

  it("listResources returns apps, services, and databases tagged with the correct type", async () => {
    cs.listApplications.mockResolvedValue([
      { uuid: "a1", name: "web", fqdn: "web.example.com",
        destination: { server: { uuid: "s1", name: "Server 1", ip: "10.0.0.1" } } },
    ]);
    cs.listServices.mockResolvedValue([
      { uuid: "svc1", name: "my-stack", server: { uuid: "s1", name: "Server 1" }, environment_id: 5 },
    ]);
    cs.listDatabases.mockResolvedValue([
      { uuid: "db1", name: "postgres", database_type: "standalone-postgresql",
        destination: { server: { uuid: "s1", name: "Server 1" } } },
    ]);
    const res = await coolifyPlatformProvider.listResources();
    expect(res).toHaveLength(3);
    expect(res[0]).toMatchObject({ id: "a1", name: "web", type: "application", hostId: "s1", hostName: "Server 1", domains: ["web.example.com"] });
    expect(res[1]).toMatchObject({ id: "svc1", name: "my-stack", type: "service", hostId: "s1", hostName: "Server 1", domains: [] });
    expect(res[2]).toMatchObject({ id: "db1", name: "postgres", type: "database", hostId: "s1", hostName: "Server 1", domains: [] });
  });

  it("inspectResource composes app + envs + persistent storages + resolved project/env", async () => {
    cs.getApplication.mockResolvedValue({
      uuid: "a1", name: "web", fqdn: "web.example.com,web.10.0.0.1.sslip.io",
      git_repository: "https://github.com/x/y", git_branch: "main",
      build_pack: "nixpacks", ports_exposes: "3000",
      environment_id: 5,
      destination: { server: { uuid: "s1", name: "Server 1", ip: "10.0.0.1" } },
      health_check_enabled: true, health_check_path: "/health",
      ports_mappings: "9000:9000", limits_memory: "512m", limits_cpus: "1.0",
      pre_deployment_command: "echo pre", post_deployment_command: "echo post",
      custom_docker_run_options: "--cap-add=NET_ADMIN", static_image: null,
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
      health_check_enabled: true, health_check_path: "/health",
      ports_mappings: "9000:9000", limits_memory: "512m", limits_cpus: "1.0",
      pre_deployment_command: "echo pre", post_deployment_command: "echo post",
      custom_docker_run_options: "--cap-add=NET_ADMIN", static_image: null,
    });
  });

  it("resourceExistsOnHost matches by name among server resources", async () => {
    cs.listServerResources.mockResolvedValue([{ uuid: "a1", name: "web" }]);
    expect(await coolifyPlatformProvider.resourceExistsOnHost("s1", "web")).toBe(true);
    expect(await coolifyPlatformProvider.resourceExistsOnHost("s1", "other")).toBe(false);
  });

  it("inspectResource returns service info when id belongs to a service", async () => {
    const { CoolifyError } = await import("@/services/coolify/types");
    cs.getApplication.mockRejectedValue(new CoolifyError("not found", "HTTP_404"));
    cs.getService.mockResolvedValue({
      uuid: "svc1", name: "my-stack", environment_id: 5,
      docker_compose_raw: "services:\n  web:\n    image: nginx\n",
      server: { uuid: "s1", name: "Server 1" },
    });
    cs.listServiceEnvs.mockResolvedValue([{ key: "MODE", value: "prod" }]);
    cs.listServiceStorages.mockResolvedValue({ persistent_storages: [], file_storages: [] });
    cs.listProjects.mockResolvedValue([{ uuid: "p1", name: "Proj" }]);
    cs.getProject.mockResolvedValue({ uuid: "p1", name: "Proj", environments: [{ id: 5, uuid: "e1", name: "production" }] });

    const info = await coolifyPlatformProvider.inspectResource("svc1");
    expect(info.type).toBe("service");
    expect(info.id).toBe("svc1");
    expect(info.hostId).toBe("s1");
    expect(info.hostName).toBe("Server 1");
    expect(info.envVars).toEqual([{ key: "MODE", value: "prod" }]);
    expect(info.buildConfig).toMatchObject({
      docker_compose_raw: "services:\n  web:\n    image: nginx\n",
      project_uuid: "p1",
      environment_name: "production",
    });
  });

  it("inspectResource returns database info when id belongs to a database", async () => {
    const { CoolifyError } = await import("@/services/coolify/types");
    cs.getApplication.mockRejectedValue(new CoolifyError("not found", "HTTP_404"));
    cs.getService.mockRejectedValue(new CoolifyError("not found", "HTTP_404"));
    cs.getDatabase.mockResolvedValue({
      uuid: "db1", name: "postgres", database_type: "standalone-postgresql",
      environment_id: 5,
      destination: { server: { uuid: "s1", name: "Server 1" } },
    });
    cs.listProjects.mockResolvedValue([{ uuid: "p1", name: "Proj" }]);
    cs.getProject.mockResolvedValue({ uuid: "p1", name: "Proj", environments: [{ id: 5, uuid: "e1", name: "production" }] });

    const info = await coolifyPlatformProvider.inspectResource("db1");
    expect(info.type).toBe("database");
    expect(info.id).toBe("db1");
    expect(info.hostId).toBe("s1");
    expect(info.buildConfig).toMatchObject({ database_type: "standalone-postgresql" });
    expect(info.envVars).toEqual([]);
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

  it("createResource replicates confirmed additional config fields via PATCH when set", async () => {
    cs.createApplication.mockResolvedValue({ uuid: "dest1" });
    cs.updateApplication.mockResolvedValue(undefined);
    cs.setEnvVarsBulk.mockResolvedValue(undefined);
    await coolifyPlatformProvider.createResource({
      name: "web-copy", destinationHostId: "s2",
      snapshot: {
        ...snapshot,
        buildConfig: {
          ...snapshot.buildConfig,
          health_check_enabled: true,
          health_check_path: "/health",
          ports_mappings: "9000:9000",
          limits_memory: "256m",
          limits_cpus: "0.5",
          pre_deployment_command: "echo pre",
          post_deployment_command: "echo post",
          custom_docker_run_options: "--cap-add=NET_ADMIN",
          static_image: "nginx:alpine",
        },
      },
    } as any);
    expect(cs.updateApplication).toHaveBeenCalledWith("dest1", expect.objectContaining({
      health_check_enabled: true,
      health_check_path: "/health",
      ports_mappings: "9000:9000",
      limits_memory: "256m",
      limits_cpus: "0.5",
      pre_deployment_command: "echo pre",
      post_deployment_command: "echo post",
      custom_docker_run_options: "--cap-add=NET_ADMIN",
      static_image: "nginx:alpine",
    }));
  });

  it("createResource omits additional config fields from PATCH when null/empty", async () => {
    cs.createApplication.mockResolvedValue({ uuid: "dest1" });
    cs.setEnvVarsBulk.mockResolvedValue(undefined);
    await coolifyPlatformProvider.createResource({
      name: "web-copy", destinationHostId: "s2",
      snapshot: {
        ...snapshot,
        buildConfig: {
          ...snapshot.buildConfig,
          health_check_enabled: null,
          health_check_path: null,
          ports_mappings: null,
          limits_memory: null,
          limits_cpus: null,
          pre_deployment_command: null,
          post_deployment_command: null,
          custom_docker_run_options: null,
          static_image: null,
        },
      },
    } as any);
    // updateApplication should not have been called (no fields to patch)
    expect(cs.updateApplication).not.toHaveBeenCalled();
  });

  it("createResource replicates health_check_enabled=false explicitly via PATCH", async () => {
    cs.createApplication.mockResolvedValue({ uuid: "dest1" });
    cs.updateApplication.mockResolvedValue(undefined);
    cs.setEnvVarsBulk.mockResolvedValue(undefined);
    await coolifyPlatformProvider.createResource({
      name: "web-copy", destinationHostId: "s2",
      snapshot: {
        ...snapshot,
        buildConfig: {
          ...snapshot.buildConfig,
          health_check_enabled: false,
        },
      },
    } as any);
    expect(cs.updateApplication).toHaveBeenCalledWith("dest1", expect.objectContaining({
      health_check_enabled: false,
    }));
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

  it("stop/start/delete delegate to the application service when the id is an application", async () => {
    cs.getApplication.mockResolvedValue({ uuid: "a1", name: "web" });
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

  it("stop/start/delete delegate to the service methods when the id is a service", async () => {
    const { CoolifyError } = await import("@/services/coolify/types");
    cs.getApplication.mockRejectedValue(new CoolifyError("not found", "HTTP_404"));
    cs.getService.mockResolvedValue({ uuid: "svc1", name: "my-stack" });
    cs.stopService.mockResolvedValue(undefined);
    cs.startService.mockResolvedValue(undefined);
    cs.deleteService.mockResolvedValue(undefined);
    await coolifyPlatformProvider.stopResource("svc1");
    await coolifyPlatformProvider.startResource("svc1");
    await coolifyPlatformProvider.deleteResource("svc1");
    expect(cs.stopService).toHaveBeenCalledWith("svc1");
    expect(cs.startService).toHaveBeenCalledWith("svc1");
    expect(cs.deleteService).toHaveBeenCalledWith("svc1");
    expect(cs.stopApplication).not.toHaveBeenCalled();
  });

  it("createResource for a service base64-encodes the compose and posts to /services", async () => {
    const serviceSnapshot = {
      id: "svc1", name: "my-stack", environment: "production",
      hostId: "s1", hostName: "Server 1", domains: [],
      type: "service",
      envVars: [{ key: "MODE", value: "prod" }],
      buildConfig: {
        docker_compose_raw: "services:\n  web:\n    image: nginx\n",
        project_uuid: "p1",
        environment_name: "production",
      },
      volumes: [],
    };
    cs.createService.mockResolvedValue({ uuid: "svc-dest1", domains: [] });
    cs.setEnvVarsBulk.mockResolvedValue(undefined);
    const res = await coolifyPlatformProvider.createResource({
      name: "my-stack-copy", destinationHostId: "s2", snapshot: serviceSnapshot as any,
    });
    expect(res).toEqual({ resourceId: "svc-dest1" });
    expect(cs.createService).toHaveBeenCalledWith({
      project_uuid: "p1",
      server_uuid: "s2",
      environment_name: "production",
      name: "my-stack-copy",
      docker_compose_raw: Buffer.from("services:\n  web:\n    image: nginx\n").toString("base64"),
    });
    expect(cs.setEnvVarsBulk).toHaveBeenCalledWith("svc-dest1", [{ key: "MODE", value: "prod" }]);
  });

  it("createResource for a database throws with a clear error", async () => {
    const dbSnapshot = {
      id: "db1", name: "postgres", environment: "production",
      hostId: "s1", hostName: "Server 1", domains: [],
      type: "database",
      envVars: [],
      buildConfig: { database_type: "standalone-postgresql" },
      volumes: [],
    };
    await expect(coolifyPlatformProvider.createResource({
      name: "pg-copy", destinationHostId: "s2", snapshot: dbSnapshot as any,
    })).rejects.toThrow(/Phase F/i);
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
