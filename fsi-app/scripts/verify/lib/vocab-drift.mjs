// @ts-check
// Pure diff core for check-vocabulary-drift.mjs (D7 part 3, docs/plans/defect-fix-plan-2026-09-12.md).
// Separated from the runner (which has top-level DB-connecting execution, per this repo's own pg-direct
// audit convention, e.g. scripts/verify/lib/schema-drift.mjs vs schema-drift-audit.mjs) so a test can
// import the comparison logic without importing a module that immediately tries to connect to Postgres.

/**
 * Compare live entries (from the live pg_constraint query) against the tracked doc's entries, both
 * keyed by constraint name (unique in Postgres). Returns:
 *   - drift: a constraint present on BOTH sides whose allowed set (order-independent) differs. Both
 *     sides `allowed: null` (both unparsed the same way) counts as agreement; a null-vs-array mismatch
 *     (the parser started or stopped succeeding on one side) is genuine drift.
 *   - onlyLive: a constraint live but absent from the tracked JSON (a migration ran with no re-seed).
 *   - onlyTracked: a constraint tracked but no longer live (dropped, or the tracked JSON is stale).
 * @param {Array<{constraint:string, table:string, column:string|null, allowed:string[]|null}>} liveEntries
 * @param {Array<{constraint:string, table:string, column:string|null, allowed:string[]|null}>} trackedEntries
 */
export function diffVocabulary(liveEntries, trackedEntries) {
  const byName = (entries) => new Map(entries.map((e) => [e.constraint, e]));
  const live = byName(liveEntries);
  const tracked = byName(trackedEntries);

  const allowedEqual = (a, b) => {
    if (a === null && b === null) return true;
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    const sa = new Set(a);
    const sb = new Set(b);
    if (sa.size !== sb.size) return false;
    for (const v of sa) if (!sb.has(v)) return false;
    return true;
  };

  const drift = [];
  const onlyLive = [];
  const onlyTracked = [];

  for (const [name, liveEntry] of live) {
    const trackedEntry = tracked.get(name);
    if (!trackedEntry) { onlyLive.push(liveEntry); continue; }
    if (!allowedEqual(liveEntry.allowed, trackedEntry.allowed)) {
      drift.push({ constraint: name, table: liveEntry.table, column: liveEntry.column, live: liveEntry.allowed, tracked: trackedEntry.allowed });
    }
  }
  for (const [name, trackedEntry] of tracked) {
    if (!live.has(name)) onlyTracked.push(trackedEntry);
  }

  return { drift, onlyLive, onlyTracked };
}
