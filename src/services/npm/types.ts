/**
 * Nginx Proxy Manager domain types and error class. Mirrors the Coolify
 * module's `CoolifyError` pattern: a typed error carrying a stable code and a
 * user-presentable, credential-free message.
 */

export class NpmError extends Error {
  constructor(
    message: string,
    public readonly code: string = "NPM_ERROR",
  ) {
    super(message);
    this.name = "NpmError";
  }
}

export interface NpmConnectionResult {
  ok: boolean;
  message: string;
  version?: string;
}

/** Token minted by `POST /api/tokens`. */
export interface NpmToken {
  token: string;
  /** ISO timestamp string. */
  expires: string;
}

/** Shared owner/status fields present on every NPM host resource. */
interface NpmHostBase {
  id: number;
  enabled: boolean;
  domain_names: string[];
  certificate_id: number;
  ssl_forced: boolean;
  http2_support: boolean;
  hsts_enabled: boolean;
  hsts_subdomains: boolean;
  advanced_config?: string;
  meta?: Record<string, unknown>;
}

export interface NpmProxyHost extends NpmHostBase {
  forward_scheme: "http" | "https";
  forward_host: string;
  forward_port: number;
  block_exploits: boolean;
  caching_enabled: boolean;
  allow_websocket_upgrade: boolean;
  access_list_id: number;
}

export interface NpmRedirectionHost extends NpmHostBase {
  forward_scheme: "auto" | "http" | "https";
  forward_domain_name: string;
  forward_http_code: number;
  preserve_path: boolean;
  block_exploits: boolean;
}

export interface NpmDeadHost extends NpmHostBase {
  // 404 hosts only serve a default error page; no forwarding fields.
  _placeholder?: never;
}

export interface NpmStream {
  id: number;
  enabled: boolean;
  incoming_port: number;
  forwarding_host: string;
  forwarding_port: number;
  tcp_forwarding: boolean;
  udp_forwarding: boolean;
}

export interface NpmCertificate {
  id: number;
  provider: string;
  nice_name: string;
  domain_names: string[];
  expires_on?: string | null;
}

export interface NpmAccessList {
  id: number;
  name: string;
}

// ---- Request shapes (what our forms produce) ----

export interface ProxyHostRequest {
  domain_names: string[];
  forward_scheme: "http" | "https";
  forward_host: string;
  forward_port: number;
  certificate_id: number;
  ssl_forced: boolean;
  http2_support: boolean;
  hsts_enabled: boolean;
  block_exploits: boolean;
  caching_enabled: boolean;
  allow_websocket_upgrade: boolean;
  access_list_id: number;
  advanced_config: string;
}

export interface RedirectionHostRequest {
  domain_names: string[];
  forward_scheme: "auto" | "http" | "https";
  forward_domain_name: string;
  forward_http_code: number;
  preserve_path: boolean;
  certificate_id: number;
  ssl_forced: boolean;
  block_exploits: boolean;
  advanced_config: string;
}

export interface StreamRequest {
  incoming_port: number;
  forwarding_host: string;
  forwarding_port: number;
  tcp_forwarding: boolean;
  udp_forwarding: boolean;
}

export interface DeadHostRequest {
  domain_names: string[];
  certificate_id: number;
  ssl_forced: boolean;
  http2_support: boolean;
  advanced_config: string;
}

export interface LetsEncryptRequest {
  domainNames: string[];
  email: string;
}
