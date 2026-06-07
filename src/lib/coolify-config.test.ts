import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/settings", () => ({
  settingsService: { get: vi.fn() },
}));

import { settingsService } from "@/services/settings";
import {
  getCoolifyConfig,
  isCoolifyConfigured,
  COOLIFY_SETTING_KEYS,
} from "./coolify-config";

const get = settingsService.get as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.COOLIFY_BASE_URL;
  delete process.env.COOLIFY_API_TOKEN;
});

describe("getCoolifyConfig", () => {
  it("returns config from settings and strips trailing slashes", async () => {
    get.mockImplementation(async (key: string) =>
      key === COOLIFY_SETTING_KEYS.baseUrl
        ? "https://coolify.example.com/"
        : "tok_abc",
    );
    expect(await getCoolifyConfig()).toEqual({
      baseUrl: "https://coolify.example.com",
      apiToken: "tok_abc",
    });
  });

  it("falls back to env vars when settings are empty", async () => {
    get.mockResolvedValue(null);
    process.env.COOLIFY_BASE_URL = "https://cf.local";
    process.env.COOLIFY_API_TOKEN = "envtok";
    expect(await getCoolifyConfig()).toEqual({
      baseUrl: "https://cf.local",
      apiToken: "envtok",
    });
  });

  it("returns null when either value is missing", async () => {
    get.mockResolvedValue(null);
    process.env.COOLIFY_BASE_URL = "https://cf.local";
    // no token anywhere
    expect(await getCoolifyConfig()).toBeNull();
    expect(await isCoolifyConfigured()).toBe(false);
  });
});
