import { describe, it, expect } from "vitest";
import {
  classifyExposure,
  defaultFlags,
  isSslipDomain,
  buildSslipUrl,
  isTerminalStatus,
} from "./migration";

describe("isSslipDomain", () => {
  it("recognizes sslip.io hosts (with or without scheme/path)", () => {
    expect(isSslipDomain("abc123.192.168.100.11.sslip.io")).toBe(true);
    expect(isSslipDomain("https://abc.10.0.0.1.sslip.io/path")).toBe(true);
    expect(isSslipDomain("layerr.aspyrelabs.com")).toBe(false);
  });
});

describe("classifyExposure", () => {
  it("is internal when there are no domains", () => {
    expect(classifyExposure([])).toBe("internal");
  });
  it("is internal when all domains are sslip.io", () => {
    expect(classifyExposure(["a.10.0.0.1.sslip.io"])).toBe("internal");
  });
  it("is public when any domain is custom", () => {
    expect(classifyExposure(["a.10.0.0.1.sslip.io", "app.example.com"])).toBe("public");
  });
});

describe("defaultFlags", () => {
  it("turns NPM + Cloudflare on for public, off for internal", () => {
    expect(defaultFlags("public")).toEqual({ npmEnabled: true, cloudflareEnabled: true });
    expect(defaultFlags("internal")).toEqual({ npmEnabled: false, cloudflareEnabled: false });
  });
});

describe("buildSslipUrl", () => {
  it("builds an https sslip.io url from a subdomain and host ip", () => {
    expect(buildSslipUrl("abc123", "192.168.100.11")).toBe(
      "https://abc123.192.168.100.11.sslip.io",
    );
  });
});

describe("isTerminalStatus", () => {
  it("treats completed/failed/rolled_back as terminal only", () => {
    expect(isTerminalStatus("completed")).toBe(true);
    expect(isTerminalStatus("failed")).toBe(true);
    expect(isTerminalStatus("rolled_back")).toBe(true);
    expect(isTerminalStatus("awaiting_approval")).toBe(false);
    expect(isTerminalStatus("provisioning")).toBe(false);
  });
});
