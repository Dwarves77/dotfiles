// RD-88-clock-fragility: registers F66 (lane R11, 2026-10-01) with the invariant-coverage meta-gate.
// One entry, one file; see invariants.d/README.md.

export const invariant = {
  id: 'RD-88-clock-fragility',
  skill: 'remediation-discipline',
  section:
    'Section 4 - category 56: a test\'s expected value is never computed from the live clock against ' +
    'a fixed fixture, checked mechanically, not by a one-time grep',
  text:
    'PR #816 (commit a68111cf): timeline-math.test.mjs\'s nextMilestoneClause test built its expected ' +
    'string from a day-distance helper whose "now" argument was omitted, so the helper read the real ' +
    'wall clock, then compared that computed string to the actual output with strict equality against ' +
    'a hardcoded " days" suffix. The gap between "now" and the fixture\'s fixed target date was exactly ' +
    '1 day on 2026-09-28; the code correctly said "1 day" (the singular rule), and the test\'s own ' +
    '"1 days" was wrong, a time bomb armed by the calendar. The fix pinned the clock and grepped every ' +
    'new Date()/Date.now() hit across the repo\'s *.test.mjs files BY HAND, recording the result in a ' +
    'session note rather than a standing check, since the shape was judged "not detectable by syntax ' +
    'alone" for a read hidden behind a helper function. CF-GATE-2 (audit A6, finding C3) named this as ' +
    'a one-time manual grep that needed promotion to a standing gate.',
  anchor:
    'A test file may not combine a live clock read (`new Date()` with no arguments, or `Date.now()`) ' +
    'with a strict-equality assertion against a COMPUTED string (`+` concatenation or a `${...}` ' +
    'template) in the same test() block, checked by a standing gate, not by a one-time grep repeated ' +
    'by hand before the next incident.',
  enforcedBy: [
    'fitness:F66',
    'selftest:fsi-app/.discipline/fitness/functions/F66-clock-fragility.test.mjs',
  ],
  residual:
    'F66 is a text-based heuristic (same posture F48/F50/F52/F60/F61 already state for themselves): it ' +
    'scans for the literal tokens new Date()/Date.now() and a strict-equality assertion carrying a `+` ' +
    'concatenation or `${...}` template in the same top-level test() block. A live read hidden behind a ' +
    'helper function (the EXACT #816 shape before this gate existed, where the test called a day-math ' +
    'helper with its "now" argument omitted rather than reading the clock inline) is not syntactically ' +
    'visible and is NOT caught by this gate; that narrower, originally-hidden shape is what a68111cf\'s ' +
    'own commit message called "not detectable by syntax alone," and remains a human-review concern, ' +
    'not a mechanical one. The assertion set is deliberately equal/strictEqual only, excluding ' +
    'deepEqual/deepStrictEqual: broadening it reintroduced two false positives found and fixed during ' +
    'this lane\'s build (scripts/producers/lib/emit-producers-artifact.test.mjs and ' +
    'scripts/verify/population-report.test.mjs, both using Date.now() to build a unique scratch-path ' +
    'argument, asserted deepEqual against a literal empty array, not a date-equality comparison at ' +
    'all). Live run at registration: 0 violations across 643 test files.',
};
