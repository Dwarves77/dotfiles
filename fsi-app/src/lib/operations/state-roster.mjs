// state-roster.mjs — pure helpers for the Operations US state roster (WO-10, see
// docs/plans/operations-lane-spec-from-repo.md).
//
// SHRUNK (UI fix round 2026-09-08, item D3): `buildStateRoster` was the By-state sub-list's own
// union helper, and the operator's page-scope ruling removed that sub-list from /operations. It is
// deleted here with its tests rather than left dormant (CLAUDE.md rule 13). What remains is still
// live: STATE_LABELS is what the COVERAGE GAPS rail card artboard 08 draws counts its roster against
// (OperationsLedger.tsx).
//
// `state_cost_facts.state_label` is a live, populated column (confirmed 2026-08-30) but is not
//    in `fetchStateCostFacts`'s select list in supabase-server.ts (a reader-lane file this lane may
//    read but not write). Rather than adding a second reader-lane dependency for one more column,
//    STATE_LABELS is a static code -> label map for the closed, rarely-changing set of US state
//    names this surface currently needs: the 13 codes live in state_cost_facts today
//    (confirmed live 2026-08-30: US-AZ, US-CA, US-CO, US-FL, US-GA, US-IL, US-MA, US-NJ, US-NY,
//    US-OH, US-PA, US-TX, US-WA), plus US-NC — which OperationsLedger.tsx's regulation-matching
//    regex list also recognises but which carries zero state_cost_facts rows today (so it can be
//    regulation-matched and rendered with an honest "—" cost figure, same as before this change).

/** @type {Record<string, string>} */
export const STATE_LABELS = {
  "US-AZ": "Arizona",
  "US-CA": "California",
  "US-CO": "Colorado",
  "US-FL": "Florida",
  "US-GA": "Georgia",
  "US-IL": "Illinois",
  "US-MA": "Massachusetts",
  "US-NC": "North Carolina",
  "US-NJ": "New Jersey",
  "US-NY": "New York",
  "US-OH": "Ohio",
  "US-PA": "Pennsylvania",
  "US-TX": "Texas",
  "US-WA": "Washington",
};

/**
 * Normalize a `regional_data_facts.status` value for display. Returns null (never an empty string
 * or whitespace) so a caller can omit the badge cleanly with a single truthiness check — most of
 * the table's non-null-but-empty edge cases collapse to the same "don't render" outcome as an
 * actual null, rather than rendering a blank badge.
 *
 * @param {unknown} status
 * @returns {string|null}
 */
export function formatFactStatus(status) {
  if (typeof status !== "string") return null;
  const trimmed = status.trim();
  return trimmed.length > 0 ? trimmed : null;
}
