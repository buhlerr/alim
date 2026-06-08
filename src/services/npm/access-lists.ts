import "server-only";
import { npmFetch } from "./client";
import type { NpmAccessList } from "./types";

export const accessLists = {
  list: () => npmFetch<NpmAccessList[]>({ path: "/nginx/access-lists" }),
};
