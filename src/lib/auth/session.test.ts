import { describe, it, expect } from "vitest";
import { signSession, verifySession } from "./session";

const secret = "test-signing-secret";
const now = 1_700_000_000; // fixed reference time (seconds)

describe("session sign/verify", () => {
  it("round-trips a valid session", async () => {
    const token = await signSession({ sub: "admin", mode: "password" }, secret, 3600, now);
    const payload = await verifySession(token, secret, now + 10);
    expect(payload).toMatchObject({ sub: "admin", mode: "password" });
    expect(payload?.exp).toBe(now + 3600);
  });

  it("rejects an expired session", async () => {
    const token = await signSession({ sub: "admin", mode: "password" }, secret, 60, now);
    expect(await verifySession(token, secret, now + 61)).toBeNull();
  });

  it("rejects a tampered payload", async () => {
    const token = await signSession({ sub: "admin", mode: "password" }, secret, 3600, now);
    const [, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "root", mode: "password", iat: now, exp: now + 3600 }))
      .toString("base64url");
    expect(await verifySession(`${forged}.${sig}`, secret, now)).toBeNull();
  });

  it("rejects a tampered signature", async () => {
    const token = await signSession({ sub: "admin", mode: "password" }, secret, 3600, now);
    const [payload] = token.split(".");
    expect(await verifySession(`${payload}.deadbeef`, secret, now)).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signSession({ sub: "admin", mode: "password" }, secret, 3600, now);
    expect(await verifySession(token, "other-secret", now)).toBeNull();
  });

  it("rejects malformed tokens", async () => {
    expect(await verifySession("", secret, now)).toBeNull();
    expect(await verifySession("noseparator", secret, now)).toBeNull();
    expect(await verifySession("a.b.c", secret, now)).toBeNull();
  });
});
