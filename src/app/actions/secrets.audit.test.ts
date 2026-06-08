import { describe, it, expect, vi, beforeEach } from "vitest";

// Server actions call revalidatePath, which needs a request context — stub it.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/services/secrets", () => ({
  secretsService: {
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    reveal: vi.fn(),
  },
}));

vi.mock("@/services/audit", () => ({
  auditService: { record: vi.fn() },
}));

import { secretsService } from "@/services/secrets";
import { auditService } from "@/services/audit";
import { createSecretAction, revealSecretAction } from "./secrets";

const reveal = secretsService.reveal as unknown as ReturnType<typeof vi.fn>;
const record = auditService.record as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("secrets actions audit instrumentation", () => {
  it("records secret.create on a successful create", async () => {
    const res = await createSecretAction({
      name: "Stripe",
      value: "sk_live_1",
      category: "API Token",
    });
    expect(res.ok).toBe(true);
    expect(record).toHaveBeenCalledTimes(1);
    const event = record.mock.calls[0][0];
    expect(event.action).toBe("secret.create");
    expect(event.targetType).toBe("secret");
    expect(event.summary).toContain("Stripe");
  });

  it("does not record when validation fails", async () => {
    const res = await createSecretAction({ name: "", value: "", category: "" });
    expect(res.ok).toBe(false);
    expect(record).not.toHaveBeenCalled();
  });

  it("records secret.reveal when a value is returned", async () => {
    reveal.mockResolvedValue("plaintext");
    const res = await revealSecretAction("id1");
    expect(res.ok).toBe(true);
    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0][0].action).toBe("secret.reveal");
  });

  it("does not record a reveal that returns nothing", async () => {
    reveal.mockResolvedValue(null);
    const res = await revealSecretAction("missing");
    expect(res.ok).toBe(false);
    expect(record).not.toHaveBeenCalled();
  });
});
