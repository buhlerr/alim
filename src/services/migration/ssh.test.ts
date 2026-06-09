import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Shared state for configuring the mock Client between tests.
// Declared here (in module scope) so vi.hoisted can close over it.
// ---------------------------------------------------------------------------
type ExecCb = (err: Error | null, channel: unknown) => void;
type SftpCb = (err: Error | null, sftp: unknown) => void;

interface TestState {
  execChannels: unknown[];
  execError: Error | null;
  sftpWrapper: unknown;
  sftpError: Error | null;
  connectError: Error | null;
  /** Global channel index shared across all Client instances in a test. */
  execIdx: number;
}

// Mutable shared state; tests write to this before calling the module under test.
const state: TestState = {
  execChannels: [],
  execError: null,
  sftpWrapper: null,
  sftpError: null,
  connectError: null,
  execIdx: 0,
};

// ---------------------------------------------------------------------------
// Hoist the mock class.  vi.hoisted factories run before any imports, so
// they MUST be self-contained (no imported symbols).  We use require() for
// EventEmitter inside the factory body.
// ---------------------------------------------------------------------------
const { MockClient } = vi.hoisted(() => {
  const { EventEmitter } = require("node:events") as typeof import("node:events");

  class MockClient extends EventEmitter {
    connect(_cfg: unknown): this {
      // Fire synchronously so tests don't need to tick the microtask queue.
      if (state.connectError) {
        this.emit("error", state.connectError);
      } else {
        this.emit("ready");
      }
      return this;
    }

    exec(command: string, ...rest: unknown[]): this {
      const cb = rest[rest.length - 1] as ExecCb;
      if (state.execError) {
        cb(state.execError, null);
        return this;
      }
      // Use a global index so parallel Client instances each get distinct channels.
      const idx = state.execIdx++;
      const ch = state.execChannels[idx] as (Record<string, unknown> | null);
      if (!ch) {
        cb(new Error(`no channel configured for exec call #${idx}`), null);
        return this;
      }
      (ch as Record<string, unknown>)["_command"] = command;
      cb(null, ch);
      return this;
    }

    sftp(cb: SftpCb): this {
      if (state.sftpError) {
        cb(state.sftpError, null);
        return this;
      }
      cb(null, state.sftpWrapper);
      return this;
    }

    end(): void { /* no-op */ }
  }

  return { MockClient };
});

vi.mock("ssh2", () => ({ Client: MockClient }));

// ---------------------------------------------------------------------------
// Normal imports (run after vi.mock hoisting)
// ---------------------------------------------------------------------------
import { EventEmitter } from "node:events";
import { MigrationError } from "./types";
import {
  readCapacity,
  archiveVolume,
  restoreVolume,
  downloadFile,
  uploadFile,
} from "./ssh";
import type { SshTarget } from "./ssh";

// ---------------------------------------------------------------------------
// FakeChannel: a real EventEmitter-based channel with helper methods.
// ---------------------------------------------------------------------------
class FakeChannel extends EventEmitter {
  stderr = new EventEmitter();
  _command = "";

  simulateSuccess(stdout: string): void {
    if (stdout) this.emit("data", Buffer.from(stdout));
    this.emit("close", 0);
  }

  simulateError(code: number, stderrText: string): void {
    if (stderrText) this.stderr.emit("data", Buffer.from(stderrText));
    this.emit("close", code);
  }
}

// ---------------------------------------------------------------------------
// FakeSftp: minimal sftp wrapper.
// ---------------------------------------------------------------------------
class FakeSftp {
  constructor(
    private readResult: Buffer | Error = Buffer.from("content"),
    private writeError: Error | null = null,
  ) {}

  readFile(_path: string, cb: (err: Error | undefined, data: Buffer) => void): void {
    if (this.readResult instanceof Error) {
      cb(this.readResult, Buffer.alloc(0));
    } else {
      cb(undefined, this.readResult);
    }
  }

