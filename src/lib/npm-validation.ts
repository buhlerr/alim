import { z } from "zod";

/** Split a comma/whitespace-separated domain list into a clean array. */
export function parseDomains(input: string): string[] {
  return input
    .split(/[\s,]+/)
    .map((d) => d.trim())
    .filter(Boolean);
}

const port = z.coerce.number().int().min(1, "1–65535").max(65535, "1–65535");
const domains = z.string().trim().min(1, "Enter at least one domain");
const advanced = z.string().max(20_000).optional().or(z.literal(""));
/** NPM uses 0 to mean "no certificate"; "new" is handled separately by the action. */
const certificateId = z.coerce.number().int().min(0).default(0);

export const npmConfigSchema = z.object({
  baseUrl: z.string().url("Enter a valid URL, e.g. https://npm.example.com"),
  identity: z.string().email("Enter the admin email"),
  // Optional at the schema level: a blank password on update keeps the stored
  // one. The action enforces "required" on first-time setup.
  secret: z.string().optional(),
});
export type NpmConfigInput = z.infer<typeof npmConfigSchema>;

export const proxyHostSchema = z.object({
  domain_names: domains,
  forward_scheme: z.enum(["http", "https"]),
  forward_host: z.string().trim().min(1, "Forward host is required"),
  forward_port: port,
  certificate_id: certificateId,
  ssl_forced: z.boolean().default(false),
  http2_support: z.boolean().default(false),
  hsts_enabled: z.boolean().default(false),
  block_exploits: z.boolean().default(false),
  caching_enabled: z.boolean().default(false),
  allow_websocket_upgrade: z.boolean().default(true),
  access_list_id: z.coerce.number().int().min(0).default(0),
  advanced_config: advanced,
});
export type ProxyHostInput = z.infer<typeof proxyHostSchema>;

export const redirectionHostSchema = z.object({
  domain_names: domains,
  forward_scheme: z.enum(["auto", "http", "https"]),
  forward_domain_name: z.string().trim().min(1, "Destination domain is required"),
  forward_http_code: z.coerce
    .number()
    .int()
    .refine((c) => [300, 301, 302, 307, 308].includes(c), "Choose a valid redirect code"),
  preserve_path: z.boolean().default(true),
  certificate_id: certificateId,
  ssl_forced: z.boolean().default(false),
  block_exploits: z.boolean().default(false),
  advanced_config: advanced,
});
export type RedirectionHostInput = z.infer<typeof redirectionHostSchema>;

export const streamSchema = z
  .object({
    incoming_port: port,
    forwarding_host: z.string().trim().min(1, "Forwarding host is required"),
    forwarding_port: port,
    tcp_forwarding: z.boolean().default(true),
    udp_forwarding: z.boolean().default(false),
  })
  .refine((s) => s.tcp_forwarding || s.udp_forwarding, {
    message: "Enable TCP, UDP, or both",
    path: ["tcp_forwarding"],
  });
export type StreamInput = z.infer<typeof streamSchema>;

export const deadHostSchema = z.object({
  domain_names: domains,
  certificate_id: certificateId,
  ssl_forced: z.boolean().default(false),
  http2_support: z.boolean().default(false),
  advanced_config: advanced,
});
export type DeadHostInput = z.infer<typeof deadHostSchema>;

export const letsEncryptSchema = z.object({
  domain_names: domains,
  email: z.string().email("Enter a valid email for Let's Encrypt"),
});
export type LetsEncryptInput = z.infer<typeof letsEncryptSchema>;
