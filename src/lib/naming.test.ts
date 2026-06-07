import { describe, it, expect } from "vitest";
import { deriveDatabaseName, deriveUsername } from "./naming";

describe("naming", () => {
  it("omits the suffix when abbreviation is empty (production)", () => {
    expect(deriveDatabaseName("Orders API", "")).toBe("orders_api");
    expect(deriveUsername("Orders API", "")).toBe("orders_api_user");
  });
  it("appends the abbreviation as a suffix", () => {
    expect(deriveDatabaseName("Orders API", "staging")).toBe("orders_api_staging");
    expect(deriveUsername("Orders API", "dev")).toBe("orders_api_dev_user");
  });
});
