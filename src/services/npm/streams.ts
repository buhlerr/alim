import "server-only";
import { npmFetch } from "./client";
import type { NpmStream, StreamRequest } from "./types";

const BASE = "/nginx/streams";

export const streams = {
  list: () => npmFetch<NpmStream[]>({ path: BASE }),
  get: (id: number) => npmFetch<NpmStream>({ path: `${BASE}/${id}` }),
  create: (req: StreamRequest) =>
    npmFetch<NpmStream>({ path: BASE, method: "POST", body: req }),
  update: (id: number, req: StreamRequest) =>
    npmFetch<NpmStream>({ path: `${BASE}/${id}`, method: "PUT", body: req }),
  remove: (id: number) =>
    npmFetch<void>({ path: `${BASE}/${id}`, method: "DELETE" }),
  enable: (id: number) =>
    npmFetch<void>({ path: `${BASE}/${id}/enable`, method: "POST" }),
  disable: (id: number) =>
    npmFetch<void>({ path: `${BASE}/${id}/disable`, method: "POST" }),
};
