// @ts-check

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
