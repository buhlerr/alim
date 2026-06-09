import "server-only";
import { Client } from "ssh2";
import type { ConnectConfig } from "ssh2";
import { MigrationError } from "./types";

export interface SshTarget {
  host: string;
  port: number;
  username: string;
  privateKey: string;
}

// Keep the connection establishment short so an unreachable host fails fast
// (capacity probes and volume ops must not hang for ~30s on a dead host).
const CONNECT_TIMEOUT_MS = 10_000;

/** Only paths of the form /tmp/<safe-name>.tar.gz are accepted. */
const ARCHIVE_PATH_RE = /^\/tmp\/[A-Za-z0-9_.-]+\.tar\.gz$/;

/** Volume names: start with alphanumeric, rest may include _ . - */
const VOLUME_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

/** Docker root paths: only safe filesystem characters. */
const DOCKER_ROOT_RE = /^[A-Za-z0-9/_.-]+$/;

function validateVolumeName(name: string): void {
  if (!VOLUME_NAME_RE.test(name)) {
    throw new MigrationError(
      `Invalid volume name: ${JSON.stringify(name)}`,
      "BAD_INPUT",
    );
  }
}

function validateArchivePath(path: string): void {
  if (!ARCHIVE_PATH_RE.test(path)) {
    throw new MigrationError(
      `Invalid archive path: ${JSON.stringify(path)}`,
      "BAD_INPUT",
    );
  }
}

function validateDockerRoot(dockerRoot: string): void {
  if (!DOCKER_ROOT_RE.test(dockerRoot)) {
    throw new MigrationError(
      `Invalid dockerRoot: ${JSON.stringify(dockerRoot)}`,
      "BAD_INPUT",
    );
  }
}

function buildConnectConfig(target: SshTarget): ConnectConfig {
  return {
    host: target.host,
    port: target.port,
    username: target.username,
    privateKey: target.privateKey,
    readyTimeout: CONNECT_TIMEOUT_MS,
  };
}

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** PRIVATE: runs a single command over SSH. Not exported. */
function runCommand(target: SshTarget, command: string): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const client = new Client();

    client.on("ready", () => {
      client.exec(command, (err, stream) => {
        if (err) {
          client.end();
          reject(new MigrationError(`SSH exec error: ${err.message}`, "SSH_ERROR"));
          return;
        }

        let stdout = "";
        let stderr = "";

        stream.on("data", (chunk: Buffer) => {
          stdout += chunk.toString();
        });

        stream.stderr.on("data", (chunk: Buffer) => {
          stderr += chunk.toString();
        });

        stream.on("close", (code: number) => {
          client.end();
          resolve({ code, stdout, stderr });
        });
      });
    });

    client.on("error", (err) => {
      reject(new MigrationError(`SSH connection error: ${err.message}`, "SSH_ERROR"));
    });

    client.connect(buildConnectConfig(target));
  });
}

function throwOnNonZero(result: CommandResult, label: string): void {
  if (result.code !== 0) {
    const tail = result.stderr.slice(-500);
    throw new MigrationError(
      `${label} failed (exit ${result.code}): ${tail}`,
      "SSH_EXEC_FAILED",
    );
  }
}

/**
 * Parses `free -b` stdout.
 * Relevant line format: "Mem:  <total>  <used>  <free>  <shared>  <buff/cache>  <available>"
 */
function parseFreeBytes(output: string): number {
  for (const line of output.split("\n")) {
    if (line.startsWith("Mem:")) {
      const cols = line.trim().split(/\s+/);
      // Column 6 (index 6) is "available"; fall back to column 3 (free) if missing.
      const raw = cols[6] ?? cols[3];
      if (raw) return parseInt(raw, 10);
    }
  }
  throw new MigrationError("Could not parse free -b output", "PARSE_ERROR");
}

/**
 * Parses `df -B1 <path>` stdout.
 * Relevant line: "<filesystem>  <size>  <used>  <available>  <use%>  <mountpoint>"
 */
