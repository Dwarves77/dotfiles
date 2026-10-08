// RD-96: registered by lane ALIAS-1 (2026-10-08, spec 00 section 8 and section 1.3). One entry, one file; see invariants.d/README.md.
// NOTE: the lane brief named no invariant id. It was self-assigned RD-95 and renumbered to RD-96 by coordinator
// ruling (2026-10-08) because AUDWIRE-1 (PR 1024) took RD-95.

export const invariant = {
  id: 'RD-96-spine-coherence-acceptance',
  skill: 'remediation-discipline',
  section: 'Section 4: Remediation Strategy by Category',
  text: 'The entity spine has an executable coherence test, scripts/verify/surface-acceptance.mjs, that implements the seventeen assertions of docs/specs/00-foundation-the-spine.md section 8 plus the two section 1.3 rules (the composite/atomic hierarchy is acyclic and every member states its level; every alias carries who asserted it and when). Each assertion is either a check that runs (on a fixture world with --fixture, on the live tables with credentials) or is skipped in every report with a kind (live, ui, no-data-source) and a reason; a skip is never counted as a pass. Every check that runs is proven by attack in surface-acceptance.test.mjs: a world broken in exactly the way the check exists to catch must come out FAIL. The script is a soft data-audit (line-1 marker) that self-skips with exit 2 when there are no credentials or migration 377 is not applied.',
  anchor: '## Section 4: Remediation Strategy by Category',
  enforcedBy: [
    'audit:fsi-app/scripts/verify/surface-acceptance.mjs',
    'selftest:fsi-app/scripts/verify/surface-acceptance.test.mjs',
    'selftest:fsi-app/src/lib/entities/resolve.test.mjs',
    'selftest:fsi-app/supabase/migrations/377_entity_hierarchy_and_aliases.test.mjs',
  ],
  residual: 'Eleven of the nineteen checks are skipped today and say why: assertions 3, 4, 8, 13, 14, 15 and 16 need a rendered surface or a built route (the rendering guard, not this script, is where they will be proven), 7, 11 and 17 need live catalogue or published rows this script does not read, and 12 measures spec 00 section 4, which is not built. Assertion 2 runs only the part a snapshot can decide (unique, well formed, kind-consistent ids, merges that point at a real survivor); reuse of a retired id across time needs a history of retired ids that no table keeps. Assertion 1 in live mode checks entity_refs only: no table holds the free-text mentions on rendered surfaces. Assertion 10 runs on fixtures only, because item_cross_references carries a different relationship vocabulary from the RELATION codes. The live run is soft: it informs the nightly data-audit lane and never blocks generation. migration 377 (entity_level, entity_relations, entity_aliases) is NOT APPLIED when this is registered; until the coordinator applies it the live run self-skips with exit 2, and its own rolled-back self-check has not been executed against a database by this lane.',
};
