import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/services/audit", () => ({ auditService: { record: vi.fn() } }));
vi.mock("@/services/npm/auth", () => ({ clearToken: vi.fn() }));
vi.mock("@/lib/npm-config", () => ({
  NPM_SETTING_KEYS: { baseUrl: "npm.baseUrl", identity: "npm.identity", secret: "npm.secret" },
  isNpmConfigured: vi.fn(),
  getNpmConfig: vi.fn(),
}));
vi.mock("@/services/settings", () => ({
  settingsService: { set: vi.fn(), has: vi.fn() },
}));
vi.mock("@/services/npm/service", () => ({
  npmService: {
    proxyHosts: { create: vi.fn(), update: vi.fn(), remove: vi.fn(), enable: vi.fn(), disable: vi.fn() },
  },
}));

import { settingsService } from "@/services/settings";
import { auditService } from "@/services/audit";
import { npmService } from "@/services/npm/service";
import {
  createProxyHostAction,
  deleteProxyHostAction,
  toggleProxyHostAction,
  saveNpmConfigAction,
} from "./npm";

const create = npmService.proxyHosts.create as unknown as ReturnType<typeof vi.fn>;
const enable = npmService.proxyHosts.enable as unknown as ReturnType<typeof vi.fn>;
const disable = npmService.proxyHosts.disable as unknown as ReturnType<typeof vi.fn>;
const remove = npmService.proxyHosts.remove as unknown as ReturnType<typeof vi.fn>;
const record = auditService.record as unknown as ReturnType<typeof vi.fn>;
const setSetting = settingsService.set as unknown as ReturnType<typeof vi.fn>;
const hasSetting = settingsService.has as unknown as ReturnType<typeof vi.fn>;

const validHost = {
  domain_names: "a.com, b.com",
  forward_scheme: "http",
  forward_host: "10.0.0.5",
  forward_port: 3000,
};

beforeEach(() => vi.clearAllMocks());

describe("createProxyHostAction", () => {
  it("creates a proxy host (domains parsed to an array) and audits it", async () => {
    create.mockResolvedValue({ id: 7 });
    const res = await createProxyHostAction(validHost);
    expect(res.ok).toBe(true);
    const req = create.mock.calls[0][0];
    expect(req.domain_names).toEqual(["a.com", "b.com"]);
    expect(req.forward_port).toBe(3000);
    expect(record.mock.calls[0][0].action).toBe("npm.proxy_host.create");
  });

  it("returns field errors and does not call the service on invalid input", async () => {
    const res = await createProxyHostAction({ domain_names: "" });
    expect(res.ok).toBe(false);
    expect(res.fieldErrors).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
  });
});

describe("toggleProxyHostAction", () => {
  it("enables when asked and records a toggle", async () => {
    enable.mockResolvedValue(undefined);
    await toggleProxyHostAction(5, true);
    expect(enable).toHaveBeenCalledWith(5);
    expect(disable).not.toHaveBeenCalled();
    expect(record.mock.calls[0][0].action).toBe("npm.proxy_host.toggle");
  });

  it("disables when asked", async () => {
    disable.mockResolvedValue(undefined);
    await toggleProxyHostAction(5, false);
    expect(disable).toHaveBeenCalledWith(5);
  });
});

describe("deleteProxyHostAction", () => {
  it("removes and audits", async () => {
    remove.mockResolvedValue(undefined);
    const res = await deleteProxyHostAction(9);
    expect(res.ok).toBe(true);
    expect(remove).toHaveBeenCalledWith(9);
    expect(record.mock.calls[0][0].action).toBe("npm.proxy_host.delete");
  });

  it("surfaces a friendly error when the service throws", async () => {
    remove.mockRejectedValue(new Error("boom"));
    const res = await deleteProxyHostAction(9);
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
  });
});

describe("saveNpmConfigAction", () => {
  it("requires a password on first-time setup", async () => {
    hasSetting.mockResolvedValue(false);
    const res = await saveNpmConfigAction({
      baseUrl: "https://npm.x",
      identity: "a@x.com",
      secret: "",
    });
    expect(res.ok).toBe(false);
    expect(res.fieldErrors?.secret).toBeTruthy();
    expect(setSetting).not.toHaveBeenCalled();
  });

  it("saves base URL, identity, and password when provided", async () => {
    hasSetting.mockResolvedValue(false);
    setSetting.mockResolvedValue(undefined);
    const res = await saveNpmConfigAction({
      baseUrl: "https://npm.x",
      identity: "a@x.com",
      secret: "pw",
    });
    expect(res.ok).toBe(true);
    expect(setSetting).toHaveBeenCalledTimes(3);
    expect(record.mock.calls[0][0].action).toBe("npm.config.save");
  });
});
