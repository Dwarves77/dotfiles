// SF-6-no-hardcoded-user-path: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'SF-6-no-hardcoded-user-path',
    skill: 'sprint-followups-discipline',
    section: 'Post-slim engine state (Rule 012)',
    text: 'No hardcoded operator user-home path (Windows Users dir, POSIX home, or Git-Bash drive-mount forms) in code files; use getRepoRoot()/os.homedir()/os.tmpdir().',
    anchor: 'Rule 012 (hardcoded user-home path)',
    enforcedBy: ['rule:012'],
  };
