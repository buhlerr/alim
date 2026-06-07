import { describe, it, expect } from "vitest";
import { postgresConnectionSchema } from "./validation";

describe("postgresConnectionSchema", () => {
  it("accepts a postgresql:// URL", () => {
    expect(
      postgresConnectionSchema.safeParse(
        "postgresql://admin:pw@db:5432/postgres",
      ).success,
    ).toBe(true);
  });

  it("accepts a postgres:// URL", () => {
    expect(
      postgresConnectionSchema.safeParse("postgres://admin:pw@db:5432/postgres")
        .success,
    ).toBe(true);
  });

  it("rejects a blank string", () => {
    expect(postgresConnectionSchema.safeParse("").success).toBe(false);
  });

  it("rejects a non-postgres scheme", () => {
    expect(
      postgresConnectionSchema.safeParse("https://example.com").success,
    ).toBe(false);
  });

  it("rejects a non-URL string", () => {
    expect(postgresConnectionSchema.safeParse("not a url").success).toBe(false);
  });
});
