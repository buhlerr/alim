import { PageHeader } from "@/components/page-header";
import { Callout } from "@/components/ui/callout";
import { isEncryptionConfigured } from "@/lib/crypto";
import { HostCredentialsManager } from "@/components/hosts/host-credentials-manager";
import { getHostCredentialOptionsAction } from "@/app/actions/hosts";

export const dynamic = "force-dynamic";

export default async function HostsPage() {
  const encryptionConfigured = isEncryptionConfigured();

  if (!encryptionConfigured) {
    return (
      <div>
        <PageHeader
          title="Hosts"
          description="SSH credentials for migration volume transfer."
        />
        <Callout tone="warn" title="Not configured">
          <p>
            Encryption is not configured. Set an{" "}
            <code className="font-mono text-foreground">ENCRYPTION_KEY</code>{" "}
            environment variable before storing SSH credentials.
          </p>
        </Callout>
      </div>
    );
  }

  const result = await getHostCredentialOptionsAction();
  const servers = result.ok && result.data ? result.data.servers : [];

  return (
    <div>
      <PageHeader
        title="Hosts"
        description="Attach SSH credentials to each Coolify server. Keys are stored encrypted (AES-256-GCM) and used by the migration engine for volume transfer."
      />
      <HostCredentialsManager servers={servers} />
    </div>
  );
}
