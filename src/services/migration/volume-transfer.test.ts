import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./ssh", () => ({
  archiveVolume: vi.fn(),
  downloadFile: vi.fn(),
  uploadFile: vi.fn(),
  restoreVolume: vi.fn(),
}));

vi.mock("./host-credentials", () => ({
  hostCredentialsService: {
    getByServerUuid: vi.fn(),
  },
}));

import * as sshMod from "./ssh";
import { hostCredentialsService } from "./host-credentials";
import { realVolumeTransfer } from "./volume-transfer";
import { MigrationError } from "./types";

const sshFns = sshMod as unknown as Record<string, ReturnType<typeof vi.fn>>;
const credsSvc = hostCredentialsService as unknown as Record<string, ReturnType<typeof vi.fn>>;

/** Returns a minimal credential object with a privateKey() accessor. */
function makeCred(overrides: Partial<{
  ipAddress: string;
  sshPort: number;
  sshUsername: string;
  key: string;
}> = {}) {
  const ip = overrides.ipAddress ?? "10.0.0.1";
  const port = overrides.sshPort ?? 22;
  const user = overrides.sshUsername ?? "root";
  const key = overrides.key ?? "FAKE_KEY";
  return {
    ipAddress: ip,
    sshPort: port,
    sshUsername: user,
    privateKey: () => key,
  };
}

const VOLUME = { name: "pg_data", estimatedSizeMb: 256 };
const ARCHIVE_PATH = "/tmp/pg_data.tar.gz";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("realVolumeTransfer.archive", () => {
  it("resolves the source credential and calls archiveVolume with the volume name", async () => {
    const cred = makeCred();
    credsSvc.getByServerUuid.mockResolvedValue(cred);
    sshFns.archiveVolume.mockResolvedValue(ARCHIVE_PATH);

    const result = await realVolumeTransfer.archive(VOLUME, "server-uuid-1");

    expect(credsSvc.getByServerUuid).toHaveBeenCalledWith("server-uuid-1");
    expect(sshFns.archiveVolume).toHaveBeenCalledWith(
      { host: "10.0.0.1", port: 22, username: "root", privateKey: "FAKE_KEY" },
      "pg_data",
    );
    expect(result).toBe(ARCHIVE_PATH);
  });

  it("throws NO_SSH_CREDENTIAL and does not call ssh when credential is missing", async () => {
    credsSvc.getByServerUuid.mockResolvedValue(null);

    await expect(realVolumeTransfer.archive(VOLUME, "server-uuid-1")).rejects.toMatchObject({
      code: "NO_SSH_CREDENTIAL",
    });
    expect(sshFns.archiveVolume).not.toHaveBeenCalled();
  });

  it("propagates the error message containing the server UUID", async () => {
    credsSvc.getByServerUuid.mockResolvedValue(null);

    await expect(realVolumeTransfer.archive(VOLUME, "server-uuid-abc")).rejects.toThrow(
      "server-uuid-abc",
    );
  });
});

describe("realVolumeTransfer.transfer", () => {
  it("downloads from source and uploads to dest at the deterministic path", async () => {
    const srcCred = makeCred({ ipAddress: "10.0.0.1" });
    const destCred = makeCred({ ipAddress: "10.0.0.2", key: "DEST_KEY" });
    credsSvc.getByServerUuid
      .mockResolvedValueOnce(srcCred)
      .mockResolvedValueOnce(destCred);

    const buf = Buffer.from("fake-archive-data");
    sshFns.downloadFile.mockResolvedValue(buf);
    sshFns.uploadFile.mockResolvedValue(undefined);

    const result = await realVolumeTransfer.transfer(VOLUME, "src-uuid", "dest-uuid");

    expect(credsSvc.getByServerUuid).toHaveBeenNthCalledWith(1, "src-uuid");
    expect(credsSvc.getByServerUuid).toHaveBeenNthCalledWith(2, "dest-uuid");
    expect(sshFns.downloadFile).toHaveBeenCalledWith(
      { host: "10.0.0.1", port: 22, username: "root", privateKey: "FAKE_KEY" },
      ARCHIVE_PATH,
    );
    expect(sshFns.uploadFile).toHaveBeenCalledWith(
      { host: "10.0.0.2", port: 22, username: "root", privateKey: "DEST_KEY" },
      buf,
      ARCHIVE_PATH,
    );
    expect(result).toBe(ARCHIVE_PATH);
  });

  it("throws NO_SSH_CREDENTIAL when source credential is missing", async () => {
    credsSvc.getByServerUuid.mockResolvedValue(null);

    await expect(realVolumeTransfer.transfer(VOLUME, "src-uuid", "dest-uuid")).rejects.toMatchObject({
      code: "NO_SSH_CREDENTIAL",
    });
    expect(sshFns.downloadFile).not.toHaveBeenCalled();
    expect(sshFns.uploadFile).not.toHaveBeenCalled();
  });

  it("throws NO_SSH_CREDENTIAL when dest credential is missing", async () => {
    credsSvc.getByServerUuid
      .mockResolvedValueOnce(makeCred())
      .mockResolvedValueOnce(null);

    await expect(realVolumeTransfer.transfer(VOLUME, "src-uuid", "dest-uuid")).rejects.toMatchObject({
      code: "NO_SSH_CREDENTIAL",
    });
    expect(sshFns.downloadFile).not.toHaveBeenCalled();
  });
});

describe("realVolumeTransfer.restore", () => {
  it("resolves the dest credential and calls restoreVolume with the deterministic path", async () => {
    const cred = makeCred();
    credsSvc.getByServerUuid.mockResolvedValue(cred);
    sshFns.restoreVolume.mockResolvedValue(undefined);

    const result = await realVolumeTransfer.restore(VOLUME, "dest-uuid");

    expect(credsSvc.getByServerUuid).toHaveBeenCalledWith("dest-uuid");
    expect(sshFns.restoreVolume).toHaveBeenCalledWith(
      { host: "10.0.0.1", port: 22, username: "root", privateKey: "FAKE_KEY" },
      ARCHIVE_PATH,
      "pg_data",
    );
    expect(result).toBe("restored:pg_data");
  });

  it("throws NO_SSH_CREDENTIAL and does not call ssh when credential is missing", async () => {
    credsSvc.getByServerUuid.mockResolvedValue(null);

    await expect(realVolumeTransfer.restore(VOLUME, "dest-uuid")).rejects.toMatchObject({
      code: "NO_SSH_CREDENTIAL",
    });
    expect(sshFns.restoreVolume).not.toHaveBeenCalled();
  });
});

describe("MigrationError code", () => {
  it("is a MigrationError instance", async () => {
    credsSvc.getByServerUuid.mockResolvedValue(null);
    let caught: unknown;
    try {
      await realVolumeTransfer.archive(VOLUME, "x");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(MigrationError);
  });
});
