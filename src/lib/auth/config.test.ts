import { describe, it, expect } from "vitest";
import { loadAuthConfig, parseDuration, AuthConfigError } from "./config";

/** Minimal env that satisfies the default (password) mode. */
const base = { AUTH_PASSWORD: "hunter2", AUTH_SECRET: "s3cret-key" };

describe("parseDuration", () => {
  it("parses plain seconds", () => {
    expect(parseDuration("3600")).toBe(3600);
  });
  it("parses suffixed units", () => {
    expect(parseDuration("30m")).toBe(1800);
    expect(parseDuration("12h")).toBe(43200);
    expect(parseDuration("7d")).toBe(604800);
  });
  it("returns null for garbage", () => {
    expect(parseDuration("soon")).toBeNull();
    expect(parseDuration("")).toBeNull();
  });
});

describe("loadAuthConfig", () => {
  it("defaults to password mode when AUTH_MODE is unset", () => {
    expect(loadAuthConfig(base).mode).toBe("password");
  });

  it("accepts proxy and both modes", () => {
    expect(loadAuthConfig({ AUTH_MODE: "proxy" }).mode).toBe("proxy");
    expect(loadAuthConfig({ ...base, AUTH_MODE: "both" }).mode).toBe("both");
  });

  it("rejects 'none' explicitly", () => {
    expect(() => loadAuthConfig({ AUTH_MODE: "none" })).toThrow(AuthConfigError);
  });

  it("rejects unknown modes", () => {
    expect(() => loadAuthConfig({ AUTH_MODE: "magic" })).toThrow(AuthConfigError);
  });

  it("fails closed when password mode has no password", () => {
    expect(() => loadAuthConfig({ AUTH_MODE: "password", AUTH_SECRET: "x" })).toThrow(
      AuthConfigError,
    );
  });

  it("fails closed when both mode has no password", () => {
    expect(() => loadAuthConfig({ AUTH_MODE: "both", AUTH_SECRET: "x" })).toThrow(
      AuthConfigError,
    );
  });

  it("requires a signing secret when sessions are used", () => {
    expect(() => loadAuthConfig({ AUTH_MODE: "password", AUTH_PASSWORD: "p" })).toThrow(
      AuthConfigError,
    );
  });

  it("falls back to ENCRYPTION_KEY as the signing secret", () => {
    const cfg = loadAuthConfig({ AUTH_MODE: "password", AUTH_PASSWORD: "p", ENCRYPTION_KEY: "ek" });
    expect(cfg.secret).toBe("ek");
  });

  it("does not require a password or secret in proxy-only mode", () => {
    const cfg = loadAuthConfig({ AUTH_MODE: "proxy" });
    expect(cfg.password).toBeNull();
  });

  it("defaults the admin username to 'admin'", () => {
    expect(loadAuthConfig(base).adminUsername).toBe("admin");
  });

  it("honors AUTH_ADMIN_USERNAME", () => {
    expect(loadAuthConfig({ ...base, AUTH_ADMIN_USERNAME: "aasim" }).adminUsername).toBe("aasim");
  });

  it("defaults the proxy header to x-forwarded-user (lowercased)", () => {
    expect(loadAuthConfig({ AUTH_MODE: "proxy" }).proxyHeader).toBe("x-forwarded-user");
    expect(
      loadAuthConfig({ AUTH_MODE: "proxy", AUTH_PROXY_HEADER: "X-Auth-Request-Email" }).proxyHeader,
    ).toBe("x-auth-request-email");
  });

  it("defaults the session ttl to 7 days and honors overrides", () => {
    expect(loadAuthConfig(base).sessionTtlSeconds).toBe(604800);
    expect(loadAuthConfig({ ...base, AUTH_SESSION_TTL: "12h" }).sessionTtlSeconds).toBe(43200);
  });

  it("exposes the optional proxy shared secret", () => {
    expect(loadAuthConfig({ AUTH_MODE: "proxy" }).proxySharedSecret).toBeNull();
    expect(
      loadAuthConfig({ AUTH_MODE: "proxy", AUTH_PROXY_SHARED_SECRET: "abc" }).proxySharedSecret,
    ).toBe("abc");
  });
});