function parseDfAvailableBytes(output: string): number {
  const lines = output.trim().split("\n");
  // Skip header line; use the last data line (handles wrapped lines).
  const dataLine = lines[lines.length - 1];
  if (!dataLine) throw new MigrationError("Could not parse df output", "PARSE_ERROR");
  const cols = dataLine.trim().split(/\s+/);
  // Available is column index 3.
  const raw = cols[3];
  if (!raw) throw new MigrationError("Could not parse df available column", "PARSE_ERROR");
  return parseInt(raw, 10);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns free memory and free disk (in MB) for the given host.
 * dockerRoot must match /^[A-Za-z0-9/_.-]+$/.
 */
export async function readCapacity(
  target: SshTarget,
  dockerRoot = "/var/lib/docker",
): Promise<{ freeMemoryMb: number; freeDiskMb: number }> {
  validateDockerRoot(dockerRoot);

  const [memResult, dfResult] = await Promise.all([
    runCommand(target, "free -b"),
    runCommand(target, `df -B1 ${dockerRoot}`),
  ]);

  throwOnNonZero(memResult, "free -b");
  throwOnNonZero(dfResult, `df -B1 ${dockerRoot}`);

  const freeMemoryMb = Math.floor(parseFreeBytes(memResult.stdout) / (1024 * 1024));
  const freeDiskMb = Math.floor(parseDfAvailableBytes(dfResult.stdout) / (1024 * 1024));

  return { freeMemoryMb, freeDiskMb };
}

/**
 * Creates a tar.gz archive of a Docker volume on the remote host.
 * Returns the archive path on the remote host.
 */
export async function archiveVolume(
  target: SshTarget,
  volumeName: string,
): Promise<string> {
  validateVolumeName(volumeName);

  const archiveName = `${volumeName}.tar.gz`;
  const command =
    `docker run --rm -v ${volumeName}:/from:ro -v /tmp:/to alpine sh -c ` +
    `"tar czf /to/${archiveName} -C /from ."`;

  const result = await runCommand(target, command);
  throwOnNonZero(result, `archiveVolume(${volumeName})`);

  return `/tmp/${archiveName}`;
}

/**
 * Restores a Docker volume from an archive on the remote host.
 * archivePath must be /tmp/<name>.tar.gz; volumeName must pass the volume regex.
 */
export async function restoreVolume(
  target: SshTarget,
  archivePath: string,
  volumeName: string,
): Promise<void> {
  validateVolumeName(volumeName);
  validateArchivePath(archivePath);

  const archiveName = archivePath.split("/").pop()!;
  const archiveDir = "/tmp";

  const createResult = await runCommand(target, `docker volume create ${volumeName}`);
  throwOnNonZero(createResult, `docker volume create ${volumeName}`);

  const extractCommand =
    `docker run --rm -v ${volumeName}:/to -v ${archiveDir}:/from alpine sh -c ` +
    `"tar xzf /from/${archiveName} -C /to"`;

  const extractResult = await runCommand(target, extractCommand);
  throwOnNonZero(extractResult, `restoreVolume extract(${volumeName})`);
}

/**
 * Downloads a file from the remote host via SFTP.
 * remotePath must be /tmp/<name>.tar.gz.
 */
export function downloadFile(target: SshTarget, remotePath: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      validateArchivePath(remotePath);
    } catch (e) {
      reject(e);
      return;
    }
    const client = new Client();

    client.on("ready", () => {
      client.sftp((err, sftp) => {
        if (err) {
          client.end();
          reject(new MigrationError(`SFTP session error: ${err.message}`, "SSH_ERROR"));
          return;
        }

        sftp.readFile(remotePath, (readErr, data) => {
          client.end();
          if (readErr) {
            reject(new MigrationError(`SFTP readFile error: ${readErr.message}`, "SSH_ERROR"));
          } else {
            resolve(data);
          }
        });
      });
    });

    client.on("error", (err) => {
      reject(new MigrationError(`SSH connection error: ${err.message}`, "SSH_ERROR"));
    });

    client.connect(buildConnectConfig(target));
  });
}

/**
 * Uploads a file to the remote host via SFTP.
 * remotePath must be /tmp/<name>.tar.gz.
 */
export function uploadFile(
  target: SshTarget,
  data: Buffer,
  remotePath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      validateArchivePath(remotePath);
    } catch (e) {
      reject(e);
      return;
    }
    const client = new Client();

    client.on("ready", () => {
      client.sftp((err, sftp) => {
        if (err) {
          client.end();
          reject(new MigrationError(`SFTP session error: ${err.message}`, "SSH_ERROR"));
          return;
        }

        sftp.writeFile(remotePath, data, (writeErr) => {
          client.end();
          if (writeErr) {
            reject(new MigrationError(`SFTP writeFile error: ${writeErr.message}`, "SSH_ERROR"));
          } else {
            resolve();
          }
        });
      });
    });

    client.on("error", (err) => {
      reject(new MigrationError(`SSH connection error: ${err.message}`, "SSH_ERROR"));
    });

    client.connect(buildConnectConfig(target));
  });
}
