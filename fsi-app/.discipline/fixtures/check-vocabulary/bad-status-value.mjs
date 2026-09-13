// Fixture for check-vocabulary.test.mjs's negative test. Lives under a `fixtures` directory so it is
// never itself picked up by discoverScanTargets's real scan (scripts/maintenance, scripts/turns,
// src/app/api, src/lib) and is exempt from discipline rule 022 (a `fixtures` directory) if it ever
// needed a verbatim glyph, which it does not here.
//
// Shaped like a real write call (guardedInsert), the same shape findWriteCallWindows anchors on, so the
// fixture proves the WHOLE mechanism (write-call scoping + vocabulary check), not only the low-level
// regex. Deliberately WRONG: "not_a_real_status_value" is not on any table's tracked allowed set for
// `status`. The test asserts the detector actually fires against this file, not merely that no
// violations were found because nothing was scanned (the break-it-confirm-red discipline this repo's
// other detectors hold themselves to).
export async function writeBadRow(deps) {
  return deps.guardedInsert("sources", { status: "not_a_real_status_value" });
}
