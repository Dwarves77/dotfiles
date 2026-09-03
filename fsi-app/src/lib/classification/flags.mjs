// flags.mjs — AXIS's own integrity_flags created_by namespace.
//
// The shared namespace registry (src/lib/connections/flag-namespaces.mjs, GAP_NAMESPACE /
// ANTICIPATE_NAMESPACE / SIGNAL_NAMESPACE / FLYWHEEL_DEFECT_NAMESPACE / TAG_NAMESPACE / ALL_NAMESPACES)
// lives outside this lane's write set (fsi-app/src/lib/classification/** and fsi-app/scripts/
// classification/** only — docs/plans/wave2-lanes-2026-09-02.md's AXIS row). Rather than edit a shared
// file this lane does not own, AXIS_NAMESPACE is declared here, in this lane's own directory, following
// the exact same construction rule flag-namespaces.mjs's createdBy() enforces (must end in ':', so a
// `created_by LIKE 'flywheel-axis:%'` scan can never false-positive-match a differently-named namespace
// that merely shares a prefix). propose-classification.mjs imports the GENERIC createdBy/buildSubjectRef
// helpers from flag-namespaces.mjs (read-only reuse — those two functions take a namespace as a
// parameter and have no per-namespace state) rather than duplicating them.
//
// NOT added to flag-namespaces.mjs's ALL_NAMESPACES: that registry is exercised only by its own test
// (flag-namespaces.test.mjs — self-referential, not consumed by analyze-corpus.mjs or any fitness gate;
// confirmed by grep) and is informational, not enforced. Isolation for this namespace's dedup/resolve
// scan comes from propose-classifications.mjs's own per-subtype EXACT `created_by` match (each subtype
// below is one fixed string, not a prefix scan — see that script's file header for why an exact match
// is safer here than the `.like(ns + '%')` scan the TAG namespace uses: three subtypes share this one
// namespace and a prefix-only scope would let a narrow single-subtype run mistake a DIFFERENT subtype's
// still-fresh flag on the same subject_ref for stale, per that file's own analysis).
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
