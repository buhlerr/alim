import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/npm-config", () => ({
  getNpmConfig: vi.fn(),
}));
vi.mock("./auth", () => ({
  getToken: vi.fn(),
  clearToken: vi.fn(),
}));

import { getNpmConfig } from "@/lib/npm-config";
import { getToken, clearToken } from "./auth";
import { npmFetch } from "./client";
import { NpmError } from "./types";

const getConfig = getNpmConfig as unknown as ReturnType<typeof vi.fn>;
const getTok = getToken as unknown as ReturnType<typeof vi.fn>;
const clearTok = clearToken as unknown as ReturnType<typeof vi.fn>;

const CONFIG = { baseUrl: "https://npm.example.com", identity: "a@x.com", secret: "pw" };

function jsonRes(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  getConfig.mockResolvedValue(CONFIG);
  getTok.mockResolvedValue("tok");
});

describe("npmFetch", () => {
  it("throws NOT_CONFIGURED when no config is present", async () => {
    getConfig.mockResolvedValue(null);
    await expect(npmFetch({ path: "/nginx/proxy-hosts" })).rejects.toMatchObject({
      code: "NOT_CONFIGURED",
    });
  });

  it("sends a bearer token and builds the /api URL", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(jsonRes(200, [{ id: 1 }]) as unknown as Response);
    const out = await npmFetch<unknown[]>({ path: "/nginx/proxy-hosts" });
    expect(out).toEqual([{ id: 1 }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://npm.example.com/api/nginx/proxy-hosts");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer tok",
    });
  });

  it("appends query params", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(jsonRes(200, []) as unknown as Response);
    await npmFetch({ path: "/nginx/certificates", query: { expand: "owner" } });
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://npm.example.com/api/nginx/certificates?expand=owner",
    );
  });

  it("clears the token and retries once on 401", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(jsonRes(401, {}) as unknown as Response)
      .mockResolvedValueOnce(jsonRes(200, { id: 9 }) as unknown as Response);
    const out = await npmFetch<{ id: number }>({ path: "/nginx/proxy-hosts/9" });
    expect(clearTok).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(out).toEqual({ id: 9 });
  });

  it("throws a normalized error after a second 401", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(jsonRes(401, {}) as unknown as Response);
    await expect(npmFetch({ path: "/x" })).rejects.toBeInstanceOf(NpmError);
  });

  it("maps 404 to a friendly NpmError", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(jsonRes(404, {}) as unknown as Response);
    await expect(npmFetch({ path: "/x" })).rejects.toMatchObject({ code: "HTTP_404" });
  });

  it("returns undefined for 204", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 204,
      text: async () => "",
    } as unknown as Response);
    expect(await npmFetch({ path: "/x", method: "DELETE" })).toBeUndefined();
  });

  it("tolerates a non-JSON body", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "OK",
    } as unknown as Response);
    expect(await npmFetch<string>({ path: "/" })).toBe("OK");
  });

  it("normalizes network failures", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue({ code: "ECONNREFUSED" });
    await expect(npmFetch({ path: "/x" })).rejects.toMatchObject({
      code: "ECONNREFUSED",
    });
  });
});
