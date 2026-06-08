"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { TunnelsTab } from "./tunnels-tab";
import { DnsTab } from "./dns-tab";
import { TlsTab } from "./tls-tab";
import type { CfTunnel, CfZone } from "@/services/cloudflare/types";

export function CloudflareManager({
  tunnels,
  zones,
  error,
}: {
  tunnels: CfTunnel[];
  zones: CfZone[];
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
    <Tabs defaultValue="tunnels">
      <TabsList>
        <TabsTrigger value="tunnels">Tunnels</TabsTrigger>
        <TabsTrigger value="dns">DNS</TabsTrigger>
        <TabsTrigger value="tls">TLS</TabsTrigger>
      </TabsList>

      <TabsContent value="tunnels" className="mt-4">
        <TunnelsTab tunnels={tunnels} />
      </TabsContent>
      <TabsContent value="dns" className="mt-4">
        <DnsTab zones={zones} />
      </TabsContent>
      <TabsContent value="tls" className="mt-4">
        <TlsTab zones={zones} />
      </TabsContent>
    </Tabs>
  );
}
