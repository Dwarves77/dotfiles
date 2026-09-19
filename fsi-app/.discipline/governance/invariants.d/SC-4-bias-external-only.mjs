// SC-4-bias-external-only: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'SC-4-bias-external-only',
    skill: 'source-credibility-model',
    section: 'Section 6: Bias Tag Vocabulary',
    text: 'Bias tags apply to external publisher sources ONLY (never to user-generated Community content, which uses author-identity + workspace-verification).',
    anchor: 'Bias tags apply to external publisher sources ONLY',
    enforcedBy: ['migration:092'],
    residual: 'VERIFIED structural, not re-derived: bias tags live in the source_bias_tags table whose source_id is a FK into sources (migration 092). User-generated Community content is a SEPARATE table (community_posts) with no path to source_bias_tags — so community content structurally cannot carry bias tags. The residual half — which source_role values WITHIN sources qualify as "external publisher" eligible — is classification judgment (the skill gives no crisp role→eligibility mapping).',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
  };
