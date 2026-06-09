import "server-only";
import type { VolumeInfo } from "./types";

/**
 * Transfer abstraction boundary. The first real implementation will use
 * SSH/rsync/tar; this phase ships a logged no-op mock. Each method returns a
 * reference string recorded as a MigrationArtifact.
 */
export interface VolumeTransferService {
  archive(volume: VolumeInfo, sourceHost: string): Promise<string>;
  transfer(volume: VolumeInfo, sourceHost: string, destHost: string): Promise<string>;
  restore(volume: VolumeInfo, destHost: string): Promise<string>;
}

async function delay(ms = 150): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export const mockVolumeTransfer: VolumeTransferService = {
  async archive(volume, sourceHost) {
    await delay();
    return `/tmp/${volume.name}-${sourceHost}.tar.gz`;
  },
  async transfer(volume, sourceHost, destHost) {
    await delay();
    return `${destHost}:/tmp/${volume.name}-from-${sourceHost}.tar.gz`;
  },
  async restore(volume, destHost) {
    await delay();
    return `${destHost}:volume/${volume.name}`;
  },
};

/** The active transfer implementation for this phase. */
export const volumeTransfer: VolumeTransferService = mockVolumeTransfer;
