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
