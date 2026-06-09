"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { hostCredentialsService } from "@/services/migration/host-credentials";
import { coolifyService } from "@/services/coolify/service";
import { auditService } from "@/services/audit";
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from "@/lib/audit";
import type { ActionResult } from "./secrets";

// Re-export the shape so consumers have a single import point.
export type { ActionResult };

/** Loose PEM / OpenSSH private-key check. */
function looksLikePrivateKey(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.startsWith("-----BEGIN") ||
    trimmed.startsWith("OPENSSH PRIVATE KEY") ||
    trimmed.includes("BEGIN RSA PRIVATE KEY") ||
    trimmed.includes("BEGIN EC PRIVATE KEY") ||
    trimmed.includes("BEGIN OPENSSH PRIVATE KEY")
  );
}

const saveHostCredentialSchema = z.object({
  coolifyServerUuid: z.string().min(1, "Server is required"),
  name: z.string().min(1, "Name is required"),
  ipAddress: z.string().min(1, "IP address is required"),
  sshPort: z.coerce.number().int().min(1).max(65535).default(22),
  sshUsername: z.string().min(1, "Username is required").default("root"),
  hostname: z.string().optional(),
  privateKey: z.string().min(1, "Private key is required"),
});

export interface HostCredentialOption {
  uuid: string;
  name: string;
  ip: string | null;
  hasCredential: boolean;
  credentialId?: string;
  credentialName?: string;
}

/**
 * Lists Coolify servers joined with whether each has a stored SSH credential.
 * Safe to call from server components.
 */
export async function getHostCredentialOptionsAction(): Promise<
  ActionResult<{ servers: HostCredentialOption[] }>
> {
  try {
    const [servers, credentials] = await Promise.all([
      coolifyService.listServers(),
      hostCredentialsService.list(),
    ]);

    const byUuid = new Map(credentials.map((c) => [c.coolifyServerUuid ?? "", c]));

    const result: HostCredentialOption[] = servers.map((s) => {
      const cred = byUuid.get(s.uuid);
      return {
        uuid: s.uuid,
        name: s.name,
        ip: s.ip ?? null,
        hasCredential: Boolean(cred),
        credentialId: cred?.id,
        credentialName: cred?.name,
      };
    });

    return { ok: true, data: { servers: result } };
  } catch {
    return { ok: false, error: "Could not load servers." };
  }
}

export async function saveHostCredentialAction(input: unknown): Promise<ActionResult> {
  const parsed = saveHostCredentialSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  if (!looksLikePrivateKey(parsed.data.privateKey)) {
    return {
      ok: false,
      error: "The private key does not look like a valid PEM or OpenSSH key.",
      fieldErrors: { privateKey: ["Must be a PEM or OpenSSH private key."] },
    };
  }

  try {
    const saved = await hostCredentialsService.upsertForServer({
      coolifyServerUuid: parsed.data.coolifyServerUuid,
      name: parsed.data.name,
      ipAddress: parsed.data.ipAddress,
      sshPort: parsed.data.sshPort,
      sshUsername: parsed.data.sshUsername,
      hostname: parsed.data.hostname || null,
      privateKey: parsed.data.privateKey,
    });

    await auditService.record({
      action: AUDIT_ACTIONS.HOST_CREDENTIAL_SAVE,
      summary: `Saved SSH credential "${saved.name}" for server ${parsed.data.coolifyServerUuid}`,
      targetType: AUDIT_TARGET_TYPES.HOST_CREDENTIAL,
      targetId: saved.id,
      metadata: { serverUuid: parsed.data.coolifyServerUuid, ip: parsed.data.ipAddress },
    });

    revalidatePath("/hosts");
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not save the host credential." };
  }
}

export async function deleteHostCredentialAction(id: string): Promise<ActionResult> {
  try {
    await hostCredentialsService.remove(id);
    await auditService.record({
      action: AUDIT_ACTIONS.HOST_CREDENTIAL_DELETE,
      summary: `Deleted host credential ${id}`,
      targetType: AUDIT_TARGET_TYPES.HOST_CREDENTIAL,
      targetId: id,
    });
    revalidatePath("/hosts");
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not delete the host credential." };
  }
}