  writeFile(_path: string, _data: Buffer | string, cb: (err?: Error) => void): void {
    cb(this.writeError ?? undefined);
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const TARGET: SshTarget = {
  host: "10.0.0.1",
  port: 22,
  username: "root",
  privateKey: "-----BEGIN OPENSSH PRIVATE KEY-----\nfake\n-----END OPENSSH PRIVATE KEY-----",
};

/**
 * `free -b` output: available column (index 6) = 2_147_483_648 bytes = 2048 MB.
 */
const FREE_OUTPUT =
  "               total        used        free      shared  buff/cache   available\n" +
  "Mem:     8589934592  4294967296  1073741824   134217728  3221225472  2147483648\n" +
  "Swap:    2147483648           0  2147483648\n";

/**
 * `df -B1` output: available column (index 3) = 10_737_418_240 bytes = 10240 MB.
 */
const DF_OUTPUT =
  "Filesystem     1B-blocks       Used  Available Use% Mounted on\n" +
  "/dev/sda1    107374182400 96636764160 10737418240  90% /\n";

function resetState(): void {
  state.execChannels = [];
  state.execError = null;
  state.sftpWrapper = null;
  state.sftpError = null;
  state.connectError = null;
  state.execIdx = 0;
}

beforeEach(() => {
  resetState();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// readCapacity
// ---------------------------------------------------------------------------
describe("readCapacity", () => {
  it("parses free -b and df into correct MB values", async () => {
    const memCh = new FakeChannel();
    const dfCh = new FakeChannel();
    state.execChannels = [memCh, dfCh];

    // connect() fires 'ready' synchronously, so exec is called before
    // readCapacity() returns.  We can trigger the channels immediately.
    const p = readCapacity(TARGET);

    memCh.simulateSuccess(FREE_OUTPUT);
    dfCh.simulateSuccess(DF_OUTPUT);

    const { freeMemoryMb, freeDiskMb } = await p;

    // 2_147_483_648 / 1024^2 = 2048
    expect(freeMemoryMb).toBe(2048);
    // 10_737_418_240 / 1024^2 = 10240
    expect(freeDiskMb).toBe(10240);
  });

  it("rejects BAD_INPUT for dockerRoot with shell-injection characters", async () => {
    await expect(readCapacity(TARGET, "/var/lib/docker; rm -rf /")).rejects.toMatchObject({
      code: "BAD_INPUT",
    });
  });

  it("throws SSH_EXEC_FAILED when df exits non-zero", async () => {
    const memCh = new FakeChannel();
    const dfCh = new FakeChannel();
    state.execChannels = [memCh, dfCh];

    const p = readCapacity(TARGET);

    memCh.simulateSuccess(FREE_OUTPUT);
    dfCh.simulateError(1, "df: No such file or directory");

    await expect(p).rejects.toMatchObject({ code: "SSH_EXEC_FAILED" });
  });
});

// ---------------------------------------------------------------------------
// archiveVolume
// ---------------------------------------------------------------------------
describe("archiveVolume", () => {
  it("builds the exact docker run tar czf command and returns the archive path", async () => {
    const ch = new FakeChannel();
    state.execChannels = [ch];

    const p = archiveVolume(TARGET, "myapp_data");
    // exec is called synchronously by the mock; trigger success immediately.
    ch.simulateSuccess("");

    const path = await p;

    expect(path).toBe("/tmp/myapp_data.tar.gz");
    expect(ch._command).toBe(
      'docker run --rm -v myapp_data:/from:ro -v /tmp:/to alpine sh -c "tar czf /to/myapp_data.tar.gz -C /from ."',
    );
  });

  it("rejects BAD_INPUT for volume name with spaces", async () => {
    await expect(archiveVolume(TARGET, "bad name")).rejects.toMatchObject({ code: "BAD_INPUT" });
  });

  it("rejects BAD_INPUT for volume name with semicolons", async () => {
    await expect(archiveVolume(TARGET, "vol;rm -rf /")).rejects.toMatchObject({ code: "BAD_INPUT" });
  });

  it("rejects BAD_INPUT for volume name starting with a hyphen", async () => {
    await expect(archiveVolume(TARGET, "-volname")).rejects.toMatchObject({ code: "BAD_INPUT" });
  });

  it("rejects BAD_INPUT for empty volume name", async () => {
    await expect(archiveVolume(TARGET, "")).rejects.toMatchObject({ code: "BAD_INPUT" });
  });

  it("throws SSH_EXEC_FAILED when exit code is non-zero", async () => {
    const ch = new FakeChannel();
    state.execChannels = [ch];

    const p = archiveVolume(TARGET, "myapp_data");
    ch.simulateError(1, "docker: error response from daemon");

    await expect(p).rejects.toMatchObject({ code: "SSH_EXEC_FAILED" });
  });

  it("never reaches exec when volume name is invalid (immediate rejection)", async () => {
    // Validation throws before the Client is ever constructed.
    await expect(archiveVolume(TARGET, "bad name")).rejects.toMatchObject({ code: "BAD_INPUT" });
  });
});

// ---------------------------------------------------------------------------
// restoreVolume
// ---------------------------------------------------------------------------
describe("restoreVolume", () => {
  it("issues docker volume create then tar extract with correct commands", async () => {
    const createCh = new FakeChannel();
    const extractCh = new FakeChannel();
    state.execChannels = [createCh, extractCh];

    // The first runCommand (docker volume create) fires synchronously.
    const p = restoreVolume(TARGET, "/tmp/myapp_data.tar.gz", "myapp_data");

    // Resolve the first command.  This unblocks the async function and causes
    // the second runCommand to start (also synchronously in the mock).
    createCh.simulateSuccess("");

    // After the first promise resolves (one microtask tick), the second exec
    // has been called synchronously, so we can resolve it.
    await Promise.resolve();
    extractCh.simulateSuccess("");

    await p;

    expect(createCh._command).toBe("docker volume create myapp_data");
    expect(extractCh._command).toBe(
      'docker run --rm -v myapp_data:/to -v /tmp:/from alpine sh -c "tar xzf /from/myapp_data.tar.gz -C /to"',
    );
  });

  it("rejects BAD_INPUT for archive path outside /tmp", async () => {
    await expect(restoreVolume(TARGET, "/etc/passwd", "myapp_data")).rejects.toMatchObject({
      code: "BAD_INPUT",
    });
  });

  it("rejects BAD_INPUT for invalid volume name", async () => {
    await expect(
      restoreVolume(TARGET, "/tmp/myapp_data.tar.gz", "bad name"),
    ).rejects.toMatchObject({ code: "BAD_INPUT" });
  });

  it("rejects BAD_INPUT for archive path with shell injection", async () => {
    await expect(
      restoreVolume(TARGET, "/tmp/x.tar.gz; cat /etc/shadow", "vol"),
    ).rejects.toMatchObject({ code: "BAD_INPUT" });
  });

  it("throws SSH_EXEC_FAILED when docker volume create fails", async () => {
    const createCh = new FakeChannel();
    state.execChannels = [createCh];

    const p = restoreVolume(TARGET, "/tmp/myapp_data.tar.gz", "myapp_data");
    createCh.simulateError(1, "permission denied");

    await expect(p).rejects.toMatchObject({ code: "SSH_EXEC_FAILED" });
  });
});

// ---------------------------------------------------------------------------
// downloadFile
// ---------------------------------------------------------------------------
describe("downloadFile", () => {
  it("returns the file buffer from sftp.readFile", async () => {
    const expected = Buffer.from("archive-binary-contents");
    state.sftpWrapper = new FakeSftp(expected);

    const buf = await downloadFile(TARGET, "/tmp/vol.tar.gz");

    expect(buf).toEqual(expected);
  });

  it("rejects BAD_INPUT for path outside /tmp", async () => {
    await expect(downloadFile(TARGET, "/etc/shadow")).rejects.toMatchObject({ code: "BAD_INPUT" });
  });

  it("rejects BAD_INPUT for path without .tar.gz extension", async () => {
    await expect(downloadFile(TARGET, "/tmp/evil.sh")).rejects.toMatchObject({ code: "BAD_INPUT" });
  });

  it("rejects SSH_ERROR when sftp.readFile fails", async () => {
    state.sftpWrapper = new FakeSftp(new Error("ENOENT"));

    await expect(downloadFile(TARGET, "/tmp/vol.tar.gz")).rejects.toMatchObject({ code: "SSH_ERROR" });
  });
});

// ---------------------------------------------------------------------------
// uploadFile
// ---------------------------------------------------------------------------
describe("uploadFile", () => {
  it("writes a buffer via sftp.writeFile without error", async () => {
    state.sftpWrapper = new FakeSftp(Buffer.from("x"), null);

    await expect(uploadFile(TARGET, Buffer.from("data"), "/tmp/vol.tar.gz")).resolves.toBeUndefined();
  });

  it("rejects BAD_INPUT for path outside /tmp", async () => {
    await expect(
      uploadFile(TARGET, Buffer.alloc(0), "/home/root/evil.tar.gz"),
    ).rejects.toMatchObject({ code: "BAD_INPUT" });
  });

  it("rejects SSH_ERROR when sftp.writeFile fails", async () => {
    state.sftpWrapper = new FakeSftp(Buffer.from("x"), new Error("disk full"));

    await expect(uploadFile(TARGET, Buffer.alloc(0), "/tmp/vol.tar.gz")).rejects.toMatchObject({ code: "SSH_ERROR" });
  });
});
