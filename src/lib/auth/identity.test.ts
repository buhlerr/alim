import { describe, it, expect } from "vitest";
import { resolveIdentity, PROXY_SECRET_HEADER } from "./identity";
import { signSession } from "./session";
import { loadAuthConfig } from "./config";

const now = 1_700_000_000;

/** Build a case-insensitive header getter from a plain object. */
function headers(map: Record<string, string>) {
  const lower = new Map(Object.entries(map).map(([k, v]) => [k.toLowerCase(), v]));
  return (name: string) => lower.get(name.toLowerCase()) ?? null;
}

async function cookie(sub: string, secret: string, ttl = 3600) {
  return signSession({ sub, mode: "password" }, secret, ttl, now);
}

describe("resolveIdentity — proxy mode", () => {
  const config = loadAuthConfig({ AUTH_MODE: "proxy" });

  it("trusts a present identity header", async () => {
    const id = await resolveIdentity(headers({ "x-forwarded-user": "a@b.com" }), null, config, now);
    expect(id).toEqual({ username: "a@b.com", mode: "proxy" });
  });

  it("denies when the header is absent", async () => {
    expect(await resolveIdentity(headers({}), null, config, now)).toBeNull();
  });
});

describe("resolveIdentity — proxy mode with shared secret", () => {
  const config = loadAuthConfig({ AUTH_MODE: "proxy", AUTH_PROXY_SHARED_SECRET: "topsecret" });

  it("accepts when the shared secret matches", async () => {
    const id = await resolveIdentity(
      headers({ "x-forwarded-user": "a@b.com", [PROXY_SECRET_HEADER]: "topsecret" }),
      null,
      config,
      now,
    );
    expect(id?.mode).toBe("proxy");
  });

  it("denies when the shared secret is wrong or missing", async () => {
    expect(
      await resolveIdentity(
        headers({ "x-forwarded-user": "a@b.com", [PROXY_SECRET_HEADER]: "guess" }),
        null,
        config,
        now,
      ),
    ).toBeNull();
    expect(
      await resolveIdentity(headers({ "x-forwarded-user": "a@b.com" }), null, config, now),
    ).toBeNull();
  });
});

describe("resolveIdentity — password mode", () => {
  const config = loadAuthConfig({ AUTH_MODE: "password", AUTH_PASSWORD: "p", AUTH_SECRET: "sk" });

  it("accepts a valid session cookie", async () => {
    const token = await cookie("admin", config.secret);
    const id = await resolveIdentity(headers({}), token, config, now);
    expect(id).toEqual({ username: "admin", mode: "password" });
  });

  it("denies an invalid cookie", async () => {
    expect(await resolveIdentity(headers({}), "bogus.token", config, now)).toBeNull();
  });

  it("ignores a proxy header (proxy not enabled)", async () => {
    expect(
      await resolveIdentity(headers({ "x-forwarded-user": "a@b.com" }), null, config, now),
    ).toBeNull();
  });
});

describe("resolveIdentity — both mode (OR / break-glass)", () => {
  const config = loadAuthConfig({ AUTH_MODE: "both", AUTH_PASSWORD: "p", AUTH_SECRET: "sk" });

  it("prefers the proxy identity when present", async () => {
    const token = await cookie("admin", config.secret);
    const id = await resolveIdentity(headers({ "x-forwarded-user": "a@b.com" }), token, config, now);
    expect(id).toEqual({ username: "a@b.com", mode: "proxy" });
  });

  it("falls back to the password session when the proxy header is absent", async () => {
    const token = await cookie("admin", config.secret);
    const id = await resolveIdentity(headers({}), token, config, now);
    expect(id).toEqual({ username: "admin", mode: "password" });
  });

  it("denies when neither is valid", async () => {
    expect(await resolveIdentity(headers({}), null, config, now)).toBeNull();
  });
});
