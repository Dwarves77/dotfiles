// region-crosswalk.mjs — the ONE region-grouping lookup for OperationsLedger's D1 cross-reference
// count (WO-22, docs/plans/operations-lane-spec-from-repo.md).
//
// PURE: no React, no DOM, no DB, no npm.
//
// WHY THIS EXISTS. `OperationsLedger.tsx` used to group regulations into region cards with a
// hand-written `Record<string, RegExp[]>` (`REGION_MATCH`) tested against
// `${resource.jurisdiction} ${resource.title}` — a second, independently-maintained, strictly
// weaker copy of the lookup `resolveItemRegionCodes` in
// `src/lib/agent/formats/operations-matrix.ts` already gets right against the canonical
// `regions.iso_codes` crosswalk (live, confirmed 2026-08-30: EU→[EU,DE,NL,BE,FR,IT,ES],
// US→[US,US-CA,US-NY,US-TX], ASIA→[SG,HK,CN,JP,KR], UK→[GB], UAE→[AE]).
//
// CONCRETE, TRACED regression the old regex had (found live this session, not merely inferred):
// intelligence_items row ca7d3a75-b606-4517-9ff9-7624b4edc566, item_type='framework',
// jurisdictions=['FR'], title "French Senate (Sénat) - Parliamentary Portal and Institutional
// Framework". The old EU pattern list has no rule for the bare code "FR" and no rule that matches
// the word "French" (only `/\bfrance\b/i`, the country name) — so this regulation was silently
// grouped into NO region at all, invisible to every region's D1 count. `resolveRegionCode` below
// matches "FR" directly against EU's `iso_codes` set and resolves it correctly.
//
// FALLBACK ORDER mirrors `resolveItemRegionCodes` (operations-matrix.ts) exactly: prefer the
// structured `jurisdictionIso` array when non-empty, fall back to the single legacy `jurisdiction`
// string only when it is empty — never both at once, never silently preferring the weaker source
// when the stronger one is present.
//
// NOT extended to a general free-text fallback: rule 0.15 (this session, live query against
// kwrsbpiseruzbfwjpvsp) found the `jurisdictions` column on every regulation-type row holds clean
// ISO/region/supranational codes (EU, DE, US-CA, ASIA, ICAO, OECD, GLOBAL, ...) — never bare words
// like "Singapore" or "Hong Kong" — so a title-text regex has nothing left to catch that the
// crosswalk doesn't already resolve correctly (or correctly leave unresolved, for codes this
// platform tracks no region for, e.g. OECD/ICAO/IMO/GLOBAL/LATAM). The old regex's title-scanning
// is not carried forward in any form.

const arr = (x) => (Array.isArray(x) ? x : []);

/**
 * @param {{code: string, isoCodes?: string[] | null}[]} regions - region roster, in the order
 *   they should be checked (first matching region wins; the live roster has no code appearing in
 *   two regions' sets, so order does not matter in practice, but a caller-supplied order is
 *   respected rather than re-sorted).
 * @param {{jurisdictionIso?: string[] | null, jurisdiction?: string | null}} item - the resource's
 *   structured jurisdiction codes (preferred) and/or single legacy jurisdiction string (fallback).
 * @returns {string | null} the matching region's `code`, or null when no region's code/iso_codes
 *   set contains any of the item's jurisdiction codes (including when the item carries none at all).
 */
export function resolveRegionCode(regions, item) {
  const roster = arr(regions).filter((r) => r && typeof r.code === "string" && r.code);
  const isoList = arr(item?.jurisdictionIso).filter((c) => typeof c === "string" && c);
  const itemCodes = isoList.length > 0 ? isoList : typeof item?.jurisdiction === "string" && item.jurisdiction ? [item.jurisdiction] : [];
  if (itemCodes.length === 0) return null;

  const upperItemCodes = itemCodes.map((c) => c.toUpperCase());
  for (const region of roster) {
    const regionCodes = new Set([region.code.toUpperCase(), ...arr(region.isoCodes).map((c) => String(c).toUpperCase())]);
    for (const c of upperItemCodes) {
      if (regionCodes.has(c)) return region.code;
    }
  }
  return null;
}
