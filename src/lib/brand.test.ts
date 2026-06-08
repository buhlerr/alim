import { describe, it, expect } from "vitest";
import { BRAND } from "./brand";

describe("BRAND", () => {
  it("exposes the AspyreLabs DevOps Manager identity", () => {
    expect(BRAND.appName).toBe("AspyreLabs DevOps Manager");
    expect(BRAND.shortName).toBe("Aspyre DevOps");
    expect(BRAND.tagline).toBe("Centralized infrastructure administration");
    expect(BRAND.version).toBe("1.0");
  });
});
