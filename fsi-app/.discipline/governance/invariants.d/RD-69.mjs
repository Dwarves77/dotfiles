// RD-69: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'RD-69',
    skill: 'remediation-discipline',
    section: 'Section 4 - category 45: one home per concept, and the count of copied code can only fall',
    text: 'The total of duplicated normalized lines across fsi-app/src and fsi-app/scripts (tests, fixtures, archive, run artifacts and snapshots excluded) must equal the committed ceiling in F45-duplicate-code.mjs: above it the build fails naming the clone pair, below it the build fails naming the value to re-seed, so the ceiling only moves down and in the same commit that removes the duplication.',
    anchor: '### Section 4 - category 45: one home per concept, and the count of copied code can only fall',
    enforcedBy: [
      'fitness:F45',
      'selftest:fsi-app/.discipline/fitness/functions/F45-duplicate-code.test.mjs',
    ],
    residual: 'F45 is an exact-window clone scan (8 normalized lines): it catches copies, not re-implementations that share no lines (the EUR-Lex incident itself would have passed it). The host-home gate F46 (lane L31) covers external routes; the database census gate covers tables and functions with no reference; both are owed and named in docs/audits/system-health-audit-2026-09-17.md. The ceiling is a count, not a disposition: green says duplication did not grow, not that the families in the audit were removed.',
  };
