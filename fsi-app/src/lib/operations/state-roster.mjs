// state-roster.mjs — pure helpers for the Operations "By-state" sub-list (WO-10, see
// docs/plans/operations-lane-spec-from-repo.md). Two defects this file closes:
//
// 1. The By-state roster used to come ONLY from `regs.map(usStateForResource)` in
//    OperationsLedger.tsx — a state with a sourced cost fact but no regulation whose title/note
//    happened to match a hand-written regex never got a row, even though its figure was sitting in
//    `state_cost_facts` the whole time. `buildStateRoster` below takes the UNION of {states matched
//    by a regulation} and {states present in the state_cost_facts map}, so every state carrying a
//    sourced cost fact can render — honestly showing 0 regs when no regulation matched, never
//    dropped.
// 2. `state_cost_facts.state_label` is a live, populated column (confirmed 2026-08-30) but is not
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
 * Build the By-state roster as the UNION of regulation-matched states and cost-fact states — never
 * the intersection, and never dropping one side silently.
 *
 * @param {{code: string, label?: string|null, regs?: unknown[]}[]} regionEntries - one entry per
 *   state a US regulation was matched to (regulation cross-ref data), each carrying its own `regs`
 *   array (kept verbatim so callers can still show "N regs" / render titles).
 * @param {Iterable<string>} costStateCodes - state codes present in the sourced state_cost_facts
 *   map (e.g. a `Map`'s `.keys()`). A code here with no matching `regionEntries` entry still gets a
 *   roster row, with an empty `regs` array — "0 regs" is shown honestly, the state is never hidden.
 * @returns {{code: string, label: string, regs: unknown[]}[]} sorted by regs count (desc), then
 *   code (asc) for a deterministic, any-input-order-identical render.
 */
export function buildStateRoster(regionEntries, costStateCodes) {
  const entries = Array.isArray(regionEntries) ? regionEntries : [];
  const costCodes = costStateCodes ? Array.from(costStateCodes) : [];
  const byCode = new Map();

  for (const entry of entries) {
    if (!entry || typeof entry.code !== "string" || !entry.code) continue;
    byCode.set(entry.code, {
      code: entry.code,
      label: entry.label || STATE_LABELS[entry.code] || entry.code,
      regs: Array.isArray(entry.regs) ? entry.regs : [],
    });
  }

  for (const code of costCodes) {
    if (typeof code !== "string" || !code || byCode.has(code)) continue;
    byCode.set(code, { code, label: STATE_LABELS[code] || code, regs: [] });
  }

  return Array.from(byCode.values()).sort(
    (a, b) => b.regs.length - a.regs.length || a.code.localeCompare(b.code)
  );
}

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
