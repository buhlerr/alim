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
});
