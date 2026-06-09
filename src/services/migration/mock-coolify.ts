import { randomBytes } from "node:crypto";
import type { PlatformProvider } from "./provider";
import type { HostSummary, ResourceInfo, ResourceSummary, SwitchEndpointsInput } from "./types";

/**
 * Deterministic-shape mock of a Coolify control plane. Returns realistic data
 * with small simulated delays. Deliberately includes a volumeless resource and
 * a volume-bearing resource so both the skip path and the volume path exercise.
 */

const HOSTS: HostSummary[] = [
  { id: "server-2", name: "Server 2", ip: "192.168.100.10" },
  { id: "server-3", name: "Server 3", ip: "192.168.100.11" },
];

const RESOURCES: ResourceInfo[] = [
  {
    id: "app-nextjs",
    name: "marketing-site",
    environment: "PRODUCTION",
    hostId: "server-2",
    hostName: "Server 2",
    domains: ["layerr.aspyrelabs.com"],
    type: "application",
    envVars: [{ key: "NODE_ENV", value: "production" }],
    buildConfig: { buildPack: "nixpacks", port: "3000" },
    volumes: [],
  },
  {
    id: "app-n8n",
    name: "n8n",
    environment: "PRODUCTION",
    hostId: "server-2",
    hostName: "Server 2",
    domains: ["n8n.10.0.0.5.sslip.io"],
    type: "compose",
    envVars: [{ key: "N8N_HOST", value: "n8n.local" }],
    buildConfig: { composeFile: "docker-compose.yml" },
    volumes: [
      { name: "n8n_data", estimatedSizeMb: 512 },
      { name: "n8n_files", estimatedSizeMb: 128 },
    ],
  },
];

async function delay(ms = 120): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function token(): string {
  return randomBytes(4).toString("hex");
}

export const mockCoolifyProvider: PlatformProvider = {
  async listHosts() {
    await delay();
    return HOSTS.map((h) => ({ ...h }));
  },

  async getHostCapacity(hostId) {
    await delay();
    const known = HOSTS.some((h) => h.id === hostId);
    return {
      hostId,
      reachable: known,
      freeMemoryMb: known ? 8192 : 0,
      freeDiskMb: known ? 102400 : 0,
    };
  },

  async listResources() {
    await delay();
    return RESOURCES.map<ResourceSummary>((r) => ({
      id: r.id,
      name: r.name,
      environment: r.environment,
      hostId: r.hostId,
      hostName: r.hostName,
      domains: [...r.domains],
    }));
  },

  async inspectResource(id) {
    await delay();
    const found = RESOURCES.find((r) => r.id === id);
    if (!found) {
      return {
        id,
        name: id,
        environment: "PRODUCTION",
        hostId: "server-2",
        hostName: "Server 2",
        domains: [],
        type: "application",
        envVars: [],
        buildConfig: {},
        volumes: [],
      };
    }
    return JSON.parse(JSON.stringify(found)) as ResourceInfo;
  },

  async resourceExistsOnHost(_hostId, name) {
    await delay();
    return name === "duplicate-name";
  },

  async createResource(spec) {
    await delay(200);
    return { resourceId: `dest-${spec.name}-${token()}` };
  },

  async deployResource() {
    await delay(200);
  },

  async generateValidationUrl(_id, hostIp) {
    await delay();
    return `https://${token()}.${hostIp}.sslip.io`;
  },

  async stopResource() {
    await delay();
  },

  async startResource() {
    await delay();
  },

  async switchEndpoints(_input: SwitchEndpointsInput): Promise<void> {
    await delay();
  },

  async deleteResource() {
    await delay();
  },
};
