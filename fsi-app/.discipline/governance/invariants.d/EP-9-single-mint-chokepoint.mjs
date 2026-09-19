// EP-9-single-mint-chokepoint: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'EP-9-single-mint-chokepoint',
    skill: 'environmental-policy-and-innovation',
    section: 'Format Mapping / phase-intake-gate mint chokepoint',
    text: 'Every intelligence_items INSERT funnels through mintIntelligenceItem() (the ONE chokepoint) where source↔claim-type congruence (1a primary-artifact-on-news → market_signal retype; 1b research_finding-on-press-release → keep type, seek study) + high-precision subject-existence dedup run on BOTH mint paths (drain-first-fetch AND staged_updates materialization). A direct INSERT bypasses the intake gate and mis-types or duplicates the corpus — the exact defect that let drain-first-fetch mint 38 pre-gate polluters.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    anchor: 'Format Mapping',
    enforcedBy: ['fitness:F13'],
    residual: 'F13 is a STATIC scan (flags any `from("intelligence_items")…insert(` outside src/lib/intake/mint-item.ts across src/**, excl tests/scripts) — it enforces the STRUCTURAL single-chokepoint invariant, with a demonstrated red-then-green failing mode. The congruence/dedup DECISION QUALITY inside the chokepoint is unit-proven separately: source-role.test.mjs (1a/1b) + entity-resolve.test.mjs (dedup high-precision + moat failing-mode). Migration 146 (origin/derive) is NOT YET APPLIED, so the link-on-dedup edge write degrades silently until it lands.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
  };
