// RD-89: registered by lane R6-8 (remediation plan 2026-09-30, item 8), 2026-10-01. One entry, one
// file; see invariants.d/README.md. NOTE: the coordinator's own dispatch for this lane did not name an
// id to use; this id was self-assigned as the next free RD number after RD-88 and is disclosed here
// and in this lane's session-log entry for the coordinator to re-number if it collides with a
// concurrently-registered id.

export const invariant = {
  id: 'RD-89',
  skill: 'remediation-discipline',
  section: 'Section 4: Remediation Strategy by Category',
  text: 'Fitness function F65 (no-bracket-path-tests) proves, by attack, that CF-SEC-11\'s defect class (Node\'s test runner re-parses even an explicit CLI file argument through its own glob matcher, so a path with a literal "["/"]" segment silently matches zero tests, no error) cannot recur silently: any tracked *.test.mjs / *.npmtest.mjs / *.selftest.mjs / *.golden.mjs path containing a "[" or "]" character anywhere is a violation, with no allowlist (the fix is always to rename the path or route execution through the programmatic runner, never to except a bracket path from coverage). The runner class is fixed, not only guarded: fsi-app/.discipline/lib/run-explicit-tests.mjs executes an explicit file list via node:test\'s programmatic run({ files }) API (whose files option is a literal array, never re-parsed as a glob), and both fsi-app/.discipline/run-test-suite.sh and fsi-app/.discipline/hooks/lib/run-npmtest-suites.sh (and so .github/workflows/discipline.yml, which calls the latter) now go through it instead of a bare "node --test $files" CLI invocation.',
  anchor: '## Section 4: Remediation Strategy by Category',
  enforcedBy: [
    'fitness:F65',
    'selftest:fsi-app/.discipline/fitness/functions/F65-no-bracket-path-tests.test.mjs',
  ],
  residual: 'F65 is the belt (catches a bracket-path test by name, regardless of how it would be executed); the runner fix is the buckle (makes a bracket-path test that does exist run correctly). Neither covers a THIRD caller that discovers and executes tests through some other mechanism entirely (a future CI step, a different shell script) -- that caller would need to route through run-explicit-tests.mjs on its own, or reintroduce the same class of silent-skip bug F65 would then only detect by name, not prevent from being invoked incorrectly.',
};
