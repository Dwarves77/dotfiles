// RD-76: registered by lane N6 (plan 6.8, Amendment 1 item 1). One entry, one file; see
// invariants.d/README.md. Lane N4 (2026-09-19) built the range-based skill-contract acknowledgment
// mechanism (skill-contract-map.mjs's checkRangeAcks) but registered no invariant for it; a grep of
// invariants.d/*.mjs for "skill-contract-map", "PINNED_MANIFEST", "citingFiles", "contentHash" and
// "GOVERNING SKILL" found exactly one hit, RD-68, whose enforcedBy and text are entirely about the
// unrelated Windows CLI main-guard defect (category 44) that skill-contract-map.mjs happens to also
// inline; RD-68 names that file only incidentally, in its residual. This entry closes that gap.

export const invariant = {
  id: 'RD-76',
  skill: 'remediation-discipline',
  section: 'Section 4 - category 48: a registry is a directory, a gate compares to the merge-base, and nothing that would need re-stamping is ever stored',
  text: 'A pinned SKILL.md changing, or a "GOVERNING SKILL(S):" citation of a registered skill being added, removed or moved, within a git range must be acknowledged in that SAME range by a lane\'s own fsi-app/.discipline/governance/skill-acks/<date>-<lane>.md naming the skill (a "## Skill" heading) and the citing files it reviewed (a "## Citing files reviewed" heading). Nothing about a skill\'s past content or past citation set is ever stored to compare against; the comparison (skill-contract-map.mjs\'s checkRangeAcks) is always HEAD versus that range\'s own base tree, read live through change-range.mjs\'s gitFileAtBase, so two lanes acknowledging drift in the same evening add two files and never collide on one shared pin. The rule is skipped, never failed, when no git range resolves (no baseline to diff against).',
  anchor: '### Section 4 - category 48: a registry is a directory, a gate compares to the merge-base, and nothing that would need re-stamping is ever stored',
  enforcedBy: [
    'selftest:fsi-app/.discipline/skill-drift-gate.test.mjs',
  ],
  residual: 'This is a registration-and-acknowledgment mechanism, not a semantic drift detector: it proves a human looked (the ack names the skill and the files) at the moment a citation or a governing SKILL.md moved, and it never claims to distinguish a meaningful doctrine change from a typo (skill-contract-map.mjs\'s own header, "SCOPE, HONESTLY"). checkManifestDrift\'s registration half (a pinned skill file exists; every live citation resolves to a registered skill) is covered by the same selftest file and is not split into a second invariant here.',
};
