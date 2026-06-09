import "server-only";
import type {
  CreateResourceSpec,
  HostCapacity,
  HostSummary,
  MigrationJobLike,
  ResourceInfo,
  ResourceSummary,
} from "./types";
import { mockCoolifyProvider } from "./mock-coolify";

/**
 * Platform-agnostic orchestration boundary. The engine depends ONLY on this
 * interface. A real CoolifyPlatformProvider will implement it in a later phase
 * with zero caller changes; today the default is the deterministic mock.
 */
export interface PlatformProvider {
  listHosts(): Promise<HostSummary[]>;
  getHostCapacity(hostId: string): Promise<HostCapacity>;
  listResources(): Promise<ResourceSummary[]>;
  inspectResource(id: string): Promise<ResourceInfo>;
  resourceExistsOnHost(hostId: string, name: string): Promise<boolean>;
  createResource(spec: CreateResourceSpec): Promise<{ resourceId: string }>;
  deployResource(id: string): Promise<void>;
  generateValidationUrl(id: string, hostIp: string): Promise<string>;
  stopResource(id: string): Promise<void>;
  startResource(id: string): Promise<void>;
  switchEndpoints(job: MigrationJobLike): Promise<void>;
  deleteResource(id: string): Promise<void>;
}

/** The active provider for this phase. Swap this line to go live. */
export const platformProvider: PlatformProvider = mockCoolifyProvider;
