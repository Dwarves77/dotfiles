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
