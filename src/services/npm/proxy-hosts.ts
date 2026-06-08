import "server-only";
import { npmFetch } from "./client";
import type { NpmProxyHost, ProxyHostRequest } from "./types";

const BASE = "/nginx/proxy-hosts";

export const proxyHosts = {
  list: () => npmFetch<NpmProxyHost[]>({ path: BASE }),
  get: (id: number) => npmFetch<NpmProxyHost>({ path: `${BASE}/${id}` }),
  create: (req: ProxyHostRequest) =>
    npmFetch<NpmProxyHost>({ path: BASE, method: "POST", body: req }),
  update: (id: number, req: ProxyHostRequest) =>
    npmFetch<NpmProxyHost>({ path: `${BASE}/${id}`, method: "PUT", body: req }),
  remove: (id: number) =>
    npmFetch<void>({ path: `${BASE}/${id}`, method: "DELETE" }),
  enable: (id: number) =>
    npmFetch<void>({ path: `${BASE}/${id}/enable`, method: "POST" }),
  disable: (id: number) =>
    npmFetch<void>({ path: `${BASE}/${id}/disable`, method: "POST" }),
};
