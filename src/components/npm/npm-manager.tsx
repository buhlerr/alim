"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { ProxyHostsTab } from "./proxy-hosts-tab";
import { RedirectionHostsTab } from "./redirection-hosts-tab";
import { StreamsTab } from "./streams-tab";
import { DeadHostsTab } from "./dead-hosts-tab";
import { CertificatesTab } from "./certificates-tab";
import type {
  NpmAccessList,
  NpmCertificate,
  NpmDeadHost,
  NpmProxyHost,
  NpmRedirectionHost,
  NpmStream,
} from "@/services/npm/types";

export function NpmManager({
  proxyHosts,
  redirectionHosts,
  streams,
  deadHosts,
  certificates,
  accessLists,
  error,
}: {
  proxyHosts: NpmProxyHost[];
  redirectionHosts: NpmRedirectionHost[];
  streams: NpmStream[];
  deadHosts: NpmDeadHost[];
  certificates: NpmCertificate[];
  accessLists: NpmAccessList[];
  error?: string;
}) {
  if (error) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="py-6 text-sm text-destructive">{error}</CardContent>
      </Card>
    );
  }

  return (
    <Tabs defaultValue="proxy">
      <TabsList>
        <TabsTrigger value="proxy">Proxy Hosts</TabsTrigger>
        <TabsTrigger value="redirection">Redirections</TabsTrigger>
        <TabsTrigger value="streams">Streams</TabsTrigger>
        <TabsTrigger value="dead">404 Hosts</TabsTrigger>
        <TabsTrigger value="certs">Certificates</TabsTrigger>
      </TabsList>

      <TabsContent value="proxy" className="mt-4">
        <ProxyHostsTab
          hosts={proxyHosts}
          certificates={certificates}
          accessLists={accessLists}
        />
      </TabsContent>
      <TabsContent value="redirection" className="mt-4">
        <RedirectionHostsTab hosts={redirectionHosts} certificates={certificates} />
      </TabsContent>
      <TabsContent value="streams" className="mt-4">
        <StreamsTab streams={streams} />
      </TabsContent>
      <TabsContent value="dead" className="mt-4">
        <DeadHostsTab hosts={deadHosts} certificates={certificates} />
      </TabsContent>
      <TabsContent value="certs" className="mt-4">
        <CertificatesTab certificates={certificates} />
      </TabsContent>
    </Tabs>
  );
}
