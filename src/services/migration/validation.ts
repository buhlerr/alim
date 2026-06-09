import "server-only";
import { classifyExposure, defaultFlags, type Exposure, type ExposureDefaults } from "@/lib/migration";
import { platformProvider } from "./provider";
import type { ResourceInfo, VolumeInfo } from "./types";

export interface ValidateInput {
  sourceResourceId: string;
  destinationHost: string;
  destinationResourceName: string;
}

export interface CheckResult {
  key: "host_exists" | "host_reachable" | "disk" | "memory" | "duplicate_name";
  label: string;
  pass: boolean;
  detail: string;
}

export interface ValidationReport {
  ok: boolean;
  checks: CheckResult[];
  volumes: VolumeInfo[];
  exposure: Exposure;
  defaults: ExposureDefaults;
  source: ResourceInfo;
}

// Headroom required on the destination beyond the volume payload.
const BASE_DISK_MB = 1024;
const BASE_MEMORY_MB = 512;

export const validationService = {
  async validate(input: ValidateInput): Promise<ValidationReport> {
    const source = await platformProvider.inspectResource(input.sourceResourceId);
    const volumes = source.volumes;
    const exposure = classifyExposure(source.domains);

    const hosts = await platformProvider.listHosts();
    const host = hosts.find((h) => h.id === input.destinationHost);

    const checks: CheckResult[] = [];

    const hostExists = Boolean(host);
    checks.push({
      key: "host_exists",
      label: "Destination host exists",
      pass: hostExists,
      detail: hostExists ? `Found ${host!.name}.` : "Destination host is not registered.",
    });

    let capacity = { reachable: false, freeMemoryMb: 0, freeDiskMb: 0 };
    if (hostExists) {
      const cap = await platformProvider.getHostCapacity(input.destinationHost);
      capacity = cap;
    }

    checks.push({
      key: "host_reachable",
      label: "Destination host is reachable",
      pass: hostExists && capacity.reachable,
      detail: capacity.reachable ? "Reachable." : "Host could not be reached.",
    });

    const requiredDisk = volumes.reduce((sum, v) => sum + v.estimatedSizeMb, 0) + BASE_DISK_MB;
    checks.push({
      key: "disk",
      label: "Sufficient free disk",
      pass: hostExists && capacity.freeDiskMb >= requiredDisk,
      detail: `Needs ~${requiredDisk} MB; host has ${capacity.freeDiskMb} MB free.`,
    });

    checks.push({
      key: "memory",
      label: "Sufficient free memory",
      pass: hostExists && capacity.freeMemoryMb >= BASE_MEMORY_MB,
      detail: `Needs ~${BASE_MEMORY_MB} MB; host has ${capacity.freeMemoryMb} MB free.`,
    });

    const duplicate = hostExists
      ? await platformProvider.resourceExistsOnHost(input.destinationHost, input.destinationResourceName)
      : false;
    checks.push({
      key: "duplicate_name",
      label: "No duplicate resource name",
      pass: !duplicate,
      detail: duplicate
        ? `A resource named "${input.destinationResourceName}" already exists on the destination. Rename it.`
        : "Name is available.",
    });

    return {
      ok: checks.every((c) => c.pass),
      checks,
      volumes,
      exposure,
      defaults: defaultFlags(exposure),
      source,
    };
  },
};
