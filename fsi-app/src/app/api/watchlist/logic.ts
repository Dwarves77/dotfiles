import { NextResponse } from "next/server";

// ITEM_TYPES is exported purely for direct unit test of the real validation, the same
// route-exports-a-pure-decision-function pattern src/app/api/admin/sources/bulk-import/logic.ts's
// headReachabilityDecision already uses — it changes nothing about the route's HTTP contract.
export const ITEM_TYPES = new Set([
  "source",
  "reg",
  "signal",
  "research",
  "operations",
  "market_series",
]);

// The scope-conditional rejection for a TEAM_ONLY_TYPES item requested at
// scope=personal. Names the actual reason (team-scope only), not a generic
// "invalid type" — the caller did name a real item_type, just at a scope that
// does not support it yet.
export const teamOnlyError = (itemType: string) =>
  NextResponse.json(
    {
      error: `item_type "${itemType}" is only watchable at scope=team; personal watching of ${itemType} is not supported`,
    },
    { status: 400 }
  );
