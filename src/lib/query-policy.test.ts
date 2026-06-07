import { describe, it, expect } from "vitest";
import { evaluatePolicy } from "./query-policy";

describe("evaluatePolicy", () => {
  it("allows reads with no confirmation", () => {
    expect(evaluatePolicy({ category: "read", readOnly: true, requireWriteConfirm: true }))
      .toEqual({ allowed: true, requiresConfirmation: false });
  });
  it("blocks writes on a read-only environment", () => {
    const d = evaluatePolicy({ category: "write", readOnly: true, requireWriteConfirm: true });
    expect(d.allowed).toBe(false);
  });
  it("requires confirmation for writes when the flag is set", () => {
    expect(evaluatePolicy({ category: "write", readOnly: false, requireWriteConfirm: true }))
      .toEqual({ allowed: true, requiresConfirmation: true });
  });
  it("allows writes without confirmation when the flag is off", () => {
    expect(evaluatePolicy({ category: "write", readOnly: false, requireWriteConfirm: false }))
      .toEqual({ allowed: true, requiresConfirmation: false });
  });
});
