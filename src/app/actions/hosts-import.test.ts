import { describe, it, expect } from "vitest";
import { mapServersToCredentials } from "./hosts-import";
import type { CoolifySecurityKey, CoolifyServer } from "@/services/coolify/types";

const KEY_1: CoolifySecurityKey = {
  id: 1,
  uuid: "key-uuid-1",
  name: "default-key",
  private_key: "-----BEGIN OPENSSH PRIVATE KEY-----\nfakekey\n-----END OPENSSH PRIVATE KEY-----",
  is_git_related: false,
};

function makeKeysById(keys: CoolifySecurityKey[]) {
  return new Map(keys.map((k) => [k.id, k]));
}

describe("mapServersToCredentials", () => {
  it("maps a server with a valid key to a credential input", () => {
    const servers: CoolifyServer[] = [
      { uuid: "srv-1", name: "host-01", ip: "192.168.100.11", port: 22, user: "root", private_key_id: 1 },
    ];
    const { credentials, skipped } = mapServersToCredentials(servers, makeKeysById([KEY_1]));

    expect(credentials).toHaveLength(1);
    expect(skipped).toHaveLength(0);
    const c = credentials[0]!.input;
    expect(c.coolifyServerUuid).toBe("srv-1");
    expect(c.name).toBe("host-01");
    expect(c.ipAddress).toBe("192.168.100.11");
    expect(c.sshPort).toBe(22);
    expect(c.sshUsername).toBe("root");
    expect(c.privateKey).toBe(KEY_1.private_key);
  });

  it("defaults sshPort to 22 and sshUsername to root when absent", () => {
    const servers: CoolifyServer[] = [
      { uuid: "srv-2", name: "host-02", ip: "192.168.100.12", private_key_id: 1 },
    ];
    const { credentials } = mapServersToCredentials(servers, makeKeysById([KEY_1]));

    expect(credentials).toHaveLength(1);
    expect(credentials[0]!.input.sshPort).toBe(22);
    expect(credentials[0]!.input.sshUsername).toBe("root");
  });

  it("skips a server with no IP address", () => {
    const servers: CoolifyServer[] = [
      { uuid: "srv-3", name: "no-ip-server", ip: null, private_key_id: 1 },
    ];
    const { credentials, skipped } = mapServersToCredentials(servers, makeKeysById([KEY_1]));

    expect(credentials).toHaveLength(0);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]!.name).toBe("no-ip-server");
    expect(skipped[0]!.reason).toMatch(/no IP/i);
  });

  it("skips a server with no private_key_id", () => {
    const servers: CoolifyServer[] = [
      { uuid: "srv-4", name: "no-key-id-server", ip: "10.0.0.1" },
    ];
    const { credentials, skipped } = mapServersToCredentials(servers, makeKeysById([KEY_1]));

    expect(credentials).toHaveLength(0);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]!.reason).toMatch(/private_key_id/);
  });

  it("skips a server whose key id does not exist in the keys map", () => {
    const servers: CoolifyServer[] = [
      { uuid: "srv-5", name: "missing-key-server", ip: "10.0.0.2", private_key_id: 99 },
    ];
    const { credentials, skipped } = mapServersToCredentials(servers, makeKeysById([KEY_1]));

    expect(credentials).toHaveLength(0);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]!.reason).toMatch(/99/);
  });

  it("skips a server whose key has no private_key material", () => {
    const keyNoMaterial: CoolifySecurityKey = { id: 2, uuid: "k2", name: "empty-key" };
    const servers: CoolifyServer[] = [
      { uuid: "srv-6", name: "empty-key-server", ip: "10.0.0.3", private_key_id: 2 },
    ];
    const { credentials, skipped } = mapServersToCredentials(servers, makeKeysById([keyNoMaterial]));

    expect(credentials).toHaveLength(0);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]!.reason).toMatch(/no private key material/i);
  });

  it("does not include the private key in the skipped entries", () => {
    const servers: CoolifyServer[] = [
      { uuid: "srv-7", name: "bad-server", ip: null, private_key_id: 1 },
    ];
    const { skipped } = mapServersToCredentials(servers, makeKeysById([KEY_1]));

    const json = JSON.stringify(skipped);
    expect(json).not.toContain("BEGIN");
    expect(json).not.toContain("fakekey");
  });

  it("processes multiple servers in one call and returns separate results per server", () => {
    const KEY_2: CoolifySecurityKey = { id: 2, uuid: "k2", name: "key-2", private_key: "-----BEGIN RSA PRIVATE KEY-----\ndata\n-----END RSA PRIVATE KEY-----" };
    const servers: CoolifyServer[] = [
      { uuid: "srv-a", name: "server-a", ip: "1.1.1.1", port: 2222, user: "admin", private_key_id: 1 },
      { uuid: "srv-b", name: "server-b", ip: "2.2.2.2", private_key_id: 2 },
      { uuid: "srv-c", name: "server-c", ip: null, private_key_id: 1 },
    ];
    const { credentials, skipped } = mapServersToCredentials(servers, makeKeysById([KEY_1, KEY_2]));

    expect(credentials).toHaveLength(2);
    expect(skipped).toHaveLength(1);
    expect(credentials[0]!.input.sshPort).toBe(2222);
    expect(credentials[0]!.input.sshUsername).toBe("admin");
    expect(skipped[0]!.name).toBe("server-c");
  });
});
