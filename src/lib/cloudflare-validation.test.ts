import { describe, it, expect } from "vitest";
import {
  cloudflareConfigSchema,
  tunnelCreateSchema,
  tunnelRouteSchema,
  dnsRecordSchema,
  tlsSchema,
} from "./cloudflare-validation";

describe("cloudflareConfigSchema", () => {
  it("requires a token; account is optional", () => {
    expect(cloudflareConfigSchema.safeParse({ apiToken: "t" }).success).toBe(true);
    expect(cloudflareConfigSchema.safeParse({ apiToken: "t", accountId: "a" }).success).toBe(true);
    expect(cloudflareConfigSchema.safeParse({ accountId: "a" }).success).toBe(false);
  });
});

describe("tunnelCreateSchema", () => {
  it("requires a name", () => {
    expect(tunnelCreateSchema.safeParse({ name: "web" }).success).toBe(true);
    expect(tunnelCreateSchema.safeParse({ name: "" }).success).toBe(false);
  });
});

describe("tunnelRouteSchema", () => {
  it("requires hostname and a service URL", () => {
    expect(
      tunnelRouteSchema.safeParse({ hostname: "a.com", service: "http://localhost:3000" }).success,
    ).toBe(true);
    expect(tunnelRouteSchema.safeParse({ hostname: "", service: "http://x" }).success).toBe(false);
    expect(tunnelRouteSchema.safeParse({ hostname: "a.com", service: "" }).success).toBe(false);
  });
});

describe("dnsRecordSchema", () => {
  const base = { type: "A", name: "a.com", content: "1.2.3.4" };

  it("accepts a valid record and defaults proxied/ttl", () => {
    const res = dnsRecordSchema.parse(base);
    expect(res.proxied).toBe(false);
    expect(res.ttl).toBe(1);
  });

  it("coerces ttl from a string", () => {
    expect(dnsRecordSchema.parse({ ...base, ttl: "300" }).ttl).toBe(300);
  });

  it("rejects an invalid type and missing content", () => {
    expect(dnsRecordSchema.safeParse({ ...base, type: "ZZ" }).success).toBe(false);
    expect(dnsRecordSchema.safeParse({ ...base, content: "" }).success).toBe(false);
  });
});

describe("tlsSchema", () => {
  it("accepts valid ssl modes and rejects others", () => {
    expect(tlsSchema.safeParse({ ssl: "full", always_use_https: true }).success).toBe(true);
    expect(tlsSchema.safeParse({ ssl: "nope", always_use_https: false }).success).toBe(false);
  });
});
