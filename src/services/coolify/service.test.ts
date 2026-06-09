import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./client", () => ({
  coolifyFetch: vi.fn(),
}));

import { coolifyFetch } from "./client";
import { coolifyService } from "./service";
import { CoolifyError } from "./types";

const fetchMock = coolifyFetch as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("coolifyService", () => {
  it("listApplications GETs /applications", async () => {
    fetchMock.mockResolvedValue([{ uuid: "a", name: "app" }]);
    const apps = await coolifyService.listApplications();
    expect(fetchMock).toHaveBeenCalledWith({ path: "/applications" });
    expect(apps).toEqual([{ uuid: "a", name: "app" }]);
  });

  it("getApplication GETs /applications/:uuid", async () => {
    fetchMock.mockResolvedValue({ uuid: "a", name: "app" });
    await coolifyService.getApplication("a");
    expect(fetchMock).toHaveBeenCalledWith({ path: "/applications/a" });
  });

  it("createApplication POSTs to /applications/public with the body", async () => {
    fetchMock.mockResolvedValue({ uuid: "new" });
    const req = {
      project_uuid: "p",
      server_uuid: "s",
      environment_name: "production",
      git_repository: "https://github.com/x/y",
      git_branch: "main",
      build_pack: "nixpacks",
      ports_exposes: "3000",
    };
    const out = await coolifyService.createApplication(req);
    expect(fetchMock).toHaveBeenCalledWith({
      path: "/applications/public",
      method: "POST",
      body: req,
    });
    expect(out).toEqual({ uuid: "new" });
  });

  it("updateApplication PATCHes /applications/:uuid", async () => {
    fetchMock.mockResolvedValue(undefined);
    await coolifyService.updateApplication("a", { domains: "https://x.com" });
    expect(fetchMock).toHaveBeenCalledWith({
      path: "/applications/a",
      method: "PATCH",
      body: { domains: "https://x.com" },
    });
  });

  it("deploy GETs /deploy with the uuid query param", async () => {
    fetchMock.mockResolvedValue({ message: "queued" });
    await coolifyService.deploy("a");
    expect(fetchMock).toHaveBeenCalledWith({ path: "/deploy", query: { uuid: "a" } });
  });

  it("listEnvVars GETs /applications/:uuid/envs", async () => {
    fetchMock.mockResolvedValue([{ key: "K", value: "V" }]);
    await coolifyService.listEnvVars("a");
    expect(fetchMock).toHaveBeenCalledWith({ path: "/applications/a/envs" });
  });

  it("setEnvVar POSTs key/value to /applications/:uuid/envs", async () => {
    fetchMock.mockResolvedValue(undefined);
    await coolifyService.setEnvVar("a", "K", "V");
    expect(fetchMock).toHaveBeenCalledWith({
      path: "/applications/a/envs",
      method: "POST",
      body: { key: "K", value: "V" },
    });
  });

  it("testConnection returns ok with the version on success", async () => {
    fetchMock.mockResolvedValue("4.0.0");
    const res = await coolifyService.testConnection();
    expect(fetchMock).toHaveBeenCalledWith({ path: "/version" });
    expect(res).toEqual({ ok: true, message: "Connection OK.", version: "4.0.0" });
  });

  it("testConnection returns a friendly failure on CoolifyError", async () => {
    fetchMock.mockRejectedValue(new CoolifyError("The Coolify API token was rejected.", "INVALID_TOKEN"));
    const res = await coolifyService.testConnection();
    expect(res.ok).toBe(false);
    expect(res.message).toBe("The Coolify API token was rejected.");
  });

  it("listProjects and listServers hit their endpoints", async () => {
    fetchMock.mockResolvedValue([]);
    await coolifyService.listProjects();
    expect(fetchMock).toHaveBeenCalledWith({ path: "/projects" });
    await coolifyService.listServers();
    expect(fetchMock).toHaveBeenCalledWith({ path: "/servers" });
  });

  it("listSecurityKeys GETs /security/keys", async () => {
    fetchMock.mockResolvedValue([{ id: 1, uuid: "k1", name: "my-key", private_key: "-----BEGIN OPENSSH PRIVATE KEY-----", is_git_related: false }]);
    const keys = await coolifyService.listSecurityKeys();
    expect(fetchMock).toHaveBeenCalledWith({ path: "/security/keys" });
    expect(keys[0]?.id).toBe(1);
    expect(keys[0]?.private_key).toBeDefined();
  });

  it("getServer GETs /servers/:uuid", async () => {
    fetchMock.mockResolvedValue({ uuid: "s1", name: "Server 1", ip: "10.0.0.1", settings: { is_reachable: true } });
    await coolifyService.getServer("s1");
    expect(fetchMock).toHaveBeenCalledWith({ path: "/servers/s1" });
  });

  it("getProject GETs /projects/:uuid", async () => {
    fetchMock.mockResolvedValue({ uuid: "p1", name: "Proj", environments: [{ id: 1, uuid: "e1", name: "production" }] });
    const p = await coolifyService.getProject("p1");
    expect(fetchMock).toHaveBeenCalledWith({ path: "/projects/p1" });
    expect(p.environments?.[0]?.name).toBe("production");
  });

  it("listServerResources GETs /servers/:uuid/resources", async () => {
    fetchMock.mockResolvedValue([{ uuid: "a", name: "app" }]);
    const r = await coolifyService.listServerResources("s1");
    expect(fetchMock).toHaveBeenCalledWith({ path: "/servers/s1/resources" });
    expect(r).toEqual([{ uuid: "a", name: "app" }]);
  });

  it("listStorages GETs /applications/:uuid/storages and returns the wrapper", async () => {
    fetchMock.mockResolvedValue({ persistent_storages: [{ name: "data", mount_path: "/data" }], file_storages: [] });
    const s = await coolifyService.listStorages("a1");
    expect(fetchMock).toHaveBeenCalledWith({ path: "/applications/a1/storages" });
    expect(s.persistent_storages?.[0]?.name).toBe("data");
  });

  it("getDeployment GETs /deployments/:uuid", async () => {
    fetchMock.mockResolvedValue({ uuid: "d1", status: "finished" });
    await coolifyService.getDeployment("d1");
    expect(fetchMock).toHaveBeenCalledWith({ path: "/deployments/d1" });
  });

  it("startApplication hits /applications/:uuid/start", async () => {
    fetchMock.mockResolvedValue(undefined);
    await coolifyService.startApplication("a1");
    expect(fetchMock).toHaveBeenCalledWith({ path: "/applications/a1/start" });
  });

  it("stopApplication hits /applications/:uuid/stop", async () => {
    fetchMock.mockResolvedValue(undefined);
    await coolifyService.stopApplication("a1");
    expect(fetchMock).toHaveBeenCalledWith({ path: "/applications/a1/stop" });
  });

  it("deleteApplication DELETEs /applications/:uuid with cleanup flags", async () => {
    fetchMock.mockResolvedValue(undefined);
    await coolifyService.deleteApplication("a1");
    expect(fetchMock).toHaveBeenCalledWith({
      path: "/applications/a1",
      method: "DELETE",
      query: { delete_configurations: true, delete_volumes: false, docker_cleanup: true },
    });
  });

  it("deploy returns the deployment response", async () => {
    fetchMock.mockResolvedValue({ deployments: [{ deployment_uuid: "d1" }] });
    const res = await coolifyService.deploy("a1");
    expect(fetchMock).toHaveBeenCalledWith({ path: "/deploy", query: { uuid: "a1" } });
    expect(res.deployments?.[0]?.deployment_uuid).toBe("d1");
  });

  it("listGithubApps GETs /github-apps", async () => {
    fetchMock.mockResolvedValue([{ id: 1, uuid: "gh1", name: "app", is_public: false }]);
    await coolifyService.listGithubApps();
    expect(fetchMock).toHaveBeenCalledWith({ path: "/github-apps" });
  });

  it("createApplicationPrivateGithubApp POSTs to /applications/private-github-app", async () => {
    fetchMock.mockResolvedValue({ uuid: "new" });
    const req = {
      project_uuid: "p", server_uuid: "s", environment_name: "dev",
      github_app_uuid: "gh1", git_repository: "owner/repo", git_branch: "main",
      build_pack: "nixpacks", ports_exposes: "8080", name: "x",
    };
    await coolifyService.createApplicationPrivateGithubApp(req);
    expect(fetchMock).toHaveBeenCalledWith({
      path: "/applications/private-github-app",
      method: "POST",
      body: req,
    });
  });

  describe("service methods", () => {
    it("listServices GETs /services", async () => {
      fetchMock.mockResolvedValue([{ uuid: "s1", name: "my-service" }]);
      const result = await coolifyService.listServices();
      expect(fetchMock).toHaveBeenCalledWith({ path: "/services" });
      expect(result).toEqual([{ uuid: "s1", name: "my-service" }]);
    });

    it("getService GETs /services/:uuid", async () => {
      fetchMock.mockResolvedValue({ uuid: "s1", name: "my-service", docker_compose_raw: "services:\n  web:\n    image: nginx\n" });
      await coolifyService.getService("s1");
      expect(fetchMock).toHaveBeenCalledWith({ path: "/services/s1" });
    });

    it("listServiceEnvs GETs /services/:uuid/envs", async () => {
      fetchMock.mockResolvedValue([{ key: "NODE_ENV", value: "production" }]);
      await coolifyService.listServiceEnvs("s1");
      expect(fetchMock).toHaveBeenCalledWith({ path: "/services/s1/envs" });
    });

    it("listServiceStorages GETs /services/:uuid/storages", async () => {
      fetchMock.mockResolvedValue({ persistent_storages: [{ name: "data", mount_path: "/data" }], file_storages: [] });
      const result = await coolifyService.listServiceStorages("s1");
      expect(fetchMock).toHaveBeenCalledWith({ path: "/services/s1/storages" });
      expect(result.persistent_storages?.[0]?.name).toBe("data");
    });

    it("createService POSTs to /services with the body (docker_compose_raw must be base64)", async () => {
      fetchMock.mockResolvedValue({ uuid: "s-new", domains: [] });
      const req = {
        project_uuid: "p1",
        server_uuid: "srv1",
        environment_name: "production",
        name: "my-stack",
        docker_compose_raw: Buffer.from("services:\n  web:\n    image: nginx\n").toString("base64"),
      };
      const result = await coolifyService.createService(req);
      expect(fetchMock).toHaveBeenCalledWith({ path: "/services", method: "POST", body: req });
      expect(result).toEqual({ uuid: "s-new", domains: [] });
    });

    it("startService hits /services/:uuid/start", async () => {
      fetchMock.mockResolvedValue(undefined);
      await coolifyService.startService("s1");
      expect(fetchMock).toHaveBeenCalledWith({ path: "/services/s1/start" });
    });

    it("stopService hits /services/:uuid/stop", async () => {
      fetchMock.mockResolvedValue(undefined);
      await coolifyService.stopService("s1");
      expect(fetchMock).toHaveBeenCalledWith({ path: "/services/s1/stop" });
    });

    it("deleteService DELETEs /services/:uuid with cleanup flags", async () => {
      fetchMock.mockResolvedValue(undefined);
      await coolifyService.deleteService("s1");
      expect(fetchMock).toHaveBeenCalledWith({
        path: "/services/s1",
        method: "DELETE",
        query: { delete_configurations: true, delete_volumes: false },
      });
    });
  });

  describe("database methods", () => {
    it("listDatabases GETs /databases", async () => {
      fetchMock.mockResolvedValue([{ uuid: "db1", name: "pg", database_type: "standalone-postgresql" }]);
      const result = await coolifyService.listDatabases();
      expect(fetchMock).toHaveBeenCalledWith({ path: "/databases" });
      expect(result[0]?.database_type).toBe("standalone-postgresql");
    });

    it("getDatabase GETs /databases/:uuid", async () => {
      fetchMock.mockResolvedValue({ uuid: "db1", name: "pg", database_type: "standalone-postgresql" });
      await coolifyService.getDatabase("db1");
      expect(fetchMock).toHaveBeenCalledWith({ path: "/databases/db1" });
    });

    it("startDatabase hits /databases/:uuid/start", async () => {
      fetchMock.mockResolvedValue(undefined);
      await coolifyService.startDatabase("db1");
      expect(fetchMock).toHaveBeenCalledWith({ path: "/databases/db1/start" });
    });

    it("stopDatabase hits /databases/:uuid/stop", async () => {
      fetchMock.mockResolvedValue(undefined);
      await coolifyService.stopDatabase("db1");
      expect(fetchMock).toHaveBeenCalledWith({ path: "/databases/db1/stop" });
    });

    it("deleteDatabase DELETEs /databases/:uuid with cleanup flags", async () => {
      fetchMock.mockResolvedValue(undefined);
      await coolifyService.deleteDatabase("db1");
      expect(fetchMock).toHaveBeenCalledWith({
        path: "/databases/db1",
        method: "DELETE",
        query: { delete_configurations: true, delete_volumes: false },
      });
    });
  });
});
