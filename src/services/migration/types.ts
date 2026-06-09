import type { Exposure } from "@/lib/migration";

/** Typed, credential-free error carrying a stable code (mirrors CoolifyError). */
export class MigrationError extends Error {
  constructor(
    message: string,
    public readonly code: string = "MIGRATION_ERROR",
  ) {
    super(message);
    this.name = "MigrationError";
  }
}

export interface HostSummary {
  id: string;
  name: string;
  ip: string;
}

export interface HostCapacity {
  hostId: string;
  reachable: boolean;
  freeMemoryMb: number;
  freeDiskMb: number;
  /** False when metrics are not measured (e.g. API-only, no SSH). */
  metricsAvailable?: boolean;
}

export interface VolumeInfo {
  name: string;
  estimatedSizeMb: number;
}

export interface ResourceSummary {
  id: string;
  name: string;
  environment: string;
  hostId: string;
  hostName: string;
  domains: string[];
}

/** Full inspected resource; this is what gets frozen into the job snapshot. */
export interface ResourceInfo extends ResourceSummary {
  type: string; // "application" | "compose"
  envVars: Array<{ key: string; value: string }>;
  buildConfig: Record<string, unknown>;
  volumes: VolumeInfo[];
}

export interface CreateResourceSpec {
  name: string;
  destinationHostId: string;
  snapshot: ResourceInfo;
}

export interface MigrationJobLike {
  id: string;
  sourceResourceId: string;
  destinationResourceName: string;
  destinationHost: string;
  npmEnabled: boolean;
  cloudflareEnabled: boolean;
  exposure: Exposure | string;
}

export interface SwitchEndpointsInput {
  sourceResourceId: string;
  destinationResourceId: string;
  /** Custom (non-sslip) domains to move from source to destination. */
  domains: string[];
}
