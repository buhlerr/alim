import { describe, it, expect } from "vitest";
import {
  coolifyConfigSchema,
  createApplicationSchema,
  envVarSchema,
} from "./coolify-validation";

describe("coolifyConfigSchema", () => {
  it("accepts an https URL and a token", () => {
    const r = coolifyConfigSchema.safeParse({
      baseUrl: "https://coolify.example.com",
      apiToken: "tok_abc123",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a non-URL base", () => {
    const r = coolifyConfigSchema.safeParse({ baseUrl: "not a url", apiToken: "x" });
    expect(r.success).toBe(false);
  });

  it("rejects an empty token", () => {
    const r = coolifyConfigSchema.safeParse({ baseUrl: "https://x.com", apiToken: "" });
    expect(r.success).toBe(false);
  });
});

describe("createApplicationSchema", () => {
  it("accepts a full create payload", () => {
    const r = createApplicationSchema.safeParse({
      project_uuid: "p",
      server_uuid: "s",
      environment_name: "production",
      git_repository: "https://github.com/x/y",
      git_branch: "main",
      build_pack: "nixpacks",
      ports_exposes: "3000",
      name: "my-app",
    });
    expect(r.success).toBe(true);
  });

  it("rejects an invalid build pack", () => {
    const r = createApplicationSchema.safeParse({
      project_uuid: "p",
      server_uuid: "s",
      environment_name: "production",
      git_repository: "https://github.com/x/y",
      git_branch: "main",
      build_pack: "wizardry",
      ports_exposes: "3000",
    });
    expect(r.success).toBe(false);
  });
});

describe("envVarSchema", () => {
  it("requires a non-empty key", () => {
    expect(envVarSchema.safeParse({ key: "", value: "v" }).success).toBe(false);
    expect(envVarSchema.safeParse({ key: "K", value: "" }).success).toBe(true);
  });
});
