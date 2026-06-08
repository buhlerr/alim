import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/settings", () => ({
  settingsService: { get: vi.fn() },
}));

import { settingsService } from "@/services/settings";
import { getNpmConfig, isNpmConfigured, NPM_SETTING_KEYS } from "./npm-config";

const get = settingsService.get as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.NPM_BASE_URL;
  delete process.env.NPM_IDENTITY;
  delete process.env.NPM_SECRET;
});

describe("getNpmConfig", () => {
  it("resolves from settings, trimming and stripping trailing slashes", async () => {
    get.mockImplementation(async (key: string) => {
      if (key === NPM_SETTING_KEYS.baseUrl) return "https://npm.example.com/ ";
      if (key === NPM_SETTING_KEYS.identity) return "admin@example.com";
      if (key === NPM_SETTING_KEYS.secret) return "pw";
      return null;
    });
    const cfg = await getNpmConfig();
    expect(cfg).toEqual({
      baseUrl: "https://npm.example.com",
      identity: "admin@example.com",
      secret: "pw",
    });
  });

  it("falls back to env vars when settings are empty", async () => {
    get.mockResolvedValue(null);
    process.env.NPM_BASE_URL = "https://npm.env";
    process.env.NPM_IDENTITY = "env@example.com";
    process.env.NPM_SECRET = "envpw";
    const cfg = await getNpmConfig();
    expect(cfg).toEqual({
      baseUrl: "https://npm.env",
      identity: "env@example.com",
      secret: "envpw",
    });
  });

  it("returns null when any credential is missing", async () => {
    get.mockImplementation(async (key: string) =>
      key === NPM_SETTING_KEYS.baseUrl ? "https://npm.example.com" : null,
    );
    expect(await getNpmConfig()).toBeNull();
  });
});

describe("isNpmConfigured", () => {
  it("is true only when fully configured", async () => {
    get.mockResolvedValue(null);
    expect(await isNpmConfigured()).toBe(false);
    get.mockResolvedValue("x");
    expect(await isNpmConfigured()).toBe(true);
  });
});
