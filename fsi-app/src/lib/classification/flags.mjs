export const AXIS_NAMESPACE = "flywheel-axis:";

// The three finding subtypes propose-classifications.mjs emits under AXIS_NAMESPACE, each its own fixed
// createdBy(AXIS_NAMESPACE, subtype) string:
//   SOURCE_CLASSIFICATION_SUBTYPE — Axis 3/4/5 field proposals for one source (classify-source.mjs),
//     subject_type 'source'. The ONLY subtype apply-classifications.mjs will ever act on.
//   SOURCE_DRIFT_SUBTYPE — framework Section 5b: a source's observed item-category distribution has
//     drifted from its Axis-5 expected_output by more than the drift threshold. subject_type 'source'.
//     Advisory only — no apply target (framework names review, not an automatic re-classification).
//   ITEM_ANOMALY_SUBTYPE — framework Section 5c: one item's classified category carries less than the
//     anomaly threshold's expected probability under its source's Axis-5 distribution. subject_type
//     'item'. Advisory only, same reason.
export const SOURCE_CLASSIFICATION_SUBTYPE = "source-classification";
export const SOURCE_DRIFT_SUBTYPE = "source-drift";
export const ITEM_ANOMALY_SUBTYPE = "item-anomaly";

// D17 family 4 (defect-fix-plan-2026-09-12): a distinct subtype for "classify-source.mjs found nothing
// derivable", separate from SOURCE_CLASSIFICATION_SUBTYPE. Deliberately a DIFFERENT created_by (not just
// a different status on the same key): a later propose pass for the SAME source that now DOES derive a
// proposal must insert a fresh, normal, open source-classification flag rather than being blocked by
// dedup against this already-resolved row's identical (subject_ref, created_by) key -- the exact D15
// design this mirrors for the TAG namespace (see propose-tags.mjs's NO_DERIVABLE_SUBTYPE).
export const SOURCE_CLASSIFICATION_NO_DERIVABLE_SUBTYPE = "source-classification-no-derivable";
