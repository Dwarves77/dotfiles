// RD-60-row-ux-measured-on-real-component: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'RD-60-row-ux-measured-on-real-component',
    skill: 'remediation-discipline',
    section: 'Section 4 — category 35: Row UX is measured on a real component at a phone width (no gate reads a layout; a gate renders it)',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    text: 'Every customer-facing row/ledger component and section header named in F35\'s ROW_COMPONENTS is mounted by a registered UX smoke spec and measured at 375 × 812 and 1280 × 800 (no horizontal overflow; no title wrapping at under 60 % of its card width, the one-word-per-line class; every interactive target at or above the law-2 floor of 44 px, or 24 px with 8 px clearance), and carries data-guard-title on its title element. On 2026-09-03 every ledger page wrapped titles one word per line on the operator\'s phone and the regional matrix ran off the viewport; every gate was green because none mounted a real row at a phone width.',
    anchor: '### Section 4 — category 35: Row UX is measured on a real component at a phone width',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    enforcedBy: ['fitness:F35', 'selftest:fsi-app/.discipline/fitness/functions/F35-row-ux-coverage.test.mjs', 'selftest:fsi-app/.discipline/rendering/ux-assert.test.mjs'],
    residual: 'F35 proves COVERAGE (a spec mounts the component; the component marks a title); the MEASUREMENT runs in run-rendering-guard.mjs\'s UX smoke slot in the rendering-guard CI job. That job was NON-BLOCKING (continue-on-error) from 2026-07-11 pending 3 consecutive green master runs; the coordinator flips it to blocking in the train that lands this invariant once the history shows the run is stable (recorded in the session log with the run ids). ROW_COMPONENTS is a hardcoded, basis-annotated list (F33\'s posture): a new row component is covered only when it is added there; the squeezed-title detector measures only elements marked data-guard-title; law-2 measures rendered boxes, not touch-slop the browser may add. Fixture data only, no auth, no network, the guard\'s $0 posture.',
  };
