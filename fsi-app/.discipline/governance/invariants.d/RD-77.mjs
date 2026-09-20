// RD-77: registered by lane F52 (brief-f52.md, 2026-09-20). One entry, one file; see
// invariants.d/README.md. No new remediation-discipline SKILL.md category is added by this lane (out of
// this lane's write set); the closest existing category is 46 (loop hops checked as data against the
// real tree, not remembered as wired), whose theme this invariant extends one layer down: before a
// workflow file's hops can be checked as wired, the file itself has to be something GitHub would accept
// at all. The anchor below cites that category's own heading, verbatim, since it is the section this
// entry's skill/section fields point at.

export const invariant = {
  id: 'RD-77',
  skill: 'remediation-discipline',
  section:
    "Section 4 - category 46: a loop's own hops are checked as data, not remembered as wired (an edge, a family, and a fired-from-upstream artifact are three separate facts)",
  text:
    'A workflow file GitHub would refuse never reaches master. [CONFIRMED 2026-09-20, GitHub run 35533637184] ' +
    "Lane M9d put `${{ runner.temp }}` in a job-level `env:` of .github/workflows/producers.yml; the `runner` " +
    'context does not exist outside a step, so GitHub refused the file and the workflow "failed" with zero ' +
    "jobs on the branch push. PR #756's locked push gate PASSED and every required check was green or going " +
    'green, because nothing in pre-push or CI parsed or validated a workflow file as a workflow file - F50 ' +
    "(category 46) reads a workflow's `workflow_run` edge, but only after assuming the file is well-formed. " +
    'F52 (workflow-file-validity) closes that hole with five checks over every `.github/workflows/*.yml` and ' +
    '`.github/actions/*/action.yml`: (a) the file parses, has a top-level `on:` and at least one job with ' +
    "`runs-on:` or `uses:` (an action.yml has `runs:` with `using:`); (b) a workflow-level or job-level `env:` " +
    'value references only github, needs, strategy, matrix, vars, secrets or inputs - never runner, env, ' +
    'steps or job, the M9d class itself; (c) a job-level `if:` never references `steps.` or `runner.`; ' +
    '(d) every `needs:` names a job that exists in the file, and every `steps.<id>.outputs` reference inside ' +
    'a job names a step `id:` that exists in that same job; (e) a `workflow_run` trigger\'s `workflows:` list ' +
    "names a workflow whose own top-level `name:` exists somewhere in the tree. CI additionally runs " +
    "actionlint, pinned to a version and sha256 read from its own GitHub release, over the whole " +
    '.github/workflows/ directory (.github/workflows/discipline.yml, fitness-check job), catching the wider ' +
    'class of GitHub Actions defects F52\'s five checks do not cover.',
  anchor:
    "### Section 4 - category 46: a loop's own hops are checked as data, not remembered as wired (an edge, a family, and a fired-from-upstream artifact are three separate facts)",
  enforcedBy: [
    'fitness:F52',
    'selftest:fsi-app/.discipline/fitness/functions/F52-workflow-file-validity.test.mjs',
  ],
  residual:
    'F52 is a line-based, indentation-based text scan (no YAML parser is a direct dependency of this ' +
    'repository), not a real parser: it assumes the 2-space block-style indentation every workflow and ' +
    'action file in this repository uses today, and a flow-style mapping, a different indentation width, or ' +
    'a multi-line block-scalar env/if value would not be read correctly. It checks five specific structural ' +
    'shapes, not general GitHub Actions semantics (a full linter is out of this lane\'s scope by its own ' +
    'brief - actionlint in CI is the real parser for the wider class). actionlint runs locally in F52 only ' +
    'when it is on PATH (never installed by this lane); its CI enforcement is a workflow step, which has no ' +
    'enforcedBy token in this registry\'s vocabulary (rule/fitness/consistency/audit/selftest/migration), so ' +
    'it is named in this entry\'s text rather than tokenized - the mechanically-checked half of this ' +
    'invariant is F52 and its test; the actionlint CI step is a documented, non-tokenized second layer.',
};
