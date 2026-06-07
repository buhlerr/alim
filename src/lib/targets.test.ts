import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/settings", () => ({
  settingsService: { get: vi.fn() },
}));

vi.mock("@/services/environments", () => ({
  environmentsService: {
    list: vi.fn(async () => [
      { key: "PRODUCTION", name: "Production", color: "red", abbreviation: "" },
      { key: "STAGING", name: "Staging", color: "amber", abbreviation: "staging" },
      { key: "DEVELOPMENT", name: "Development", color: "slate", abbreviation: "dev" },
    ]),
    get: vi.fn(async (k: string) => ({ key: k, name: k, color: "slate", abbreviation: null })),
  },
}));

import { settingsService } from "@/services/settings";
import { getAdminUrl, getTargetInfo, POSTGRES_SETTING_KEYS } from "./targets";

const get = settingsService.get as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.POSTGRES_PROD_URL;
  delete process.env.POSTGRES_STAGING_URL;
  delete process.env.POSTGRES_DEV_URL;
});

describe("getAdminUrl", () => {
  it("prefers the settings value over the env var", async () => {
    get.mockImplementation(async (k: string) =>
      k === POSTGRES_SETTING_KEYS("PRODUCTION")
        ? "postgresql://s@db:5432/postgres"
        : null,
    );
    process.env.POSTGRES_PROD_URL = "postgresql://e@env:5432/postgres";
    expect(await getAdminUrl("PRODUCTION")).toBe("postgresql://s@db:5432/postgres");
  });

  it("falls back to the env var when no setting is stored", async () => {
    get.mockResolvedValue(null);
    process.env.POSTGRES_STAGING_URL = "postgresql://e@env:5432/postgres";
    expect(await getAdminUrl("STAGING")).toBe("postgresql://e@env:5432/postgres");
  });

  it("returns null when neither is set", async () => {
    get.mockResolvedValue(null);
    expect(await getAdminUrl("DEVELOPMENT")).toBeNull();
  });
});

describe("getTargetInfo", () => {
  it("reports source=settings and never leaks the password", async () => {
    get.mockResolvedValue("postgresql://admin:secret@db.internal:5432/postgres");
    const info = await getTargetInfo("PRODUCTION");
    expect(info.configured).toBe(true);
    expect(info.source).toBe("settings");
    expect(info.host).toBe("db.internal");
    expect(info.port).toBe(5432);
    expect(info.masked).toBe(
      "postgresql://admin:****@db.internal:5432/postgres",
    );
    expect(info.masked).not.toContain("secret");
  });

  it("reports source=env when only the env var is set", async () => {
    get.mockResolvedValue(null);
    process.env.POSTGRES_DEV_URL = "postgresql://u:p@host:5432/postgres";
    const info = await getTargetInfo("DEVELOPMENT");
    expect(info.source).toBe("env");
    expect(info.configured).toBe(true);
  });

  it("reports unconfigured when nothing is set", async () => {
    get.mockResolvedValue(null);
    const info = await getTargetInfo("STAGING");
    expect(info.configured).toBe(false);
    expect(info.source).toBeNull();
    expect(info.masked).toBeNull();
  });
});
