import { describe, it, expect } from "vitest";
import { createMigrationSchema } from "./migration-validation";

const VALID = {
  migrationType: "migrate",
  sourceResourceId: "app-n8n",
  destinationHost: "server-3",
  destinationResourceName: "n8n-copy",
};

describe("createMigrationSchema", () => {
  it("accepts a well-formed migrate input", () => {
    expect(createMigrationSchema.safeParse(VALID).success).toBe(true);
  });
  it("accepts clone as a migration type", () => {
    expect(createMigrationSchema.safeParse({ ...VALID, migrationType: "clone" }).success).toBe(true);
  });
  it("rejects an unknown migration type", () => {
    expect(createMigrationSchema.safeParse({ ...VALID, migrationType: "copy" }).success).toBe(false);
  });
  it("rejects a missing resource", () => {
    expect(createMigrationSchema.safeParse({ ...VALID, sourceResourceId: "" }).success).toBe(false);
  });
  it("rejects an invalid destination name", () => {
    expect(createMigrationSchema.safeParse({ ...VALID, destinationResourceName: "bad name!" }).success).toBe(false);
  });
});
