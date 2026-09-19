// RD-39-suspended-source-unselectable: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'RD-39-suspended-source-unselectable',
    skill: 'remediation-discipline',
    section: 'Section 4 — category 24: Generic/dead source unselectable at ground (nothing-generic sourcing)',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    text: 'A SUSPENDED source is UNSELECTABLE by the grounding resolver: buildResolver skips status="suspended" rows, so resolveSpan returns {null,null} for a host whose only registry row is suspended. Forecloses re-selection of a generic/dead junk-drawer row as a FACT attribution target (the Task-3-suspended EUR-Lex 404 that was the citation-of-record for 927 facts across 26 items, all over-stamped T1). Only an EXPLICIT "suspended" status is excluded (undefined status stays included — backward-compatible for callers not selecting status). Seam 1 of the generic-source-at-ground hardening; the mint-time null/generic/floor gates (seams 2-3, report-only calibration first) and per-document keying (A2) complete it.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    anchor: 'A suspended source is unselectable by the grounding resolver; a dead/generic junk-drawer row can never be re-selected as a FACT attribution target',
    enforcedBy: ['selftest:fsi-app/scripts/verify/resolver-status-filter.golden.mjs'],
    residual: 'buildResolver (institution.ts) skips suspended rows; readAllSourcesForResolver selects status. Golden resolver-status-filter.golden.mjs proves suspended-unselectable (positive), active-resolves (negative), active-over-suspended, undefined-status-included (backward-compat). NAMED RESIDUALS: host-collapse (all eur-lex.europa.eu rows share one institution key so a per-instrument tier is not resolved yet) is closed by A2 (per-document keying); the 449 PROVISIONAL sources currently resolving facts (a possible active-only-rule gap) is a flagged finding, not swept into this seam.',
  };
