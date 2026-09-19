// RD-31-operator-priced-spend: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'RD-31-operator-priced-spend',
    skill: 'remediation-discipline',
    section: 'Operator-priced spend + data-existence-before-acquisition — the two-mechanism spend model',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    text: 'The paid path requires an operator-priced line (an operator-set cost + an inventory-miss citation); the machine never proposes/defaults/anchors a price. An approved line halts at the operator-set cost (no default tolerance). Every standing dollar figure — per-item breaker, daily cap, monthly ceiling — is RETIRED as a limit; the gauge reports MTD actuals as information (no denominator). Spend-watch is a pure alarm: any post-freeze paid row not traceable to an operator-priced line is the anomaly.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    anchor: 'Operator-sets-cost: the paid path MUST carry an operator-priced line',
    enforcedBy: ['selftest:fsi-app/src/lib/llm/priced-line.test.mjs', 'selftest:fsi-app/src/lib/llm/spend-guard.test.mjs', 'selftest:fsi-app/src/lib/health/spend-health.test.mjs'],
  };
