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
