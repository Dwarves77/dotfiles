import type { Resource } from "@/types/resource";

// Regulation item_types per the canonical taxonomy in
// environmental-policy-and-innovation SKILL Section 3. Shared between
// /operations' server page (first-page cross-reference filter) and
// OperationsLedger's client-side remainder merge, so both apply the exact
// same predicate to the exact same fetcher's rows.
export const REGULATION_ITEM_TYPES = new Set([
  "regulation",
  "directive",
  "standard",
  "guidance",
  "framework",
  "law",
]);

export function isRegulationItem(r: Resource): boolean {
  return r.domain === 1 || (typeof r.type === "string" && REGULATION_ITEM_TYPES.has(r.type));
}
