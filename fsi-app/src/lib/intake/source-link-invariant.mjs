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
