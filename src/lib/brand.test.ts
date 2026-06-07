import { describe, it, expect } from "vitest";
import { BRAND } from "./brand";

describe("BRAND", () => {
  it("exposes the Aspyre Infrastructure Manager identity", () => {
    expect(BRAND.appName).toBe("Aspyre Infrastructure Manager");
    expect(BRAND.shortName).toBe("Aspyre DevOps");
    expect(BRAND.tagline).toBe("Centralized infrastructure administration");
    expect(BRAND.version).toBe("2.0");
  });
});
