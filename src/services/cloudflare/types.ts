/**
 * Cloudflare domain types and error class. Mirrors the Coolify/NPM modules'
 * typed-error pattern: a stable code and a user-presentable, credential-free
 * message.
 */

export class CloudflareError extends Error {
  constructor(
    message: string,
    public readonly code: string = "CLOUDFLARE_ERROR",
  ) {
    super(message);
    this.name = "CloudflareError";
  }
}

/** Standard Cloudflare API response envelope. */
export interface CloudflareEnvelope<T> {
  success: boolean;
  errors: Array<{ code?: number; message: string }>;
  messages?: Array<{ message: string }>;
  result: T;
}

export interface CloudflareConnectionResult {
  ok: boolean;
  message: string;
}

export interface CfZone {
  id: string;
  name: string;
  status?: string;
}

export interface CfTunnel {
  id: string;
  name: string;
  status?: string;
  created_at?: string;
  deleted_at?: string | null;
}

/** One public-hostname ingress rule on a tunnel's configuration. */
export interface CfIngressRule {
  hostname?: string;
  service: string;
  path?: string;
}

export interface CfTunnelConfig {
  ingress: CfIngressRule[];
}

export interface CfDnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  proxied?: boolean;
  ttl?: number;
}

export interface CfDnsRecordRequest {
  type: string;
  name: string;
  content: string;
  proxied: boolean;
  ttl: number;
}

export type CfSslMode = "off" | "flexible" | "full" | "strict";

export interface CfTlsSettings {
  ssl: CfSslMode;
  always_use_https: boolean;
}
