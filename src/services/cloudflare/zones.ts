import "server-only";
import { cfFetch } from "./client";
import type { CfZone } from "./types";

export const zones = {
  list: () => cfFetch<CfZone[]>({ path: "/zones", query: { per_page: 50 } }),
};
