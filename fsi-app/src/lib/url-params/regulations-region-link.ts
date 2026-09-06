/**
 * regulations-region-link.ts — the ONE link builder for a region-scoped deep link into the
 * Regulations ledger (P2 fix, 2026-09-06).
 *
 * BUG (operator, 2026-09-06): "'Open EU regulations →' in Operations drops the jurisdiction
 * filter, lands on all 1,316 regulations instead of the 778 EU-scoped." ROOT CAUSE [CONFIRMED] by
 * reading: OperationsLedger's D1Body built its href as
 * `/regulations?region=${regionKey.toLowerCase()}` — a single group LABEL ("eu") — while
 * RegulationsLedger's `handleFilterParams` (RegulationsLedger.tsx) only recognizes an INDIVIDUAL
 * Tier-1 ISO CODE and checks it against `TIER1_PRIORITY_ISOS`
 * (src/lib/tier1-priority-jurisdictions.ts), a flat set of per-country/state codes that has no
 * "EU" entry (the EU group's 27 member ISOs are in the set individually, the group token is not).
 * `upperRegion="EU"` therefore fails `TIER1_PRIORITY_ISOS.has("EU")`, the filter is silently
 * dropped (PERF-10's "invalid value ignored" contract, working exactly as designed against a value
 * it was never built to receive), and the ledger falls back to its unfiltered 1,316-row view.
 *
 * The regulation actually shown as "in scope" for a region in Operations is computed by
 * `resolveRegionCode` (src/lib/operations/region-crosswalk.mjs) against that region's own
 * `isoCodes` array (e.g. EU → ["EU","DE","NL","BE","FR","IT","ES"]) — a DIFFERENT, richer code set
 * than `TIER1_PRIORITY_ISOS` (it includes the "EU" supranational code itself, which the Tier-1
 * roster — built for state/country-level coverage-gap tracking, not for this cross-ref — never
 * carries). So the fix is not "make the ledger recognize a group label" (a second parallel
 * region-vocabulary the ledger would have to keep in sync with Operations' own by hand); it is:
 * ONE function, imported by both surfaces, that turns a region's real iso-code list into the
 * deep-link and back — so the ledger filters on EXACTLY the codes Operations used to compute the
 * count the link's own label promises.
 */

export const REGULATIONS_REGION_PARAM = "region";

/** Normalize a raw iso-code list: trim, uppercase, drop empties/duplicates/malformed tokens. */
export function normalizeRegionIsoCodes(raw: readonly string[] | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of raw ?? []) {
    const up = String(c ?? "").trim().toUpperCase();
    if (up && /^[A-Z0-9-]{2,10}$/.test(up) && !seen.has(up)) {
      seen.add(up);
      out.push(up);
    }
  }
  return out;
}

/**
 * Build the Regulations ledger href for a region, encoding its FULL iso-code set (not a short
 * label) so the ledger's filter matches the same rows the caller counted. Returns the bare
 * `/regulations` path (no filter) when the code list is empty rather than a broken query string.
 */
export function buildRegulationsRegionHref(isoCodes: readonly string[] | null | undefined): string {
  const clean = normalizeRegionIsoCodes(isoCodes);
  if (clean.length === 0) return "/regulations";
  return `/regulations?${REGULATIONS_REGION_PARAM}=${encodeURIComponent(clean.join(","))}`;
}

/** Parse a `?region=` param value (comma-separated iso codes) back into a normalized list. */
export function parseRegulationsRegionParam(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return normalizeRegionIsoCodes(raw.split(","));
}
