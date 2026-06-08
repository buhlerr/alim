import { describe, it, expect } from "vitest";
import { deploymentPlanSchema } from "./deployment-validation";

const coolify = {
  project_uuid: "p",
  server_uuid: "s",
  environment_name: "production",
  git_repository: "https://github.com/x/y",
  git_branch: "main",
  build_pack: "nixpacks",
  ports_exposes: "3000",
};

const dns = { type: "A", name: "app.example.com", content: "1.2.3.4", proxied: true };

describe("deploymentPlanSchema", () => {
  it("requires an application name", () => {
    expect(
      deploymentPlanSchema.safeParse({ applicationName: "", databaseEnabled: true, databaseEnvironment: "PROD" })
        .success,
    ).toBe(false);
  });

  it("requires at least one enabled step", () => {
    expect(deploymentPlanSchema.safeParse({ applicationName: "app" }).success).toBe(false);
  });

  it("accepts a database-only plan", () => {
    expect(
      deploymentPlanSchema.safeParse({
        applicationName: "app",
        databaseEnabled: true,
        databaseEnvironment: "PRODUCTION",
      }).success,
    ).toBe(true);
  });

  it("requires an environment when the database step is enabled", () => {
    expect(
      deploymentPlanSchema.safeParse({
        applicationName: "app",
        databaseEnabled: true,
        databaseEnvironment: "",
      }).success,
    ).toBe(false);
  });

  it("validates the coolify fields only when enabled", () => {
    expect(
      deploymentPlanSchema.safeParse({ applicationName: "app", coolifyEnabled: true, coolify: {} }).success,
    ).toBe(false);
    expect(
      deploymentPlanSchema.safeParse({ applicationName: "app", coolifyEnabled: true, coolify }).success,
    ).toBe(true);
  });

  it("validates the npm proxy-host fields only when enabled", () => {
    expect(
      deploymentPlanSchema.safeParse({ applicationName: "app", npmEnabled: true, npm: {} }).success,
    ).toBe(false);
    expect(
      deploymentPlanSchema.safeParse({
        applicationName: "app",
        npmEnabled: true,
        npm: {
          domain_names: "app.example.com",
          forward_scheme: "http",
          forward_host: "10.0.0.5",
          forward_port: 3000,
        },
      }).success,
    ).toBe(true);
  });

  it("validates the dns fields + zone only when enabled", () => {
    expect(
      deploymentPlanSchema.safeParse({ applicationName: "app", dnsEnabled: true, dns }).success,
    ).toBe(false); // missing zone
    expect(
      deploymentPlanSchema.safeParse({
        applicationName: "app",
        dnsEnabled: true,
        dnsZoneId: "z1",
        dns,
      }).success,
    ).toBe(true);
  });
});
