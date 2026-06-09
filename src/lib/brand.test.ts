import { describe, it, expect } from "vitest";
import { BRAND } from "./brand";

describe("BRAND", () => {
  it("exposes the Aspyre Labs Infrastructure Manager identity", () => {
    expect(BRAND.appName).toBe("Aspyre Labs Infrastructure Manager");
    expect(BRAND.shortName).toBe("ALIM");
    expect(BRAND.tagline).toBe("Centralized infrastructure administration");
    expect(BRAND.version).toBe("1.0");
  });
});
