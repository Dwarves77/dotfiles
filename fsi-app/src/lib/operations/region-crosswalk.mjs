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
