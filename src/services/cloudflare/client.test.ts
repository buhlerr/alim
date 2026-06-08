import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/cloudflare-config", () => ({ getCloudflareConfig: vi.fn() }));

import { getCloudflareConfig } from "@/lib/cloudflare-config";
import { cfFetch } from "./client";
import { CloudflareError } from "./types";

const getConfig = getCloudflareConfig as unknown as ReturnType<typeof vi.fn>;

function res(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  getConfig.mockResolvedValue({ apiToken: "tok", accountId: "acct" });
});

describe("cfFetch", () => {
  it("throws NOT_CONFIGURED when no config", async () => {
    getConfig.mockResolvedValue(null);
    await expect(cfFetch({ path: "/zones" })).rejects.toMatchObject({
      code: "NOT_CONFIGURED",
    });
  });

  it("unwraps result and sends a bearer token", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(
      res(200, { success: true, errors: [], result: [{ id: "z1" }] }) as unknown as Response,
    );
    const out = await cfFetch<{ id: string }[]>({ path: "/zones" });
    expect(out).toEqual([{ id: "z1" }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.cloudflare.com/client/v4/zones");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer tok" });
  });

  it("appends query params", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(
      res(200, { success: true, errors: [], result: [] }) as unknown as Response,
    );
    await cfFetch({ path: "/zones", query: { name: "example.com" } });
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://api.cloudflare.com/client/v4/zones?name=example.com",
    );
  });

  it("throws CloudflareError with the first error message on success:false", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      res(200, {
        success: false,
        errors: [{ code: 1003, message: "Invalid something" }],
        result: null,
      }) as unknown as Response,
    );
    await expect(cfFetch({ path: "/zones" })).rejects.toMatchObject({
      message: "Invalid something",
    });
  });

  it("maps HTTP 401 to INVALID_TOKEN", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(res(401, {}) as unknown as Response);
    await expect(cfFetch({ path: "/zones" })).rejects.toMatchObject({
      code: "INVALID_TOKEN",
    });
  });

  it("sends a JSON body for writes", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(
      res(200, { success: true, errors: [], result: { id: "d1" } }) as unknown as Response,
    );
    await cfFetch({ path: "/zones/z/dns_records", method: "POST", body: { type: "A" } });
    expect((fetchMock.mock.calls[0][1] as RequestInit).body).toBe(
      JSON.stringify({ type: "A" }),
    );
  });

  it("normalizes network failures", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue({ code: "ENOTFOUND" });
    await expect(cfFetch({ path: "/zones" })).rejects.toBeInstanceOf(CloudflareError);
  });
});
