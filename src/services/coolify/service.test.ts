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
});
