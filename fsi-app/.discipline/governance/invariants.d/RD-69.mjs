// RD-69: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'RD-69',
    skill: 'remediation-discipline',
    section: 'Section 4 - category 45: one home per concept, and the count of copied code can only fall',
    text: 'The total of duplicated normalized lines across fsi-app/src and fsi-app/scripts (tests, fixtures, archive, run artifacts and snapshots excluded), measured on HEAD by F45-duplicate-code.mjs, must not exceed the SAME measurement taken on the merge-base tree with origin/master: above it the build fails naming the delta and the clone pairs among the files changed on this branch; nothing is stored, so the comparison is always to the tree at check time, never to a committed number two lanes could collide on (plan 6.8, Rule B).',
    anchor: '### Section 4 - category 45: one home per concept, and the count of copied code can only fall',
    enforcedBy: [
      'fitness:F45',
      'selftest:fsi-app/.discipline/fitness/functions/F45-duplicate-code.test.mjs',
    ],
    residual: 'F45 is an exact-window clone scan (8 normalized lines): it catches copies, not re-implementations that share no lines (the EUR-Lex incident itself would have passed it). The host-home gate F46 (lane L31) covers external routes; the database census gate covers tables and functions with no reference; both are owed and named in docs/audits/system-health-audit-2026-09-17.md. The gate is a ratchet against the merge-base with origin/master (lane N4, plan 6.8 Rule B, 2026-09-19), not a disposition: green says HEAD did not add more duplication than was already on the branch it started from, not that the families in the audit were removed. A branch cut from an already-duplicated base can carry that duplication forward without tripping this gate; only NEW duplication added within the branch\'s own range fails it.',
  };
