import "server-only";
import { npmFetch } from "./client";
import type { NpmRedirectionHost, RedirectionHostRequest } from "./types";

const BASE = "/nginx/redirection-hosts";

export const redirectionHosts = {
  list: () => npmFetch<NpmRedirectionHost[]>({ path: BASE }),
  get: (id: number) => npmFetch<NpmRedirectionHost>({ path: `${BASE}/${id}` }),
  create: (req: RedirectionHostRequest) =>
    npmFetch<NpmRedirectionHost>({ path: BASE, method: "POST", body: req }),
  update: (id: number, req: RedirectionHostRequest) =>
    npmFetch<NpmRedirectionHost>({ path: `${BASE}/${id}`, method: "PUT", body: req }),
  remove: (id: number) =>
    npmFetch<void>({ path: `${BASE}/${id}`, method: "DELETE" }),
  enable: (id: number) =>
    npmFetch<void>({ path: `${BASE}/${id}/enable`, method: "POST" }),
  disable: (id: number) =>
    npmFetch<void>({ path: `${BASE}/${id}/disable`, method: "POST" }),
};
