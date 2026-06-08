import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/services/deployment/orchestrator", () => ({ runDeployment: vi.fn() }));
vi.mock("@/services/audit", () => ({ auditService: { record: vi.fn() } }));
// Service/config imports are only used by getDeploymentOptionsAction; stub them
// so the module graph stays light for these runDeploymentAction tests.
vi.mock("@/services/environments", () => ({ environmentsService: { list: vi.fn() } }));
vi.mock("@/services/coolify/service", () => ({
  coolifyService: { listProjects: vi.fn(), listServers: vi.fn() },
}));
vi.mock("@/services/cloudflare/service", () => ({
  cloudflareService: { zones: { list: vi.fn() } },
}));
vi.mock("@/lib/coolify-config", () => ({ isCoolifyConfigured: vi.fn() }));
vi.mock("@/lib/cloudflare-config", () => ({ isCloudflareConfigured: vi.fn() }));
vi.mock("@/lib/npm-config", () => ({ isNpmConfigured: vi.fn() }));

import { runDeployment } from "@/services/deployment/orchestrator";
import { auditService } from "@/services/audit";
import { runDeploymentAction } from "./deploy";

const run = runDeployment as unknown as ReturnType<typeof vi.fn>;
const record = auditService.record as unknown as ReturnType<typeof vi.fn>;

const coolify = {
  project_uuid: "p",
  server_uuid: "s",
  environment_name: "production",
  git_repository: "https://github.com/x/y",
  git_branch: "main",
  build_pack: "nixpacks",
  ports_exposes: "3000",
};

beforeEach(() => {
  vi.clearAllMocks();
  run.mockResolvedValue({
    ok: true,
    steps: [
      { key: "database", label: "Database", status: "skipped" },
      { key: "coolify", label: "Coolify app", status: "success" },
      { key: "npm", label: "Proxy host", status: "skipped" },
      { key: "dns", label: "Cloudflare DNS", status: "skipped" },
    ],
  });
});

describe("runDeploymentAction", () => {
  it("rejects an empty plan without running a deployment", async () => {
    const res = await runDeploymentAction({ applicationName: "app" });
    expect(res.ok).toBe(false);
    expect(res.fieldErrors).toBeTruthy();
    expect(run).not.toHaveBeenCalled();
  });

  it("maps a database-only plan and records an audit event", async () => {
    const res = await runDeploymentAction({
      applicationName: "app",
      databaseEnabled: true,
      databaseEnvironment: "PRODUCTION",
    });
    expect(res.ok).toBe(true);
    const plan = run.mock.calls[0][0];
    expect(plan.database).toEqual({ environment: "PRODUCTION" });
    expect(plan.coolify).toBeNull();
    expect(plan.npm).toBeNull();
    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0][0].action).toBe("deployment.run");
  });

  it("maps the coolify step, converting blank name/domains to undefined", async () => {
    await runDeploymentAction({
      applicationName: "app",
      coolifyEnabled: true,
      coolify: { ...coolify, name: "", domains: "" },
    });
    const plan = run.mock.calls[0][0];
    expect(plan.coolify).toMatchObject({ project_uuid: "p", ports_exposes: "3000" });
    expect(plan.coolify.name).toBeUndefined();
    expect(plan.coolify.domains).toBeUndefined();
  });

  it("maps the npm step into a ProxyHostRequest with a parsed domain array", async () => {
    await runDeploymentAction({
      applicationName: "app",
      npmEnabled: true,
      npm: {
        domain_names: "a.com, b.com",
        forward_scheme: "http",
        forward_host: "10.0.0.5",
        forward_port: 3000,
      },
    });
    const plan = run.mock.calls[0][0];
    expect(plan.npm.domain_names).toEqual(["a.com", "b.com"]);
    expect(plan.npm.forward_port).toBe(3000);
    expect(plan.npm.allow_websocket_upgrade).toBe(true);
  });

  it("disables SSL toggles when no certificate is selected", async () => {
    await runDeploymentAction({
      applicationName: "app",
      npmEnabled: true,
      npm: {
        domain_names: "a.com",
        forward_scheme: "http",
        forward_host: "h",
        forward_port: 80,
        ssl_forced: true,
        certificate_id: 0,
      },
    });
    const plan = run.mock.calls[0][0];
    expect(plan.npm.ssl_forced).toBe(false);
  });

  it("reflects a failed deployment via audit success=false but still returns ok", async () => {
    run.mockResolvedValue({
      ok: false,
      steps: [{ key: "database", label: "Database", status: "failed", error: "x" }],
    });
    const res = await runDeploymentAction({
      applicationName: "app",
      databaseEnabled: true,
      databaseEnvironment: "PRODUCTION",
    });
    expect(res.ok).toBe(true); // the action ran successfully
    expect(res.data?.ok).toBe(false); // the deployment had a failed step
    expect(record.mock.calls[0][0].success).toBe(false);
  });
});
