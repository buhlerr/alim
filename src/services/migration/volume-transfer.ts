import "server-only";
import * as ssh from "./ssh";
import { hostCredentialsService } from "./host-credentials";
import { MigrationError } from "./types";
import type { SshTarget } from "./ssh";
import type { VolumeInfo } from "./types";

/**
 * Transfer abstraction boundary. Each method returns a reference string
 * recorded as a MigrationArtifact.
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

/**
 * Resolves a Coolify server UUID to an SshTarget using the stored host
 * credential. Throws NO_SSH_CREDENTIAL when none is found (user must add
 * credentials at /hosts before running a volume migration).
 */
async function targetFor(serverUuid: string): Promise<SshTarget> {
  const cred = await hostCredentialsService.getByServerUuid(serverUuid);
  if (!cred) {
    throw new MigrationError(
      "No SSH credential for host " + serverUuid + ". Add one at /hosts.",
      "NO_SSH_CREDENTIAL",
    );
  }
  return {
    host: cred.ipAddress,
    port: cred.sshPort,
    username: cred.sshUsername,
    privateKey: cred.privateKey(),
  };
}

/**
 * Real VolumeTransferService that moves Docker volumes over SSH.
 *
 * Archive path convention: /tmp/<volumeName>.tar.gz -- deterministic across
 * all three steps so archive, transfer, and restore stay aligned without
 * passing state between them.
 *
 * Note: transfer() buffers the entire archive through application memory
 * (download then upload). This is fine for moderate volumes; streaming
 * (piped ssh-to-ssh) is a future optimization.
 */
export const realVolumeTransfer: VolumeTransferService = {
  async archive(volume, sourceHost) {
    const t = await targetFor(sourceHost);
    return ssh.archiveVolume(t, volume.name);
  },

  async transfer(volume, sourceHost, destHost) {
    const src = await targetFor(sourceHost);
    const dest = await targetFor(destHost);
    const path = `/tmp/${volume.name}.tar.gz`;
    const data = await ssh.downloadFile(src, path);
    await ssh.uploadFile(dest, data, path);
    return path;
  },

  async restore(volume, destHost) {
    const t = await targetFor(destHost);
    await ssh.restoreVolume(t, `/tmp/${volume.name}.tar.gz`, volume.name);
    return `restored:${volume.name}`;
  },
};

/** The active transfer implementation. Requires a host SSH credential (added
 * at /hosts) and reachable hosts; unit tests cover the wiring with mocked ssh. */
export const volumeTransfer: VolumeTransferService = realVolumeTransfer;
