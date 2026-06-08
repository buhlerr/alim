import { Suspense } from "react";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { isCloudflareConfigured } from "@/lib/cloudflare-config";
import { getTunnelsAction, getZonesAction } from "@/app/actions/cloudflare";
import { CloudflareManager } from "@/components/cloudflare/cloudflare-manager";

export const dynamic = "force-dynamic";

export default async function CloudflarePage() {
  const configured = await isCloudflareConfigured();

  if (!configured) {
    return (
      <div>
        <PageHeader
          title="Cloudflare"
          description="Manage tunnels, DNS records, and TLS settings."
        />
        <Card className="border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
          <CardContent className="flex flex-col items-start gap-3 py-6 text-sm">
            <p>Cloudflare is not connected yet.</p>
            <Button asChild>
              <Link href="/settings">Configure in Settings</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Cloudflare"
        description="Manage tunnels, DNS records, and TLS settings."
      />
      <Suspense fallback={<ListSkeleton />}>
        <CloudflareContent />
      </Suspense>
    </div>
  );
}

async function CloudflareContent() {
  const [tunnels, zones] = await Promise.all([getTunnelsAction(), getZonesAction()]);

  // Zones power the DNS/TLS tabs; a tunnel failure (e.g. no account ID) should
  // not blank the whole page, so only surface a zones failure as fatal.
  const error = !zones.ok ? zones.error : undefined;

  return (
    <CloudflareManager
      tunnels={tunnels.data ?? []}
      zones={zones.data ?? []}
      error={error}
    />
  );
}
