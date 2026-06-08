import { z } from "zod";

export const cloudflareConfigSchema = z.object({
  // Optional at the schema level on update: a blank token keeps the stored one.
  // The action enforces "required" on first-time setup.
  apiToken: z.string().min(1, "API token is required"),
  accountId: z.string().optional().or(z.literal("")),
});
export type CloudflareConfigInput = z.infer<typeof cloudflareConfigSchema>;

export const tunnelCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
});
export type TunnelCreateInput = z.infer<typeof tunnelCreateSchema>;

export const tunnelRouteSchema = z.object({
  hostname: z.string().trim().min(1, "Public hostname is required"),
  // e.g. http://localhost:3000, https://10.0.0.5:8443, http_status:404
  service: z.string().trim().min(1, "Service URL is required"),
  path: z.string().optional().or(z.literal("")),
});
export type TunnelRouteInput = z.infer<typeof tunnelRouteSchema>;

export const DNS_RECORD_TYPES = ["A", "AAAA", "CNAME", "TXT", "MX", "NS"] as const;

export const dnsRecordSchema = z.object({
  type: z.enum(DNS_RECORD_TYPES),
  name: z.string().trim().min(1, "Name is required"),
  content: z.string().trim().min(1, "Content is required"),
  proxied: z.boolean().default(false),
  // 1 = "automatic" in Cloudflare.
  ttl: z.coerce.number().int().min(1).default(1),
});
export type DnsRecordInput = z.infer<typeof dnsRecordSchema>;

export const SSL_MODES = ["off", "flexible", "full", "strict"] as const;

export const tlsSchema = z.object({
  ssl: z.enum(SSL_MODES),
  always_use_https: z.boolean().default(false),
});
export type TlsInput = z.infer<typeof tlsSchema>;
