import { describe, it, expect } from "vitest";
import {
  createSecretSchema,
  updateSecretSchema,
  SECRET_CATEGORIES,
} from "./secrets-validation";

describe("createSecretSchema", () => {
  it("accepts a fully specified secret", () => {
    const res = createSecretSchema.safeParse({
      name: "Stripe key",
      value: "sk_live_123",
      category: "API Token",
      description: "Payments",
    });
    expect(res.success).toBe(true);
  });

  it("accepts a secret without a description", () => {
    const res = createSecretSchema.safeParse({
      name: "DB password",
      value: "hunter2",
      category: "Password",
    });
    expect(res.success).toBe(true);
  });

  it("rejects an empty name", () => {
    const res = createSecretSchema.safeParse({
      name: "   ",
      value: "x",
      category: "Other",
    });
    expect(res.success).toBe(false);
  });

  it("rejects an empty value on create", () => {
    const res = createSecretSchema.safeParse({
      name: "Token",
      value: "",
      category: "Other",
    });
    expect(res.success).toBe(false);
  });

  it("rejects a missing category", () => {
    const res = createSecretSchema.safeParse({
      name: "Token",
      value: "x",
      category: "",
    });
    expect(res.success).toBe(false);
  });

  it("trims the name", () => {
    const res = createSecretSchema.parse({
      name: "  Padded  ",
      value: "x",
      category: "Other",
    });
    expect(res.name).toBe("Padded");
  });
});

describe("updateSecretSchema", () => {
  it("allows an omitted value (keep existing)", () => {
    const res = updateSecretSchema.safeParse({
      name: "Token",
      category: "API Token",
    });
    expect(res.success).toBe(true);
  });

  it("allows an empty value (keep existing)", () => {
    const res = updateSecretSchema.safeParse({
      name: "Token",
      value: "",
      category: "API Token",
    });
    expect(res.success).toBe(true);
  });

  it("still requires a name", () => {
    const res = updateSecretSchema.safeParse({
      name: "",
      category: "API Token",
    });
    expect(res.success).toBe(false);
  });
});

describe("SECRET_CATEGORIES", () => {
  it("offers a stable set of presets including Other", () => {
    expect(SECRET_CATEGORIES).toContain("Other");
    expect(SECRET_CATEGORIES.length).toBeGreaterThan(1);
  });
});
