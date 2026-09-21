// RD-79: registered by lane G2 (brief-g2.md, 2026-09-21). One entry, one file; see
// invariants.d/README.md. The closest existing remediation-discipline category is 46 ("a loop's own hops
// are checked as data, not remembered as wired"), this is the same doctrine applied one level down: the
// local push gate and the CI required job are two independent surfaces claiming to enforce "green", and
// nothing checked that they agreed. F53 and RD-78 are reserved for lane M7c; this lane takes F54 / RD-79.

export const invariant = {
  id: 'RD-79',
  skill: 'remediation-discipline',
  section:
    "Section 4 - category 46: a loop's own hops are checked as data, not remembered as wired (an edge, a family, and a fired-from-upstream artifact are three separate facts)",
  text:
    'The local push gate and the CI required job it mirrors are two independent surfaces claiming to ' +
    'enforce "green", and nothing checked that they agreed. [CONFIRMED 2026-09-21, GitHub run ' +
    '35636629376] PR #769 passed fsi-app/.discipline/hooks/pre-push locally and FAILED ' +
    '.github/workflows/discipline.yml\'s required "Fitness functions" job on GitHub, in the step "App ' +
    'unit tests requiring npm deps (*.npmtest.mjs)": three tests asserting component source text broke ' +
    'on a markup change. [CONFIRMED by grep] the pre-push hook contained no npm-test step at all, while ' +
    'discipline.yml ran fsi-app/**/*.npmtest.mjs by glob. Operator ruling, verbatim: "This is a ' +
    'constant. sTOP pushing when it will fail Discipline engine / Fitness functions." Second occurrence ' +
    'of the class (2026-09-20: F52\'s first actionlint run failed in CI on a job never run locally). ' +
    'The class fix is two-part: (a) a shared script, ' +
    'fsi-app/.discipline/hooks/lib/run-npmtest-suites.sh, holds the npmtest discovery + command that ' +
    'used to be inline in discipline.yml; both the workflow step and a new pre-push step (3e) call it, ' +
    'so the two surfaces cannot drift again, and it fails loud (never silently skips, never installs) ' +
    'when fsi-app/node_modules is absent or empty; a new pre-push step (3f) likewise runs the behavioral ' +
    'goldens (fsi-app/scripts/verify/run-goldens.mjs), the job\'s other npm-dependent test step that was ' +
    'equally unwired locally. (b) F54 (push-gate-npm-parity) is the mechanical, by-attack proof that ' +
    'this stays true: it reads every test-running step of discipline.yml\'s "Fitness functions" job ' +
    '(name contains "test", "golden" or "lint", or its run: block invokes a tracked .mjs/.sh script via ' +
    'node/sh/bash) and fails when that step\'s script is not also called by the pre-push hook, unless the ' +
    'step carries a dated, reason-bearing EXEMPT_STEPS entry (today: actionlint, which runs a downloaded ' +
    'checksum-verified binary rather than a tracked script, "We do not need to install extra software ' +
    'use GitHub"; and the rendering-guard job\'s Playwright install, a different job this checker does ' +
    'not yet scan). An exemption entry missing either its date or its reason is itself a violation.',
  anchor:
    "### Section 4 - category 46: a loop's own hops are checked as data, not remembered as wired (an edge, a family, and a fired-from-upstream artifact are three separate facts)",
  enforcedBy: [
    'fitness:F54',
    'selftest:fsi-app/.discipline/fitness/functions/F54-push-gate-npm-parity.test.mjs',
  ],
  residual:
    'F54 is a line-based, indentation-based text scan of discipline.yml (no YAML parser is a direct ' +
    'dependency of this repository), not a real parser: it assumes the 2-space block-style indentation ' +
    'and the `- name:` / `run:` / `working-directory:` shapes this repo\'s workflow files use today, the ' +
    'same posture as F50/F52/yml-read.mjs. It classifies a "test-running step" by name-keyword ' +
    '(test/golden/lint) or by finding a node/sh/bash invocation of a tracked script; a step that runs a ' +
    'meaningful check by some other means entirely (a bare binary with a name matching none of the ' +
    'keywords) would not be classified as test-running and so would not be checked at all. Scope is the ' +
    '"Fitness functions" job by name only, the two other CI jobs with test-shaped steps ' +
    '(discipline-tests, rendering-guard) are not yet covered by this checker; the brief scoped RD-79 to ' +
    'the one job named in the incident and the coordinator-owned rendering-guard job is explicitly ' +
    'excluded by operator ruling (Playwright: "We do not need to install extra software use GitHub").',
};
