import "server-only";
import { npmFetch } from "./client";
import type { NpmDeadHost, DeadHostRequest } from "./types";

const BASE = "/nginx/dead-hosts";

export const deadHosts = {
  list: () => npmFetch<NpmDeadHost[]>({ path: BASE }),
  get: (id: number) => npmFetch<NpmDeadHost>({ path: `${BASE}/${id}` }),
  create: (req: DeadHostRequest) =>
    npmFetch<NpmDeadHost>({ path: BASE, method: "POST", body: req }),
  update: (id: number, req: DeadHostRequest) =>
    npmFetch<NpmDeadHost>({ path: `${BASE}/${id}`, method: "PUT", body: req }),
  remove: (id: number) =>
    npmFetch<void>({ path: `${BASE}/${id}`, method: "DELETE" }),
  enable: (id: number) =>
    npmFetch<void>({ path: `${BASE}/${id}/enable`, method: "POST" }),
  disable: (id: number) =>
    npmFetch<void>({ path: `${BASE}/${id}/disable`, method: "POST" }),
};
