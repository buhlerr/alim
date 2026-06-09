import { describe, it, expect } from "vitest";
import { buildPlan, stepJobStatus, VOLUME_STEP_KEYS } from "./planner";

describe("buildPlan('migrate')", () => {
  it("always emits the exact 12-step canonical sequence", () => {
    expect(buildPlan("migrate").map((s) => s.key)).toEqual([
      "validate",
      "stop_source",
      "archive_volumes",
      "transfer_volumes",
      "restore_volumes",
      "provision",
      "deploy",
      "validation_url",
      "await_approval",
      "switch_endpoints",
      "delete_source",
      "complete",
    ]);
  });
  it("assigns contiguous order starting at 0", () => {
    expect(buildPlan("migrate").map((s) => s.order)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
  });
});

describe("buildPlan('clone')", () => {
  it("emits the 5-step non-destructive sequence with no approval/cutover/delete", () => {
    expect(buildPlan("clone").map((s) => s.key)).toEqual([
      "validate",
      "provision",
      "deploy",
      "validation_url",
      "complete",
    ]);
  });
});

describe("stepJobStatus", () => {
  it("maps steps to job statuses", () => {
    expect(stepJobStatus("validate")).toBe("validating");
    expect(stepJobStatus("stop_source")).toBe("transferring");
    expect(stepJobStatus("archive_volumes")).toBe("transferring");
    expect(stepJobStatus("provision")).toBe("provisioning");
    expect(stepJobStatus("deploy")).toBe("deploying");
    expect(stepJobStatus("validation_url")).toBe("deploying");
    expect(stepJobStatus("await_approval")).toBe("awaiting_approval");
    expect(stepJobStatus("switch_endpoints")).toBe("cutting_over");
    expect(stepJobStatus("delete_source")).toBe("cutting_over");
    expect(stepJobStatus("complete")).toBe("completed");
  });
});

describe("VOLUME_STEP_KEYS", () => {
  it("lists the three runtime-skippable volume steps", () => {
    expect(VOLUME_STEP_KEYS).toEqual([
      "archive_volumes",
      "transfer_volumes",
      "restore_volumes",
    ]);
  });
});
