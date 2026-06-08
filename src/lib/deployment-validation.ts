import { z } from "zod";
import { createApplicationSchema } from "./coolify-validation";
import { dnsRecordSchema } from "./cloudflare-validation";
import { proxyHostSchema } from "./npm-validation";

/**
 * Wizard form schema. Each step is gated by an `*Enabled` toggle; the step's
 * fields are validated only when its toggle is on. The action maps a valid form
 * into a `DeploymentPlan`.
 */
export const deploymentPlanSchema = z
  .object({
    applicationName: z.string().trim().min(1, "Application name is required").max(100),
    databaseEnabled: z.boolean().default(false),
    databaseEnvironment: z.string().optional().default(""),
    coolifyEnabled: z.boolean().default(false),
    coolify: z.unknown().optional(),
    npmEnabled: z.boolean().default(false),
    npm: z.unknown().optional(),
    dnsEnabled: z.boolean().default(false),
    dnsZoneId: z.string().optional().default(""),
    dns: z.unknown().optional(),
  })
  .superRefine((v, ctx) => {
    if (!v.databaseEnabled && !v.coolifyEnabled && !v.npmEnabled && !v.dnsEnabled) {
      ctx.addIssue({
        code: "custom",
        path: ["applicationName"],
        message: "Enable at least one step to deploy",
      });
    }
    if (v.databaseEnabled && !v.databaseEnvironment?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["databaseEnvironment"],
        message: "Choose an environment",
      });
    }
    if (v.coolifyEnabled && !createApplicationSchema.safeParse(v.coolify).success) {
      ctx.addIssue({
        code: "custom",
        path: ["coolify"],
        message: "Complete the Coolify application fields",
      });
    }
    if (v.npmEnabled && !proxyHostSchema.safeParse(v.npm).success) {
      ctx.addIssue({
        code: "custom",
        path: ["npm"],
        message: "Complete the proxy host fields",
      });
    }
    if (v.dnsEnabled) {
      if (!v.dnsZoneId?.trim()) {
        ctx.addIssue({ code: "custom", path: ["dnsZoneId"], message: "Choose a zone" });
      }
      if (!dnsRecordSchema.safeParse(v.dns).success) {
        ctx.addIssue({ code: "custom", path: ["dns"], message: "Complete the DNS record fields" });
      }
    }
  });
export type DeploymentPlanInput = z.infer<typeof deploymentPlanSchema>;
