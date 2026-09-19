// PI-5-every-decline-names-the-five-contracts: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'PI-5-every-decline-names-the-five-contracts',
    skill: 'caros-ledge-platform-intent',
    section: 'The Five-Surface Scope Test (every decline names the five contracts)',
    text: 'A scope decision that DECLINES or PARKS a candidate (source, feed, or instrument) is only valid when it records a five-surface test: a verdict + a one-line reason for EACH of the five contracts (Regulations = compliance-action text brief; Operations = structured jurisdictional cost intelligence; Market Intel = comparative/numerical; Research = structured horizon assessment; Community = human-operated, outside machine intake). A decline that tests against one surface instead of five is the failure class this kills (three instances 2026-07-17: data-feeds-declined-despite-Operations, Market-Intel source-discovery omitted, Research source-discovery omitted).',
    anchor: 'Every scope decision that declines or parks a candidate MUST record a five-surface test (PI-5)',
    enforcedBy: ['selftest:fsi-app/scripts/verify/surface-contract-gate.golden.mjs'],
    residual: 'Two-part enforcement. The golden (surface-contract-gate.golden.mjs) proves the completeness gate over FIXTURES red-then-green (a declined/parked row without the five-surface record FAILS; with it PASSES; kept/candidate exempt) — the invariant is ENFORCED by this fixture proof today. The LIVE DB binding — the CHECK constraint on coverage_gap_candidates that fails a declined/parked row lacking the record — is owned by SESSION C\'s forthcoming migration (DECISION 1, operator ruling 2026-07-17: C owns the table, Session A does not touch it; the gate is DORMANT, no seed rows, demonstrability lives in the golden not in production data). PENDING-C, named-not-silently-unwired: PART B of the golden SCANS the migrations tree and AUTO-ARMS the moment C\'s migration lands (asserting surface_test + disposition{declined,parked} + a CHECK referencing all five contract keys), so a missing or wrong C migration is caught mechanically. When C posts its migration number to the session log, add migration:NNN to this enforcedBy as belt-and-suspenders. The verdict QUALITY (is a surface verdict correct?) stays scope-judgment, not mechanized.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
  };
