import { describe, it, expect } from "vitest";
import {
  parseDomains,
  npmConfigSchema,
  proxyHostSchema,
  redirectionHostSchema,
  streamSchema,
  deadHostSchema,
  letsEncryptSchema,
} from "./npm-validation";

describe("parseDomains", () => {
  it("splits on commas and whitespace, trims, drops blanks", () => {
    expect(parseDomains("a.com, b.com  c.com,")).toEqual([
      "a.com",
      "b.com",
      "c.com",
    ]);
  });

  it("returns an empty array for blank input", () => {
    expect(parseDomains("   ")).toEqual([]);
  });
});

describe("npmConfigSchema", () => {
  it("requires a URL and an email identity", () => {
    expect(
      npmConfigSchema.safeParse({ baseUrl: "https://npm.x", identity: "a@x.com" }).success,
    ).toBe(true);
    expect(npmConfigSchema.safeParse({ baseUrl: "nope", identity: "a@x.com" }).success).toBe(false);
    expect(npmConfigSchema.safeParse({ baseUrl: "https://npm.x", identity: "nope" }).success).toBe(false);
  });
});

describe("proxyHostSchema", () => {
  const valid = {
    domain_names: "app.example.com",
    forward_scheme: "http",
    forward_host: "10.0.0.5",
    forward_port: 3000,
  };

  it("accepts a minimal valid host and defaults the toggles", () => {
    const res = proxyHostSchema.parse(valid);
    expect(res.forward_port).toBe(3000);
    expect(res.certificate_id).toBe(0);
    expect(res.allow_websocket_upgrade).toBe(true);
  });

  it("coerces a string port to a number", () => {
    const res = proxyHostSchema.parse({ ...valid, forward_port: "8080" });
    expect(res.forward_port).toBe(8080);
  });

  it("rejects an out-of-range port", () => {
    expect(proxyHostSchema.safeParse({ ...valid, forward_port: 70000 }).success).toBe(false);
  });

  it("rejects a missing domain and a bad scheme", () => {
    expect(proxyHostSchema.safeParse({ ...valid, domain_names: "" }).success).toBe(false);
    expect(proxyHostSchema.safeParse({ ...valid, forward_scheme: "ftp" }).success).toBe(false);
  });
});

describe("redirectionHostSchema", () => {
  it("accepts a valid redirection and rejects a bad http code", () => {
    const base = {
      domain_names: "old.example.com",
      forward_scheme: "auto",
      forward_domain_name: "new.example.com",
      forward_http_code: 301,
    };
    expect(redirectionHostSchema.safeParse(base).success).toBe(true);
    expect(redirectionHostSchema.safeParse({ ...base, forward_http_code: 200 }).success).toBe(false);
  });
});

describe("streamSchema", () => {
  const base = {
    incoming_port: 2222,
    forwarding_host: "10.0.0.9",
    forwarding_port: 22,
    tcp_forwarding: true,
    udp_forwarding: false,
  };

  it("accepts a TCP stream", () => {
    expect(streamSchema.safeParse(base).success).toBe(true);
  });

  it("requires at least one of TCP/UDP", () => {
    expect(
      streamSchema.safeParse({ ...base, tcp_forwarding: false, udp_forwarding: false }).success,
    ).toBe(false);
  });
});

describe("deadHostSchema", () => {
  it("requires a domain", () => {
    expect(deadHostSchema.safeParse({ domain_names: "gone.example.com" }).success).toBe(true);
    expect(deadHostSchema.safeParse({ domain_names: "" }).success).toBe(false);
  });
});

describe("letsEncryptSchema", () => {
  it("requires domains and a valid email", () => {
    expect(
      letsEncryptSchema.safeParse({ domain_names: "a.com", email: "me@x.com" }).success,
    ).toBe(true);
    expect(
      letsEncryptSchema.safeParse({ domain_names: "a.com", email: "nope" }).success,
    ).toBe(false);
  });
});
