// RD-90: new invariant, lane R12-13 (2026-10-01/02). One entry, one file; see invariants.d/README.md.

export const invariant = {
    id: 'RD-90',
    skill: 'remediation-discipline',
    section: 'Section 4 - category 58: a CSS color is never built by concatenating digits onto a var(--token) reference',
    text: 'A source file must not build a color value by concatenating digits directly onto a var(--token) CSS custom-property reference, in either of two shapes: a bare `"var(--token)" + "NN"` string concatenation (24 sites across fsi-app/src/components/sources/** and resource/IntelligenceMetadataStrip.tsx, each building an inline-style tint/background this way) or the equivalent template-literal interpolation (`` `...${bandHex}NN` `` in timeline-dot-styles.ts\'s nextDotStyle, fed `band.cssVar`, a var() reference, instead of `band.hex`, the raw hex literal UrgencyBand already carries). [CONFIRMED, lane R12-13, 2026-10-01, by grep]: `var(--x)NN` terminates the var() reference at its closing paren; the trailing digits are not CSS syntax of any kind, so the browser silently drops the whole declaration and the tinted background, border, or ring never painted. CF-BROKEN-2 / A2bc finding A6.',
    anchor: '### Section 4 - category 58: a CSS color is never built by concatenating digits onto a var(--token) reference',
    enforcedBy: [
      'selftest:fsi-app/src/lib/tint.test.mjs',
      'selftest:fsi-app/src/components/ui/timeline-dot-styles.test.mjs',
    ],
    residual: 'GATE-3 (2026-10-08): F62 was deleted, so the lexical scan described here no longer runs and the two unit tests named in enforcedBy are the only enforcement. F62 is a LEXICAL scanner (regex over file content) matching the exact `var(--token)` immediately-followed-by-1-to-3-digits shape; a call site that builds the same broken value through some other string-construction shape (string concatenation split across multiple statements, a helper function that itself does the concatenation) would not be caught unless that helper is itself scanned. The fix path is a single shared helper (src/lib/tint.ts\'s tint(cssVar, percent), using color-mix()) for the inline-style sites, and a raw-hex field (UrgencyBand.hex, already existing, reused rather than added) for the alpha-suffix call sites; both are exercised by direct unit tests (tint.test.mjs, timeline-dot-styles.test.mjs) in addition to F62\'s static scan, so the fix is proven at both the construction site and the lexical-gate level.',
  };
