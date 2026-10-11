const DETERMINISTIC_GROUND_FAILURES = [
  "ungrounded_url", "missing_required_slot", "fact_below_authority_floor",
  "analysis_missing_label_syntax", "unlabeled_assertion", "legal_not_routed_to_callout",
];
export function isDeterministicGroundFailure(detail) {
  const d = detail || "";
  return DETERMINISTIC_GROUND_FAILURES.some((r) => d.includes(r));
}

const STRUCTURAL_GROUND_FAILURES = ["no source_id"];
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
