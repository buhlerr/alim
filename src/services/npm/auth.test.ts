import { describe, it, expect, vi, beforeEach } from "vitest";

import { getToken, clearToken } from "./auth";
import { NpmError } from "./types";
import type { NpmConfig } from "@/lib/npm-config";

function cfg(host: string): NpmConfig {
  return { baseUrl: `https://${host}`, identity: "admin@x.com", secret: "pw" };
}

function tokenResponse(token: string, expires: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ token, expires }),
  };
}

const future = () => new Date(Date.now() + 24 * 3600 * 1000).toISOString();
const past = () => new Date(Date.now() - 1000).toISOString();

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("getToken", () => {
  it("mints a token on first use", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(tokenResponse("tok-1", future()) as unknown as Response);
    const c = cfg("a.npm");
    const token = await getToken(c);
    expect(token).toBe("tok-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://a.npm/api/tokens");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).body).toBe(
      JSON.stringify({ identity: "admin@x.com", secret: "pw" }),
    );
  });

  it("returns the cached token while it is still valid", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(tokenResponse("tok-2", future()) as unknown as Response);
    const c = cfg("b.npm");
    await getToken(c);
    const second = await getToken(c);
    expect(second).toBe("tok-2");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("re-mints when the cached token is expired", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(tokenResponse("tok-3", past()) as unknown as Response);
    const c = cfg("c.npm");
    await getToken(c);
    await getToken(c);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("re-mints after clearToken", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(tokenResponse("tok-4", future()) as unknown as Response);
    const c = cfg("d.npm");
    await getToken(c);
    clearToken(c);
    await getToken(c);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws INVALID_CREDENTIALS on HTTP 401", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    } as unknown as Response);
    await expect(getToken(cfg("e.npm"))).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
    await expect(getToken(cfg("e.npm"))).rejects.toBeInstanceOf(NpmError);
  });
});
