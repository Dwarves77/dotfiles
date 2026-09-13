// coverage-reflection.mjs -- D17 family 13 (defect-fix-plan-2026-09-12, ruling table row 13, lane L11).
//
// coverage-gap (U2, analyze-corpus.mjs's own gap detection) and anticipated-coverage (U5) findings are a
// PRODUCT-SCOPE reflection, not a question to a person -- the coordinator's own ruling (plan row 13,
// verbatim): "the writer inserts them already resolved with the note 'reflected in the coverage view; no
// per-row decision pending', the population report keeps counting them, and the open rows are resolved
// the same way on the first run." This is the D17/enumeration Family 13 shape: "Product-scope reflections,
// not questions to a person" (docs/audits/quarantine-and-human-flag-writers-2026-09-12.md) -- distinct
// from the D15/D13-shaped case (a question the system itself could answer but didn't try). No auto-adopt
// path existed or exists for these findings; they are informational by design, and an OPEN row asking an
// operator to "confirm whether dedicated coverage... is warranted" is exactly the resting state ADR-030's
// rider forbids.
//
// PURE, extracted out of analyze-corpus.mjs (a $0-gated top-level script that calls process.exit(2) at
// IMPORT TIME when DB creds are absent, so its own inline logic cannot be unit-tested by importing that
// file directly) into its own module -- the SAME "thin orchestrator hands off to a pure lib module" shape
// cluster.mjs / gaps.mjs / anticipate.mjs / signal-confidence.mjs already use in this same directory.

export const RESOLVED_REFLECTION_NOTE = "reflected in the coverage view; no per-row decision pending";

/**
 * Build one finding's integrity_flags row, ALREADY RESOLVED (never an open ask). Pure.
 * @param {{category:string, subject_type:string, subject_ref:string, description:string,
 *   recommended_actions:Array<object>|object, created_by:string}} finding
 * @param {string} resolvedBy
 * @param {string} nowIso
 * @returns {object}
 */
export function buildResolvedReflectionRow(finding, resolvedBy, nowIso) {
  return {
    category: finding.category,
    subject_type: finding.subject_type,
    subject_ref: finding.subject_ref,
    description: finding.description,
    recommended_actions: finding.recommended_actions,
    created_by: finding.created_by,
    status: "resolved",
    resolved_at: nowIso,
    resolved_by: resolvedBy,
    resolution_note: RESOLVED_REFLECTION_NOTE,
  };
}

/**
 * Pure: which of `fresh` findings are genuinely new -- STATUS-AGNOSTIC dedup against every existing row
 * (open OR resolved) sharing (subject_ref, created_by). This is the same fix analyze-corpus.mjs's own L4
 * signal path already applies (review-7.2.md finding 2: "a still-reproducing candidate whose flag just
 * moved to 'resolved' no longer showed up in an open-only read, so it looked 'brand new' again and was
 * re-inserted as a DUPLICATE resolved row every re-run"), generalized to this family -- required here
 * because EVERY row this family writes is born resolved, so an open-only dedup would re-insert a
 * duplicate on literally every run.
 * @param {Array<{subject_ref:string, created_by:string}>} existingAnyStatus
 * @param {Array<{subjectRef:string, row:{created_by:string}}>} fresh
 * @returns {{newRows: object[], unchanged: number}}
 */
export function planResolvedReflectionInserts(existingAnyStatus, fresh) {
  const existingKeys = new Set((existingAnyStatus ?? []).map((r) => `${r.subject_ref}|${r.created_by}`));
  const list = fresh ?? [];
  const newRows = list.filter((f) => !existingKeys.has(`${f.subjectRef}|${f.row.created_by}`)).map((f) => f.row);
  return { newRows, unchanged: list.length - newRows.length };
}
