/**
 * Pure helper for the Coolify import flow. Kept separate so it can be
 * unit-tested without "use server" / revalidatePath complications.
 */

import type { CoolifySecurityKey, CoolifyServer } from "@/services/coolify/types";
import type { UpsertHostCredentialInput } from "@/services/migration/host-credentials";

export interface ImportSkip {
  name: string;
  reason: string;
}

export interface MappedCredential {
  input: UpsertHostCredentialInput;
}

export interface MapResult {
  credentials: MappedCredential[];
  skipped: ImportSkip[];
}

/**
 * Given the list of servers (summary), their detailed records, and the
 * security-key index, returns the credentials to upsert and the servers
 * that were skipped with a reason.
 *
 * No I/O; purely transforms data.
 */
export function mapServersToCredentials(
  serversDetail: CoolifyServer[],
  keysById: Map<number, CoolifySecurityKey>,
): MapResult {
  const credentials: MappedCredential[] = [];
  const skipped: ImportSkip[] = [];

  for (const d of serversDetail) {
    if (!d.ip) {
      skipped.push({ name: d.name, reason: "no IP address" });
      continue;
    }

    if (d.private_key_id == null) {
      skipped.push({ name: d.name, reason: "no private_key_id" });
      continue;
    }

    const key = keysById.get(d.private_key_id);
    if (!key) {
      skipped.push({ name: d.name, reason: `key id ${d.private_key_id} not found in /security/keys` });
      continue;
    }

    if (!key.private_key) {
      skipped.push({ name: d.name, reason: `key "${key.name}" has no private key material` });
      continue;
    }

    credentials.push({
      input: {
        coolifyServerUuid: d.uuid,
        name: d.name,
        ipAddress: d.ip,
        sshPort: d.port ?? 22,
        sshUsername: d.user ?? "root",
        privateKey: key.private_key,
      },
    });
  }

  return { credentials, skipped };
}
