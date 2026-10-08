// RD-97: registered by lane GATE-7 (2026-10-08). One entry, one file; see invariants.d/README.md.
// Id RD-97 per the coordinator's grant (RD-96 was taken by ALIAS-1).

export const invariant = {
  id: 'RD-97-source-diffed-as-text',
  skill: 'remediation-discipline',
  section: 'Section 2: The Class-Over-Instance Principle (a recurring process failure is prevented mechanically, not by an advisory header)',
  text: 'A source file (a module, script, config, SQL or prose file by extension) must be diffed as text. Every content rule (012, 015, 017, 019, 022) reads the lines git reports as added; a file marked binary or -diff in .gitattributes, a file with a NUL byte, or a UTF-16 file produces no hunk, so every rule is blind to it at once, in the commit hook and in CI (AUD-AT-3 register: A012-8, A012-9, A015-12, A017-9, A019-7, A022-7, A022-8, A-CI-binary, A-CI-022). Rule 023 refuses such a file as a finding of its own: one check at one site instead of a blind spot in five rules.',
  anchor: 'The Class-Over-Instance Principle',
  enforcedBy: ['rule:023'],
  residual: 'Rule 023 judges by the extension list in rules/023-source-not-diffed-as-text.mjs: a source file with an extension not on the list is not checked, and a genuinely binary asset is by design not a source file. Rule 023 reads git\'s own binary decision, so it inherits git\'s heuristic (a NUL byte in the first 8000 bytes).',
};
