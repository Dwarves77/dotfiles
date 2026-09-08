/**
 * jurisdiction-rollup — THE one derivation of "which jurisdiction is this
 * item in" and "how many jurisdictions are live", for every surface that
 * states a jurisdiction figure.
 *
 * WHY THIS FILE EXISTS (production defect, click-through audit 2026-09-08,
 * /map): one screen printed three different jurisdiction counts and two
 * different immediate-jurisdiction counts. Root cause [CONFIRMED by reading
 * both call sites on train 60]: the masthead in src/app/map/page.tsx keyed
 * every item as `r.jurisdiction || "global"`, while the body in
 * src/components/map/MapPageView.tsx keyed it as
 * `r.jurisdiction || getJurisdiction(r) || "global"`. An item whose
 * `jurisdiction` column is blank but whose title/tags name a jurisdiction
 * therefore collapsed into "global" in the masthead and resolved to its real
 * jurisdiction in the register, so the masthead under-counted the distinct
 * set ("6 jurisdictions live") against the register's own rollup of the same
 * rows ("8 jurisdictions"), and the same divergence gave "4 jurisdictions
 * with immediate items" beside a rail card headed "IMMEDIATE · 3
 * JURISDICTIONS".
 *
 * The fix is not to patch either display: it is that there is now exactly one
 * key function and one rollup, and both surfaces call it. A future surface
 * that needs the same figure imports it rather than inlining a third variant.
 */

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
export function jurisdictionKeysInBand(rows: Resource[], bandKey: string): string[] {
  return jurisdictionKeys(rows.filter((r) => bandFromPriority(r.priority).key === bandKey));
}

/** How many distinct jurisdictions hold at least one item in the given band. */
export function jurisdictionCountInBand(rows: Resource[], bandKey: string): number {
  return jurisdictionKeysInBand(rows, bandKey).length;
}
