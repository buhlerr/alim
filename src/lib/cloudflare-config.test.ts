import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/settings", () => ({
  settingsService: { get: vi.fn() },
}));

import { settingsService } from "@/services/settings";
import {
  getCloudflareConfig,
  isCloudflareConfigured,
  CLOUDFLARE_SETTING_KEYS,
} from "./cloudflare-config";

const get = settingsService.get as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.CLOUDFLARE_API_TOKEN;
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
});

describe("getCloudflareConfig", () => {
  it("resolves token + account from settings, trimming", async () => {
    get.mockImplementation(async (key: string) => {
      if (key === CLOUDFLARE_SETTING_KEYS.apiToken) return "  tok  ";
      if (key === CLOUDFLARE_SETTING_KEYS.accountId) return " acct ";
      return null;
    });
    expect(await getCloudflareConfig()).toEqual({
      apiToken: "tok",
      accountId: "acct",
    });
  });

  it("returns the config with an empty accountId when only the token is set", async () => {
    get.mockImplementation(async (key: string) =>
      key === CLOUDFLARE_SETTING_KEYS.apiToken ? "tok" : null,
    );
    expect(await getCloudflareConfig()).toEqual({ apiToken: "tok", accountId: "" });
  });

  it("falls back to env vars", async () => {
    get.mockResolvedValue(null);
    process.env.CLOUDFLARE_API_TOKEN = "envtok";
    process.env.CLOUDFLARE_ACCOUNT_ID = "envacct";
    expect(await getCloudflareConfig()).toEqual({
      apiToken: "envtok",
      accountId: "envacct",
    });
  });

  it("returns null when no token is present", async () => {
    get.mockResolvedValue(null);
    expect(await getCloudflareConfig()).toBeNull();
  });
});

describe("isCloudflareConfigured", () => {
  it("reflects token presence", async () => {
    get.mockResolvedValue(null);
    expect(await isCloudflareConfigured()).toBe(false);
    get.mockImplementation(async (key: string) =>
      key === CLOUDFLARE_SETTING_KEYS.apiToken ? "tok" : null,
    );
    expect(await isCloudflareConfigured()).toBe(true);
  });
});
