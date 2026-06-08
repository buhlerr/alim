import "server-only";
import { cfFetch } from "./client";
import type { CfDnsRecord, CfDnsRecordRequest } from "./types";

export const dns = {
  list: (zoneId: string) =>
    cfFetch<CfDnsRecord[]>({ path: `/zones/${zoneId}/dns_records`, query: { per_page: 100 } }),

  create: (zoneId: string, req: CfDnsRecordRequest) =>
    cfFetch<CfDnsRecord>({ path: `/zones/${zoneId}/dns_records`, method: "POST", body: req }),

  update: (zoneId: string, id: string, req: CfDnsRecordRequest) =>
    cfFetch<CfDnsRecord>({ path: `/zones/${zoneId}/dns_records/${id}`, method: "PUT", body: req }),

  remove: (zoneId: string, id: string) =>
    cfFetch<void>({ path: `/zones/${zoneId}/dns_records/${id}`, method: "DELETE" }),
};
