// The list_key allowlist for /api/user/list-order, split out of route.ts (BUILDGATE, 2026-09-02,
// F34's named residual / build-graph proof). Next 16's route-type validator rejects a route.ts
// that exports anything besides route handlers/config fields, so this constant moves to a sibling
// module and route.ts imports it. Behaviour is unchanged; only the file it lives in moved.

import { WATCHLIST_LIST_KEY } from "@/lib/watchlist-order";

// list_key is an ALLOWLIST, not free text. The column takes any string up to 64
// chars, so without this a client could mint unbounded distinct keys and grow
// the table without limit — one row per key per item, none of them ever read by
// a surface. Adding a new orderable surface is a deliberate edit here.
export const LIST_KEYS = [
  // Imported rather than re-typed: the server reader and the drag client both
  // key off this exact string, and a literal copy here could drift from it
  // silently — the route would accept a key nothing reads.
  WATCHLIST_LIST_KEY,
  "regulations",
  "market",
  "research",
  "operations",
] as const;
export type ListKey = (typeof LIST_KEYS)[number];
