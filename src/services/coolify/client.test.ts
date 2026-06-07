import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/coolify-config", () => ({
  getCoolifyConfig: vi.fn(),
}));

import { getCoolifyConfig } from "@/lib/coolify-config";
import { coolifyFetch } from "./client";
import { CoolifyError } from "./types";

const getConfig = getCoolifyConfig as unknown as ReturnType<typeof vi.fn>;

function mockFetchOnce(init: {
  ok: boolean;
  status: number;
  body?: unknown;
}) {
  const text = init.body === undefined ? "" : JSON.stringify(init.body);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: init.ok,
      status: init.status,
      text: async () => text,
    })),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getConfig.mockResolvedValue({
    baseUrl: "https://coolify.example.com",
    apiToken: "tok_abc",
  });
});

describe("coolifyFetch", () => {
  it("throws NOT_CONFIGURED when no config", async () => {
    getConfig.mockResolvedValue(null);
    await expect(coolifyFetch({ path: "/applications" })).rejects.toMatchObject({
      code: "NOT_CONFIGURED",
    });
  });

  it("calls the v1 URL with bearer auth and parses JSON", async () => {
    mockFetchOnce({ ok: true, status: 200, body: [{ uuid: "a" }] });
    const result = await coolifyFetch<{ uuid: string }[]>({ path: "/applications" });
    expect(result).toEqual([{ uuid: "a" }]);
    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const url = call[0] as URL;
    const opts = call[1] as RequestInit;
    expect(url.toString()).toBe("https://coolify.example.com/api/v1/applications");
    expect((opts.headers as Record<string, string>).Authorization).toBe(
      "Bearer tok_abc",
    );
  });

  it("appends defined query params and skips undefined ones", async () => {
    mockFetchOnce({ ok: true, status: 200, body: {} });
    await coolifyFetch({ path: "/deploy", query: { uuid: "x", force: undefined } });
    const url = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as URL;
    expect(url.searchParams.get("uuid")).toBe("x");
    expect(url.searchParams.has("force")).toBe(false);
  });

  it("maps 401 to an INVALID_TOKEN CoolifyError", async () => {
    mockFetchOnce({ ok: false, status: 401, body: { message: "Unauthorized" } });
    await expect(coolifyFetch({ path: "/applications" })).rejects.toMatchObject({
      code: "INVALID_TOKEN",
    });
  });

  it("maps other non-ok responses to a CoolifyError carrying the status code", async () => {
    mockFetchOnce({ ok: false, status: 404, body: { message: "Not found" } });
    const err = await coolifyFetch({ path: "/applications/zzz" }).catch((e) => e);
    expect(err).toBeInstanceOf(CoolifyError);
    expect((err as CoolifyError).code).toBe("HTTP_404");
  });

  it("returns undefined for 204 No Content", async () => {
    mockFetchOnce({ ok: true, status: 204 });
    expect(await coolifyFetch({ path: "/applications/x/envs", method: "POST" })).toBeUndefined();
  });
});
