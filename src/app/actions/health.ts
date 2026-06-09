"use server";

import { getIntegrationsHealth } from "@/services/health";
import type { IntegrationsHealth } from "@/services/health";

export async function getIntegrationsHealthAction(): Promise<IntegrationsHealth> {
  return getIntegrationsHealth();
}
