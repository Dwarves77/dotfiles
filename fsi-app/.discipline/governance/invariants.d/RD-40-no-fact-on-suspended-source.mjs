// RD-40-no-fact-on-suspended-source: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'RD-40-no-fact-on-suspended-source',
    skill: 'remediation-discipline',
    section: 'Section 4 — category 24: Generic/dead source unselectable at ground (nothing-generic sourcing)',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    text: 'No FACT may ground to a SUSPENDED (generic/dead/junk-drawer) source. Seam 1 makes suspended sources unselectable by the resolver so NEW grounds cannot add to this; RD-40 is the standing TREND guard that the count of FACTs-on-suspended never RISES (a rising count = a new FACT grounded to a suspended source: the resolver filter regressed or a raw write bypassed it). The standing backlog (currently 205: 189 held-to-find on the Task-3-suspended EUR-Lex 404 whose real instrument source was not in the pool, those items quarantined; + 16 on a montreal.ca generic portal) is dispositioned, not a live defect; the audit fails only on an INCREASE vs the recorded floor.',
    anchor: 'No FACT may ground to a suspended source; the facts-on-suspended count never rises (a new FACT on a suspended source is a regression)',
    enforcedBy: ['selftest:fsi-app/scripts/verify/no-generic-source-audit.golden.mjs', 'audit:fsi-app/scripts/verify/no-generic-source-audit.mjs'],
    residual: 'Pure factsOnSuspended goldened (flags facts on suspended sources, not active/null). Live trend audit baselined at 205 (fail on increase; --rebaseline for a deliberate reduction). The 205 backlog is the held-to-find residual (priced re-ground queue), resolving when the real instrument sources register (A2). Null-source facts are a SEPARATE seam-2 mint gate, not this detector.',
  };
