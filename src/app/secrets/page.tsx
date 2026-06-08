import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
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
        <Card className="border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
          <CardContent className="flex flex-col items-start gap-3 py-6 text-sm">
            <p>
              Encryption is not configured. Set an{" "}
              <code className="font-mono">ENCRYPTION_KEY</code> environment
              variable to store and reveal secrets.
            </p>
            <Button asChild variant="outline">
              <Link href="/settings">Open Settings</Link>
            </Button>
          </CardContent>
        </Card>
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
