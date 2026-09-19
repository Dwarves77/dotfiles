// RD-22-mint-source-link: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'RD-22-mint-source-link',
    skill: 'remediation-discipline',
    section: 'Section 4 — category 16: The source-link mint invariant (a mint cannot produce a source-less LIVE item)',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    text: 'A mint cannot produce a source-less LIVE intelligence_items row: grounding grounds a brief against the item source, so a source_id=NULL item can never verify. Enforced at the ONE mint home (mint-item.ts sourceLinkDecision): a preset source_id is trusted, an unresolved source_url is REJECTED-with-reason (register first, no silent orphan, no auto-registration), a registry read error fails closed. Companion (Fix B): a STRUCTURAL ground-failure class (no source_id) routes STRAIGHT to held-for-re-source, skipping the futile re-ground/re-research passes, and the erase step is relabeled honestly (brief-nulled-held, never archived).',
    anchor: 'The source-link mint invariant (a mint cannot produce a source-less LIVE item)',
    enforcedBy: [
      'audit:fsi-app/scripts/verify/source-link-audit.mjs',
      'selftest:fsi-app/src/lib/intake/mint-source-link.npmtest.mjs',
      'selftest:fsi-app/src/lib/intake/source-link-invariant.test.mjs',
      'selftest:fsi-app/src/lib/agent/ground-failure-class.test.mjs',
    ],
    residual: 'The CHOKEPOINT gate is proven red-then-green in mint-source-link.npmtest.mjs (a registered source LINKS + inserts; an unregistered url REJECTS action=unsourced, no insert) — it forecloses new source-less LIVE mints for ALL callers of the single mint home. source-link-audit.mjs (live-data, CI-with-secrets lane) is the belt: it fails on any source-less LIVE row NOT in the documented pre-cutover grandfather (source-link-invariant.mjs GRANDFATHERED_SOURCELESS = the two 2026-07-12 T9 orphans, whose re-sourcing is Unit 3; the list should only ever shrink). The Fix-B structural routing is proven in ground-failure-class.test.mjs (no source_id -> structural_hold = zero re-research). NAMED RESIDUAL: the scan path only attaches a source_id when the url ALREADY matches a registered sources row, so an unregistered-url candidate now REJECTS on both paths (register the source first) — the intended tightening. Auto-registration of the institution as a source at mint is deliberately NOT built under this unit.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
  };
