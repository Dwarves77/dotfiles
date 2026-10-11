import type { Resource } from "@/types/resource";
import { getJurisdiction } from "@/lib/scoring";
import { bandFromPriority } from "@/lib/urgency/bands";

/**
 * The jurisdiction key for one item: the stored column when the corpus has
 * one, else the derivation from the item's own text, else "global".
 * Lowercased, because every consumer groups on it as a map key and the
 * JURISDICTIONS registry ids are lowercase.
 */
export function jurisdictionKeyOf(r: Resource): string {
  return (r.jurisdiction || getJurisdiction(r) || "global").toLowerCase();
}

/** Distinct jurisdiction keys present in a set of items, insertion-ordered. */
export function jurisdictionKeys(rows: Resource[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    const key = jurisdictionKeyOf(r);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/** How many distinct jurisdictions the set covers. */
export function jurisdictionCount(rows: Resource[]): number {
  return jurisdictionKeys(rows).length;
}

/**
 * Distinct jurisdictions holding at least one item in the given band. The
 * rail card states this as "Immediate · N jurisdictions" and the masthead as
 * "N jurisdictions with immediate items" — one figure, two sentences, and
 * after this module one derivation.
 */
function jurisdictionKeysInBand(rows: Resource[], bandKey: string): string[] {
  return jurisdictionKeys(rows.filter((r) => bandFromPriority(r.priority).key === bandKey));
}

/** How many distinct jurisdictions hold at least one item in the given band. */
export function jurisdictionCountInBand(rows: Resource[], bandKey: string): number {
  return jurisdictionKeysInBand(rows, bandKey).length;
}
