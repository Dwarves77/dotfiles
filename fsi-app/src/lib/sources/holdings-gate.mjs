// @ts-check
// NO-EXECUTION-FROM-STALE-STATE — the FETCH-SEAM guard (operator ruling 2026-07-14). The template instance of
// the doctrine: an effectful mechanism re-verifies its OWN precondition against LIVE state as its first act; a
// plan / manifest / dispatch that says "this item needs a fetch" is a PROPOSAL, never authority for the effect.
// A fetch is admitted ONLY on genuine holdings-absence; usable held content (a real snapshot OR >=2 content-
// bearing pool rows) refuses the fetch at the seam, for every caller — killing the fetch-when-held waste class
// (the o9 re-fetch: 76KB snapshot already held, re-fetched, bought nothing). Deliberate freshness is the single
// explicit escape (forceRefresh), never the default. Pure core here; the DB read + wiring live in the pipeline.

/** A snapshot at/below this byte size is a stub/error capture (e.g. a 175-byte JS shell), not real content. */
export const SNAPSHOT_STUB_MAX = 1000;
/** ">=1 thin pool row" is absence (operator criterion); >=2 content-bearing pool rows is presence. */
export const MIN_USABLE_POOL_ROWS = 2;
export const HOLDINGS_PRESENT_DETAIL =
  "holdings_present: a usable snapshot/pool already exists — refusing to fetch (no-execution-from-stale-state; " +
  "delta-only). Re-ground from stored (generateBriefFromStored) instead of paying to re-fetch held content.";

/**
 * PURE. Are usable holdings present for an item? present = a real (non-stub) snapshot OR >=2 content-bearing
 * pool rows. Absence — the ONLY state that admits a fetch — is: no real snapshot AND <=1 thin pool row.
 * @param {{ snapshotBytes?: number, usablePoolRows?: number }} h
 * @returns {boolean}
 */
export function holdingsPresent({ snapshotBytes = 0, usablePoolRows = 0 } = {}) {
  return Number(snapshotBytes) > SNAPSHOT_STUB_MAX || Number(usablePoolRows) >= MIN_USABLE_POOL_ROWS;
}

/**
 * The precondition POSTURE a paid fetch caller records on its spend ticket (amendment 1): the live-state check
 * it passed, so authorized-but-wasteful spend is machine-visible at the moment of spend. A paid fetch row whose
 * ticket lacks this record is the new spend-watch alarm class (same severity as an unticketed row).
 * @param {{ snapshotBytes?: number, usablePoolRows?: number }} h
 * @returns {{ check: string, result: 'confirmed_absent'|'present', snapshotBytes: number, usablePoolRows: number }}
 */
export function holdingsPrecondition({ snapshotBytes = 0, usablePoolRows = 0 } = {}) {
  return {
    check: "holdings-absence",
    result: holdingsPresent({ snapshotBytes, usablePoolRows }) ? "present" : "confirmed_absent",
    snapshotBytes: Number(snapshotBytes),
    usablePoolRows: Number(usablePoolRows),
  };
}
