// RD-69-no-dash-glyphs: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'RD-69-no-dash-glyphs',
    skill: 'remediation-discipline',
    section: 'Section 2: The Class-Over-Instance Principle (a recurring process failure is prevented mechanically, not by an advisory header)',
    text: 'An added line must not contain U+2014 (em dash), U+2013 (en dash), or U+00A7 (section sign), unless the file path is under fsi-app/scripts/turns/record-briefs/batches/, a directory named fixtures, or docs/archive/, or the line carries the literal marker `glyph:verbatim`. The check lived only as prose in the lane contract and a byte count the coordinator ran by hand (docs/plans/defect-fix-plan-2026-09-12.md, D5): task 7.4e added 7 offending lines, task 7.5 added 36 across nine files, task 7.2 added 4 (ruled acceptable ad hoc). A recurring miss against an advisory step is the same class RD-50/RD-51 already fix mechanically for their own defects; this closes it for the glyph check.',
    anchor: 'The Class-Over-Instance Principle',
    enforcedBy: ['rule:022'],
    residual: 'Rule 022 reads ADDED lines only (ctx.getAddedLines, backed by `git diff -U0` / `git show -U0`), so a glyph already present in an unchanged line before this commit is out of scope by design (rule 012\'s own precedent for pre-existing captured content). The marker discloses a legitimate exception; it does not itself get counted or swept separately from a normal grep of the diff.',
  };
