// EP-5-cross-format-lens: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'EP-5-cross-format-lens',
    skill: 'environmental-policy-and-innovation',
    section: 'Cross-Format Lens Requirement',
    text: 'Every brief serves the four lenses (substantive, competitive, client-conversation, action) where facts permit.',
    anchor: 'Cross-Format Lens Requirement',
    enforcedBy: ['audit:fsi-app/scripts/verify/format-structure.mjs'],
    residual: 'format-structure proves SECTION PRESENCE (the structural carrier of the lenses); it cannot prove lens QUALITY — that is judgment.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
  };
