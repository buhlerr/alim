import { describe, it, expect } from "vitest";
import {
  MODULES,
  getModule,
  availableModules,
  navItems,
  type AppModule,
} from "./modules";

describe("MODULES", () => {
  it("has unique ids", () => {
    const ids = MODULES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes the existing core modules as available", () => {
    expect(getModule("database")?.status).toBe("available");
    expect(getModule("query")?.status).toBe("available");
  });

  it("lists Coolify as coming-soon until Part B flips it", () => {
    expect(getModule("coolify")?.status).toBe("coming-soon");
  });

  it("includes the planned platform modules", () => {
    for (const id of ["npm", "cloudflare", "deployment", "secrets", "audit"]) {
      expect(getModule(id)).toBeDefined();
    }
  });

  it("availableModules excludes coming-soon modules", () => {
    expect(availableModules().every((m: AppModule) => m.status === "available")).toBe(true);
  });

  it("navItems flattens nav entries of available modules only", () => {
    const hrefs = navItems().map((n) => n.href);
    expect(hrefs).toContain("/dashboard");
    expect(hrefs).toContain("/query");
    expect(hrefs).not.toContain("/coolify"); // coming-soon in Part A
  });
});
