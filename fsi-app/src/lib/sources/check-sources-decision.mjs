// Pure decision for the per-source accessibility assessment (the #4 fix), extracted so the
// composition is fixture-testable WITHOUT touching prod. Given the reachability OUTCOME + the
// source's current counters, returns what the route should record and whether the row is
// evict-ELIGIBLE. The d3 guard still decides the ACTUAL eviction (a DB call kept in the route);
// this only says whether the guard may be consulted.
//
// THE BUG-CLASS INVARIANT: a non-answer (INCONCLUSIVE) is NOT accessible but is NEVER
// evict-eligible — only a definitive DEAD (404/410) with a 0 accessible-streak is. No DB, no Date.
import { REACH } from "./reachability.mjs";

/**
 * @param {{outcome?: string, source?: {status?: string, consecutive_accessible?: number}}} [input]
 * @returns {{isAccessible: boolean, reactivate: boolean, evictEligible: boolean, consecutive_accessible: number}}
 */
export function decideSourceAssessment({ outcome, source = {} } = {}) {
  if (outcome === REACH.REACHABLE) {
    return {
      isAccessible: true,
      reactivate: source.status === "inaccessible", // a previously-evicted source comes back
      evictEligible: false,
      consecutive_accessible: (source.consecutive_accessible ?? 0) + 1,
    };
  }
  // Not accessible — INCONCLUSIVE (non-answer) or DEAD (404/410).
  return {
    isAccessible: false,
    reactivate: false,
    // ONLY a definitive DEAD with a 0 streak may consult the eviction guard; a non-answer NEVER does.
    evictEligible: outcome === REACH.DEAD && (source.consecutive_accessible ?? 0) === 0,
    consecutive_accessible: 0,
  };
}
