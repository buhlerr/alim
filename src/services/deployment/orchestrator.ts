import "server-only";
import { postgresProvisioner } from "@/services/provisioning/postgres";
import { registryService } from "@/services/registry";
import { coolifyService } from "@/services/coolify/service";
import { cloudflareService } from "@/services/cloudflare/service";
import { environmentsService } from "@/services/environments";
import { deriveDatabaseName, deriveUsername } from "@/lib/naming";
import { generatePassword } from "@/lib/password";
import type {
  DeploymentPlan,
  DeploymentResult,
  DeploymentStepResult,
} from "./types";

function safeMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "Step failed unexpectedly.";
}

async function runDatabase(
  plan: DeploymentPlan,
): Promise<DeploymentStepResult> {
  const base: DeploymentStepResult = { key: "database", label: "Database", status: "skipped" };
  if (!plan.database) return base;
  try {
    const env = await environmentsService.get(plan.database.environment);
    if (!env) {
      return { ...base, status: "failed", error: "Unknown environment." };
    }
    const databaseName = deriveDatabaseName(plan.applicationName, env.abbreviation);
    const username = deriveUsername(plan.applicationName, env.abbreviation);
    const password = generatePassword();
    const result = await postgresProvisioner.provision({
      environment: plan.database.environment,
      applicationName: plan.applicationName,
      databaseName,
      username,
      password,
    });
    await registryService.record({
      applicationName: plan.applicationName,
      environment: result.environment,
      databaseName: result.databaseName,
      username: result.username,
      host: result.host,
    });
    return {
      ...base,
      status: "success",
      detail: `${result.databaseName} on ${result.environment} (${result.status})`,
      secret: result.connectionString,
    };
  } catch (err) {
    return { ...base, status: "failed", error: safeMessage(err) };
  }
}

async function runCoolify(plan: DeploymentPlan): Promise<DeploymentStepResult> {
  const base: DeploymentStepResult = { key: "coolify", label: "Coolify app", status: "skipped" };
  if (!plan.coolify) return base;
  try {
    const created = await coolifyService.createApplication(plan.coolify);
    await coolifyService.deploy(created.uuid);
    return {
      ...base,
      status: "success",
      detail: `Created and deployed app ${created.uuid}`,
    };
  } catch (err) {
    return { ...base, status: "failed", error: safeMessage(err) };
  }
}

async function runDns(plan: DeploymentPlan): Promise<DeploymentStepResult> {
  const base: DeploymentStepResult = { key: "dns", label: "Cloudflare DNS", status: "skipped" };
  if (!plan.dns) return base;
  try {
    await cloudflareService.dns.create(plan.dns.zoneId, {
      type: plan.dns.type,
      name: plan.dns.name,
      content: plan.dns.content,
      proxied: plan.dns.proxied,
      ttl: 1,
    });
    return { ...base, status: "success", detail: `${plan.dns.type} ${plan.dns.name}` };
  } catch (err) {
    return { ...base, status: "failed", error: safeMessage(err) };
  }
}

/**
 * Run an end-to-end deployment: provision a database, create + deploy a Coolify
 * app, and create a Cloudflare DNS record. Each step is optional and runs in
 * order; a failing step is recorded but does not stop the independently-useful
 * later steps. Returns a per-step report.
 */
export async function runDeployment(plan: DeploymentPlan): Promise<DeploymentResult> {
  const steps: DeploymentStepResult[] = [
    await runDatabase(plan),
    await runCoolify(plan),
    await runDns(plan),
  ];
  const ok = steps.every((s) => s.status !== "failed");
  return { ok, steps };
}
