// RD-32-data-existence-before-acquisition: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'RD-32-data-existence-before-acquisition',
    skill: 'remediation-discipline',
    section: 'Operator-priced spend + data-existence-before-acquisition — the two-mechanism spend model',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    text: 'No acquisition fires without first proving the datum absent from what we already hold; the paid path REFUSES without an inventory-miss citation naming what was checked and the specific miss. Acquisition is always the named DELTA (the missing document / span-range), never a re-fetch of what a pool already carries — verify-before-acquire made mechanical at the paid chokepoint.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    anchor: 'Data-existence-before-acquisition: no fetch without a cited inventory-miss',
    enforcedBy: ['selftest:fsi-app/src/lib/llm/priced-line.test.mjs', 'selftest:fsi-app/src/lib/llm/spend-guard.test.mjs'],
  };
