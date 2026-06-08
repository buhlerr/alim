import { Suspense } from "react";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { isNpmConfigured } from "@/lib/npm-config";
import {
  getProxyHostsAction,
  getRedirectionHostsAction,
  getStreamsAction,
  getDeadHostsAction,
  getNpmFormOptionsAction,
} from "@/app/actions/npm";
import { NpmManager } from "@/components/npm/npm-manager";

export const dynamic = "force-dynamic";

export default async function NpmPage() {
  const configured = await isNpmConfigured();

  if (!configured) {
    return (
      <div>
        <PageHeader
          title="Proxy Hosts"
          description="Manage Nginx Proxy Manager hosts, redirects, streams, and SSL."
        />
        <Callout tone="warn" title="Not connected">
          <p>Nginx Proxy Manager is not connected yet.</p>
          <Button asChild>
            <Link href="/settings">Configure in Settings</Link>
          </Button>
        </Callout>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Proxy Hosts"
        description="Manage Nginx Proxy Manager hosts, redirects, streams, and SSL."
      />
      <Suspense fallback={<ListSkeleton />}>
        <NpmContent />
      </Suspense>
    </div>
  );
}

async function NpmContent() {
  const [proxy, redir, streams, dead, options] = await Promise.all([
    getProxyHostsAction(),
    getRedirectionHostsAction(),
    getStreamsAction(),
    getDeadHostsAction(),
    getNpmFormOptionsAction(),
  ]);

  // Surface the first failure (they share the same upstream/auth).
  const error = [proxy, redir, streams, dead, options].find((r) => !r.ok)?.error;

  return (
    <NpmManager
      proxyHosts={proxy.data ?? []}
      redirectionHosts={redir.data ?? []}
      streams={streams.data ?? []}
      deadHosts={dead.data ?? []}
      certificates={options.data?.certificates ?? []}
      accessLists={options.data?.accessLists ?? []}
      error={error}
    />
  );
}
