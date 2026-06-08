"use server";

import { revalidatePath } from "next/cache";

import { deploymentPlanSchema } from "@/lib/deployment-validation";
import { createApplicationSchema } from "@/lib/coolify-validation";
import { dnsRecordSchema } from "@/lib/cloudflare-validation";
import { runDeployment } from "@/services/deployment/orchestrator";
import type { DeploymentPlan, DeploymentResult } from "@/services/deployment/types";
import { environmentsService } from "@/services/environments";
import { toSummary, type EnvironmentSummary } from "@/lib/environments";
import { isCoolifyConfigured } from "@/lib/coolify-config";
import { isCloudflareConfigured } from "@/lib/cloudflare-config";
import { coolifyService } from "@/services/coolify/service";
import { cloudflareService } from "@/services/cloudflare/service";
import type { CoolifyProject, CoolifyServer } from "@/services/coolify/types";
import type { CfZone } from "@/services/cloudflare/types";
import { auditService } from "@/services/audit";
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from "@/lib/audit";

export interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  data?: T;
}

export interface DeploymentOptions {
  environments: EnvironmentSummary[];
  coolify: { configured: boolean; projects: CoolifyProject[]; servers: CoolifyServer[] };
  cloudflare: { configured: boolean; zones: CfZone[] };
}

/** Everything the wizard form needs to render its gated sections. */
export async function getDeploymentOptionsAction(): Promise<DeploymentOptions> {
  const environments = (await environmentsService.list()).map(toSummary);

  const coolifyConfigured = await isCoolifyConfigured();
  let projects: CoolifyProject[] = [];
  let servers: CoolifyServer[] = [];
  if (coolifyConfigured) {
    try {
      [projects, servers] = await Promise.all([
        coolifyService.listProjects(),
        coolifyService.listServers(),
      ]);
    } catch {
      // Leave empty; the section still renders but with no options.
    }
  }

  const cloudflareConfigured = await isCloudflareConfigured();
  let zones: CfZone[] = [];
  if (cloudflareConfigured) {
    try {
      zones = await cloudflareService.zones.list();
    } catch {
      // Leave empty.
    }
  }

  return {
    environments,
    coolify: { configured: coolifyConfigured, projects, servers },
    cloudflare: { configured: cloudflareConfigured, zones },
  };
}

export async function runDeploymentAction(
  input: unknown,
): Promise<ActionResult<DeploymentResult>> {
  const parsed = deploymentPlanSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const v = parsed.data;

  let coolify: DeploymentPlan["coolify"] = null;
  if (v.coolifyEnabled) {
    const c = createApplicationSchema.parse(v.coolify);
    coolify = {
      project_uuid: c.project_uuid,
      server_uuid: c.server_uuid,
      environment_name: c.environment_name,
      git_repository: c.git_repository,
      git_branch: c.git_branch,
      build_pack: c.build_pack,
      ports_exposes: c.ports_exposes,
      name: c.name || undefined,
      domains: c.domains || undefined,
    };
  }

  let dns: DeploymentPlan["dns"] = null;
  if (v.dnsEnabled) {
    const d = dnsRecordSchema.parse(v.dns);
    dns = {
      zoneId: v.dnsZoneId,
      type: d.type,
      name: d.name,
      content: d.content,
      proxied: d.proxied,
    };
  }

  const plan: DeploymentPlan = {
    applicationName: v.applicationName,
    database: v.databaseEnabled ? { environment: v.databaseEnvironment } : null,
    coolify,
    dns,
  };

  const result = await runDeployment(plan);

  const okCount = result.steps.filter((s) => s.status === "success").length;
  const ranCount = result.steps.filter((s) => s.status !== "skipped").length;
  await auditService.record({
    action: AUDIT_ACTIONS.DEPLOYMENT_RUN,
    summary: `Deployed ${v.applicationName}: ${okCount}/${ranCount} steps succeeded`,
    targetType: AUDIT_TARGET_TYPES.DEPLOYMENT,
    targetId: v.applicationName,
    success: result.ok,
    metadata: {
      steps: result.steps.map((s) => ({ key: s.key, status: s.status })),
    },
  });

  revalidatePath("/registry");
  revalidatePath("/dashboard");
  return { ok: true, data: result };
}
