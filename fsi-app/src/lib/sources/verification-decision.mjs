// Pure decision for verifyCandidate's reachability gate, extracted so the composition is
// fixture-testable WITHOUT touching prod. The reachability OUTCOME maps to a SHORT-CIRCUIT verdict
// taken BEFORE aggregateTier (content + AI). No I/O.
//
// THE BUG-CLASS INVARIANT: INCONCLUSIVE (non-answer: 429/5xx/timeout/abort/dns/403/render-fail)
// -> tier M -> QUEUED-PROVISIONAL (operator review), NOT rejected. DEAD (definitive 404/410) ->
// tier L -> REJECTED (a genuine negative). REACHABLE -> no short-circuit (verifyCandidate falls
// through to content fetch + Haiku + aggregateTier).
import { reachabilityTier } from "./reachability.mjs";

/**
 * @param {string} [outcome]
 * @returns {{shortCircuit: false} | {shortCircuit: true, tier: 'M'|'L', action: string, rejection_reason: string}}
 */
export function decideReachabilityAction(outcome) {
  const v = reachabilityTier(outcome); // null (reachable) | { tier:'M'|'L', rejection_reason }
  if (!v) return { shortCircuit: false };
  return {
    shortCircuit: true,
    tier: v.tier,
    action: v.tier === "M" ? "queued-provisional" : "rejected",
    rejection_reason: v.rejection_reason,
  };
}
