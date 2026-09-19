// RD-49-schema-drift-committed-source: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'RD-49-schema-drift-committed-source',
    skill: 'remediation-discipline',
    section: 'Section 4.5 — Migration coordination (the two-track migration policy made mechanical)',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    text: 'Every live public object (table / view / materialized view) MUST trace to a committed CREATE in supabase/migrations/. A live object with no committed source is the apply-then-commit-later drift that burned the census twice (census_worklist / coverage_gap_census_findings existed live before their migrations were committed). A live-data audit introspects the public schema and diffs object names against every committed CREATE TABLE/VIEW; an unsourced object is DRIFT (fails the hard lane), suppressible only by a reasoned, review-by-tagged allowlist that is itself audited for stale entries.',
    anchor: 'Migration coordination',
    enforcedBy: ['audit:fsi-app/scripts/verify/schema-drift-audit.mjs'],
    residual: 'Table/view/matview-level (the class that burned the census). Column-level parity is covered separately by column-existence-parity.mjs (code-vs-live columns); the allowlist self-audit reports an entry that is gone or now committed.',
  };
