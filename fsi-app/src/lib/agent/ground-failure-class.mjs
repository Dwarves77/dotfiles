// PURE ground-failure classification (Fix B, RD-22). Extracted from generate-brief.ts so the golden imports
// it WITHOUT the workflow/WDK dependency chain (depless — runs in the canonical suite). generate-brief.ts's
// retry ladder consumes groundRetryPlan; the meaning of each class:
//
//  - STRUCTURAL   ("no source_id"): non-recoverable by re-ground OR re-research — the item is structurally
//    broken (no source to ground against). Re-research widens the SOURCE POOL, which cannot conjure a source
//    LINK, so both retry passes are guaranteed waste. Routes STRAIGHT to held-for-re-source. Checked FIRST.
//  - DETERMINISTIC (brief-content flaw: off-pool url, missing slot, below-floor source, label syntax): a
//    re-ground re-extracts and re-fails IDENTICALLY, so skip the cheap re-ground and go to reresearch.
//  - otherwise (transient/unknown): try the cheap stochastic re-ground first (a re-roll may recover it).

export const DETERMINISTIC_GROUND_FAILURES = [
  "ungrounded_url", "missing_required_slot", "fact_below_authority_floor",
  "analysis_missing_label_syntax", "unlabeled_assertion", "legal_not_routed_to_callout",
];
export function isDeterministicGroundFailure(detail) {
  const d = detail || "";
  return DETERMINISTIC_GROUND_FAILURES.some((r) => d.includes(r));
}

export const STRUCTURAL_GROUND_FAILURES = ["no source_id"];
export function isStructuralGroundFailure(detail) {
  const d = detail || "";
  return STRUCTURAL_GROUND_FAILURES.some((r) => d.includes(r));
}

/** Maps a ground-failure detail to the ladder action: "structural_hold" | "reresearch_only" | "reground".
 *  Structural is checked FIRST, so "zero re-research on a structural wall" is a property of this function. */
export function groundRetryPlan(detail) {
  if (isStructuralGroundFailure(detail)) return "structural_hold";
  if (isDeterministicGroundFailure(detail)) return "reresearch_only";
  return "reground";
}
