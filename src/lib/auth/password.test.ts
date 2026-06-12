import { describe, it, expect } from "vitest";
import { verifyPassword } from "./password";

describe("verifyPassword", () => {
  it("accepts the matching password", () => {
    expect(verifyPassword("hunter2", "hunter2")).toBe(true);
  });

  it("rejects a wrong password", () => {
    expect(verifyPassword("nope", "hunter2")).toBe(false);
  });

  it("rejects a length mismatch without throwing", () => {
    expect(verifyPassword("short", "a-much-longer-password")).toBe(false);
  });

  it("rejects an empty submission", () => {
    expect(verifyPassword("", "hunter2")).toBe(false);
  });

  it("rejects everything when no password is configured", () => {
    expect(verifyPassword("anything", null)).toBe(false);
  });
});
