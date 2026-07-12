// PURE core of the source-link live-data invariant (Fix A, RD-22). Importable by BOTH the audit script
// (scripts/verify/source-link-audit.mjs) and the golden (source-link-invariant.test.mjs) — no side effects.
//
// INVARIANT: a LIVE (non-archived) intelligence_items row MUST have a source_id. A mint cannot produce a
// source-less live item (grounding grounds against the item's source, so a source_id=NULL item can never
// verify). Enforced at the mint chokepoint (mint-item.ts sourceLinkDecision) AND surfaced here over live data.
//
// GRANDFATHER (scoped post-cutover): the two 2026-07-12 manual-intake orphans (eFTI 2020/1056 + waste
// 2024/1157) pre-date the chokepoint gate; their re-sourcing is Unit 3 (quarantine population) work, NOT this
// unit. They are the documented allowlist so the audit does not hard-fail on the known pre-cutover backlog;
// the list should only ever SHRINK (Unit 3 removes each as it re-sources it). Historical ARCHIVED source-less
// rows are exempt by the is_archived filter (the invariant is about LIVE rows).

export const GRANDFATHERED_SOURCELESS = Object.freeze([
  "770596e6-aeb2-46f9-ad29-a83e16f06fad", // eFTI 2020/1056 — pre-cutover manual-intake orphan; Unit 3 re-source
  "68af8b45-fbbf-4ba1-add8-2c1761d2d120", // waste 2024/1157 — pre-cutover manual-intake orphan; Unit 3 re-source
]);

/**
 * Return the LIVE source-less violations: rows with source_id == null AND is_archived === false, minus the
 * grandfather allowlist. A non-empty result is the tripwire (a new source-less live mint slipped the gate).
 */
export function findSourceLessLiveViolations(rows, grandfatherIds = GRANDFATHERED_SOURCELESS) {
  const gf = new Set(grandfatherIds);
  return (rows || []).filter(
    (r) => r.source_id == null && r.is_archived === false && !gf.has(r.id)
  );
}
