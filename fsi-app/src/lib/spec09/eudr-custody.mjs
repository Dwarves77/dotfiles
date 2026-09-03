// eudr-custody.mjs — spec 09 §1.8's two distinct gaps, one theme: "the operational consequence is a
// border hold, not a later fine". This module classifies both eudr_plot_claims.hold_risk and
// custody_chains.double_count_check into the SAME liability-vs-data-quality distinction spec text draws,
// so one renderer can apply it consistently across both tables. No fs, no I/O.

/**
 * hold_risk severity class for a UI treatment — NOT the origin_class/derivation envelope vocabulary (a
 * different question). 'border_hold' is a BLOCKING OPERATIONAL ALERT (spec text, verbatim): "a missing
 * polygon does not cost money later, it stops the container now". Returns a severity tier a renderer can
 * switch on directly, plus the exact reason text, rather than leaving the caller to reconstruct the
 * classification from validation_state.
 */
export function classifyHoldRisk(holdRisk) {
  switch (holdRisk) {
    case "border_hold":
      return Object.freeze({
        severity: "blocking",
        label: "Border hold",
        detail: "Operational: this consignment can be held at the border NOW. Not a monetary exposure — do not render alongside a cost figure.",
      });
    case "documentary":
      return Object.freeze({
        severity: "warning",
        label: "Documentary risk",
        detail: "A documentation gap that has not yet escalated to a hold risk.",
      });
    case "none":
      return Object.freeze({ severity: "clear", label: "No hold risk", detail: null });
    default:
      return Object.freeze({
        severity: "unknown",
        label: "Hold risk not classified",
        detail: `unrecognised hold_risk value: ${JSON.stringify(holdRisk)}`,
      });
  }
}

/** Derive the hold_risk a validation_state alone would suggest, for a producer that has not yet stated
 *  hold_risk explicitly. NEVER upgrades a caller-supplied hold_risk (that value is stored, not
 *  recomputed at read time — spec 09 §2.1's "materialise it" rule) — this is only for a WRITE-time
 *  default when no explicit hold_risk was given. */
export function suggestHoldRiskFromValidationState(validationState) {
  switch (validationState) {
    case "missing":
    case "malformed":
      return "border_hold"; // no usable geolocation at all — the EUDR-cutoff-facing state.
    case "fails_cutoff":
      return "documentary"; // geolocation exists but the plot fails the deforestation-cutoff check.
    case "valid":
      return "none";
    default:
      return null;
  }
}

/**
 * double_count_check severity class — the SAME liability-vs-data-quality distinction as hold_risk,
 * applied to custody. 'conflict_detected' is a LIABILITY (spec text, verbatim): "two parties claiming one
 * SAF batch is a compliance exposure for both" — not a data-quality flag.
 */
export function classifyDoubleCountRisk(doubleCountCheck) {
  switch (doubleCountCheck) {
    case "conflict_detected":
      return Object.freeze({
        severity: "blocking",
        label: "Double-claim conflict",
        detail: "A compliance liability for both claiming parties, not a data-quality flag. Do not render alongside a routine data-completeness chip.",
      });
    case "single_claim_confirmed":
      return Object.freeze({ severity: "clear", label: "Single claim confirmed", detail: null });
    case "unverified":
      return Object.freeze({
        severity: "warning",
        label: "Unverified",
        detail: "No conflict confirmed yet, but the claim has not been checked against the registry.",
      });
    default:
      return Object.freeze({
        severity: "unknown",
        label: "Double-count status not classified",
        detail: `unrecognised double_count_check value: ${JSON.stringify(doubleCountCheck)}`,
      });
  }
}

/** True for either table's "blocking" severity tier — the one shared predicate a renderer needs to
 *  decide whether an alert belongs in the blocking-alert visual class at all. */
export function isBlockingSeverity(classification) {
  return classification?.severity === "blocking";
}
