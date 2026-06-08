import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/provisioning/postgres", () => ({
  postgresProvisioner: { provision: vi.fn() },
}));
vi.mock("@/services/registry", () => ({
  registryService: { record: vi.fn() },
}));
vi.mock("@/services/coolify/service", () => ({
  coolifyService: { createApplication: vi.fn(), deploy: vi.fn() },
}));
vi.mock("@/services/cloudflare/service", () => ({
  cloudflareService: { dns: { create: vi.fn() } },
}));
vi.mock("@/services/npm/service", () => ({
  npmService: { proxyHosts: { create: vi.fn() } },
}));
vi.mock("@/services/environments", () => ({
  environmentsService: { get: vi.fn() },
}));

import { postgresProvisioner } from "@/services/provisioning/postgres";
import { registryService } from "@/services/registry";
import { coolifyService } from "@/services/coolify/service";
import { cloudflareService } from "@/services/cloudflare/service";
import { npmService } from "@/services/npm/service";
import { environmentsService } from "@/services/environments";
import { runDeployment } from "./orchestrator";
import type { DeploymentPlan } from "./types";

const provision = postgresProvisioner.provision as unknown as ReturnType<typeof vi.fn>;
const record = registryService.record as unknown as ReturnType<typeof vi.fn>;
const createApp = coolifyService.createApplication as unknown as ReturnType<typeof vi.fn>;
const deploy = coolifyService.deploy as unknown as ReturnType<typeof vi.fn>;
const dnsCreate = cloudflareService.dns.create as unknown as ReturnType<typeof vi.fn>;
const npmCreate = npmService.proxyHosts.create as unknown as ReturnType<typeof vi.fn>;
const envGet = environmentsService.get as unknown as ReturnType<typeof vi.fn>;

const EMPTY: DeploymentPlan = {
  applicationName: "myapp",
  database: null,
  coolify: null,
  npm: null,
  dns: null,
};

function proxyReq() {
  return {
    domain_names: ["app.example.com"],
    forward_scheme: "http" as const,
    forward_host: "10.0.0.5",
    forward_port: 3000,
    certificate_id: 0,
    ssl_forced: false,
    http2_support: false,
    hsts_enabled: false,
    block_exploits: true,
    caching_enabled: false,
    allow_websocket_upgrade: true,
    access_list_id: 0,
    advanced_config: "",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  envGet.mockResolvedValue({ key: "PRODUCTION", abbreviation: "" });
  provision.mockResolvedValue({
    environment: "PRODUCTION",
    databaseName: "myapp",
    username: "myapp_user",
    host: "db.host",
    port: 5432,
    connectionString: "postgres://myapp_user:pw@db.host:5432/myapp",
    status: "created",
    steps: [],
  });
  record.mockResolvedValue({});
  createApp.mockResolvedValue({ uuid: "app-123" });
  deploy.mockResolvedValue({ message: "queued" });
  dnsCreate.mockResolvedValue({ id: "dns-1" });
  npmCreate.mockResolvedValue({ id: 42 });
});

describe("runDeployment", () => {
  it("skips every step when nothing is enabled", async () => {
    const res = await runDeployment(EMPTY);
    expect(res.ok).toBe(true);
    expect(res.steps.map((s) => s.status)).toEqual([
      "skipped",
      "skipped",
      "skipped",
      "skipped",
    ]);
    expect(provision).not.toHaveBeenCalled();
    expect(npmCreate).not.toHaveBeenCalled();
  });

  it("creates an NPM proxy host", async () => {
    const npm = proxyReq();
    const res = await runDeployment({ ...EMPTY, npm });
    expect(npmCreate).toHaveBeenCalledWith(npm);
    const step = res.steps.find((s) => s.key === "npm");
    expect(step?.status).toBe("success");
    expect(step?.detail).toContain("app.example.com");
  });

  it("provisions a database, deriving names and surfacing the connection string", async () => {
    const res = await runDeployment({ ...EMPTY, database: { environment: "PRODUCTION" } });
    expect(provision).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: "PRODUCTION",
        applicationName: "myapp",
        databaseName: "myapp",
        username: "myapp_user",
      }),
    );
    expect(record).toHaveBeenCalled();
    const dbStep = res.steps.find((s) => s.key === "database");
    expect(dbStep?.status).toBe("success");
    expect(dbStep?.secret).toContain("postgres://");
  });

  it("creates and deploys a Coolify app", async () => {
    const coolify = {
      project_uuid: "p",
      server_uuid: "s",
      environment_name: "production",
      git_repository: "https://github.com/x/y",
      git_branch: "main",
      build_pack: "nixpacks",
      ports_exposes: "3000",
    };
    const res = await runDeployment({ ...EMPTY, coolify });
    expect(createApp).toHaveBeenCalledWith(expect.objectContaining({ project_uuid: "p" }));
    expect(deploy).toHaveBeenCalledWith("app-123");
    const step = res.steps.find((s) => s.key === "coolify");
    expect(step?.status).toBe("success");
    expect(step?.detail).toContain("app-123");
  });

  it("creates a DNS record", async () => {
    const dns = {
      zoneId: "z1",
      type: "A",
      name: "myapp.example.com",
      content: "1.2.3.4",
      proxied: true,
    };
    const res = await runDeployment({ ...EMPTY, dns });
    expect(dnsCreate).toHaveBeenCalledWith("z1", {
      type: "A",
      name: "myapp.example.com",
      content: "1.2.3.4",
      proxied: true,
      ttl: 1,
    });
    expect(res.steps.find((s) => s.key === "dns")?.status).toBe("success");
  });

  it("marks a failing step failed but still runs later steps", async () => {
    provision.mockRejectedValue(new Error("db unreachable"));
    const res = await runDeployment({
      ...EMPTY,
      database: { environment: "PRODUCTION" },
      dns: { zoneId: "z1", type: "A", name: "a.com", content: "1.2.3.4", proxied: false },
    });
    expect(res.ok).toBe(false);
    expect(res.steps.find((s) => s.key === "database")?.status).toBe("failed");
    // DNS still ran despite the earlier failure.
    expect(dnsCreate).toHaveBeenCalled();
    expect(res.steps.find((s) => s.key === "dns")?.status).toBe("success");
  });

  it("fails the database step with a friendly message when the environment is unknown", async () => {
    envGet.mockResolvedValue(null);
    const res = await runDeployment({ ...EMPTY, database: { environment: "NOPE" } });
    const dbStep = res.steps.find((s) => s.key === "database");
    expect(dbStep?.status).toBe("failed");
    expect(provision).not.toHaveBeenCalled();
  });
});
