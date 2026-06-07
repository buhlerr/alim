import { describe, it, expect } from "vitest";
import { PALETTE, PALETTE_KEYS, paletteEntry } from "./environment-palette";

describe("environment palette", () => {
  it("exposes a non-empty set of swatches", () => {
    expect(PALETTE_KEYS.length).toBeGreaterThanOrEqual(8);
  });
  it("every entry has a label and a badgeClass", () => {
    for (const key of PALETTE_KEYS) {
      expect(PALETTE[key].label).toBeTruthy();
      expect(PALETTE[key].badgeClass).toContain("bg-");
    }
  });
  it("paletteEntry falls back to slate for an unknown color", () => {
    expect(paletteEntry("not-a-color")).toBe(PALETTE.slate);
  });
});
