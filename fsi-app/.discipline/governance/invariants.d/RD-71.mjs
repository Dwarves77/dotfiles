// RD-71: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'RD-71',
    skill: 'remediation-discipline',
    section: 'Section 4 - category 45: one home per concept, and the count of copied code can only fall',
    text: 'Every table and function the committed migration tree defines is referenced by code or by SQL outside its own DDL, and every written table has a reader; the counts of unreferenced and unread tables equal their committed ceilings (both-ways ratchets) and dead functions are zero; operator keep-decisions live in a reason-bearing dated allowlist the gate audits.',
    anchor: 'Every table and function the committed migration tree defines MUST be referenced by code or by SQL',
    enforcedBy: [
      'fitness:F47',
      'selftest:fsi-app/.discipline/fitness/functions/F47-db-object-reference.test.mjs',
    ],
    residual: 'F47 is static: it replays the committed migrations (equal to the live catalog on 2026-09-17: 120 tables, 6 views, 95 functions) and cannot see objects that exist live without a migration; that class is RD-49 (schema-drift-audit, the data-audit lane) and the two gates together cover both directions. References are textual: a table reached only through a dynamic name is invisible, and a bare-word mention in non-comment code counts as a reference, so the gate under-reports rather than cries wolf.',
  };
