import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { Callout } from "@/components/ui/callout";
import { Button } from "@/components/ui/button";
import { isEncryptionConfigured } from "@/lib/crypto";
import { secretsService } from "@/services/secrets";
import { SecretsManager, type SecretListItem } from "@/components/secrets/secrets-manager";

export const dynamic = "force-dynamic";

export default async function SecretsPage() {
  const configured = isEncryptionConfigured();

  if (!configured) {
    return (
      <div>
        <PageHeader
          title="Secrets"
          description="Encrypted storage for API tokens and credentials."
        />
        <Callout tone="warn" title="Not configured">
          <p>
            Encryption is not configured. Set an{" "}
            <code className="font-mono text-foreground">ENCRYPTION_KEY</code>{" "}
            environment variable to store and reveal secrets.
          </p>
          <Button asChild variant="outline">
            <Link href="/settings">Open Settings</Link>
          </Button>
        </Callout>
      </div>
    );
  }

  const secrets: SecretListItem[] = (await secretsService.list()).map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    category: s.category,
    lastRevealedAt: s.lastRevealedAt ? s.lastRevealedAt.toISOString() : null,
    createdAt: s.createdAt.toISOString(),
  }));

  return (
    <div>
      <PageHeader
        title="Secrets"
        description="Encrypted vault for API tokens, passwords, and connection strings. Values are stored with AES-256-GCM and revealed on demand."
      />
      <SecretsManager secrets={secrets} />
    </div>
  );
}
