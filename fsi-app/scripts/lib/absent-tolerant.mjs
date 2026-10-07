// absent-tolerant.mjs (lane G5-NEED, 2026-10-07): the one home of "this read may fail only because a migration is not
// applied yet". Both term-recurrence.mjs (G5-TERMS) and raise-term-needs.mjs (G5-NEED) read the vocabulary tables
// migration 355 creates and must report `tables_absent` in a dry run instead of crashing; the pattern lived in both
// files until F45 named the clone pair.

export const ABSENT_RE = /does not exist|could not find|schema cache|relation .* does not exist|column .* does not exist/i;

/** True when `e` is the error a read raises because a table or column is not there yet. @param {unknown} e */
export function isAbsentError(e) {
  return ABSENT_RE.test(e instanceof Error ? e.message : String(e));
}

/** Run a read that may fail because a migration is not applied yet. @returns {Promise<{rows: object[], absent: boolean}>} */
export async function readTolerant(fn) {
  try {
    return { rows: (await fn()) ?? [], absent: false };
  } catch (e) {
    if (isAbsentError(e)) return { rows: [], absent: true };
    throw e;
  }
}
