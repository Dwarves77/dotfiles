// SC-7-claims-tier: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'SC-7-claims-tier',
    skill: 'source-credibility-model',
    section: 'Canonical Institutional Tier (Phase 0\')',
    text: 'A FACT claim\'s grounding tier stamp equals the canonical institutional tier of the source containing its span (flagged-override row tier where present; NULL when the span host is unregistered); no constant stamps.',
    anchor: 'the stamp equals the canonical institutional tier of the source containing the span',
    enforcedBy: ['audit:fsi-app/scripts/verify/claims-tier-audit.mjs', 'audit:fsi-app/scripts/verify/ledger-onepass-audit.mjs'],
    residual: 'Two independent live-data guards: claims-tier-audit.mjs verifies DERIVATION-CONSISTENCY (D1, migration 145): the stored stamp equals the tier derived from the claim\'s source_id -> COALESCE(tier_override, base_tier) (base_tier-only, moat-pure); it deliberately does NOT re-resolve the span URL NOW — registry growth after grounding is Phase-3 GROWTH, not drift the audit polices. ledger-onepass-audit.mjs is the composed one-pass cross-check that ALSO re-derives the per-type floor in JS (buildResolver + migration 141), catching an SQL-gate-vs-JS-primitive drift. Both were unwired lane audits before this registration. GREEN as of 2026-06-29 (0 mismatches). The meta-gate proves wiring (file exists + skill-cited). Whether a registered institutional tier is itself CORRECT is operator-ratification judgment, not mechanized here.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
  };
