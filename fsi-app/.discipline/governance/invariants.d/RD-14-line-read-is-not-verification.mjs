// RD-14-line-read-is-not-verification: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'RD-14-line-read-is-not-verification',
    skill: 'remediation-discipline',
    section: 'Section 3.5 — investigation discipline: a deterministic gate ships with a table-driven contract test; an audit line-read is not behavioral verification',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    text: 'A deterministic intake gate (sourceRole/congruence, urlIsRoot, matchExistingSubject, and the mint idempotency short-circuits: source_url / legacy_id / the fail-closed read-error refusal) ships with a COMMITTED table-driven behavioral contract test over a golden URL corpus, proven red-then-green — a line-read of the gate does NOT count as verification. The named gates are enforced by their committed tests running; new deterministic gates are closeout-audited for the same coverage.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    anchor: 'Investigation discipline',
    enforcedBy: ['selftest:fsi-app/src/lib/intake/intake-gates-golden.test.mjs', 'selftest:fsi-app/src/lib/intake/mint-idempotency.npmtest.mjs'],
    residual: 'intake-gates-golden.test.mjs (depless suite) proves sourceRole/congruence (1a retype + 1b seek-study), urlIsRoot (portal roots incl. language-prefix + landing-file variants vs deep docs), and matchExistingSubject (CELEX discrimination + noise-variant equivalence + reg-# cross-match + title-sim rejection) table-driven over the committed intake-url-corpus.mjs. mint-idempotency.npmtest.mjs (jiti) proves the source_url + legacy_id short-circuits return the existing item with NO INSERT; mint-failclosed.npmtest.mjs proves the fail-closed probe/corpus read-error refusals. The meta-gate keys on these committed contract-test files existing (deleting one is RED). The "every NEW deterministic gate carries such a test" growth case is closeout-audited authoring discipline — the mechanical anchor is the named-gate committed corpus + tests.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
  };
