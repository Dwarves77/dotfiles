// RD-86-workflow-run-chain-depth: registers F60 (lane LOOP-B-FIRING, 2026-09-28/29) with the
// invariant-coverage meta-gate. One entry, one file; see invariants.d/README.md.

export const invariant = {
  id: 'RD-86-workflow-run-chain-depth',
  skill: 'remediation-discipline',
  section:
    "Section 4 - category 46: a loop's own hops are checked as data, not remembered as wired " +
    '(an edge, a family, and a fired-from-upstream artifact are three separate facts)',
  text:
    "GitHub's own documented limit (docs.github.com/en/actions/writing-workflows/choosing-when-your-" +
    'workflow-runs/events-that-trigger-workflows, workflow_run section), quoted verbatim: "You can\'t ' +
    'use workflow_run to chain together more than three levels of workflows. For example, if you ' +
    'attempt to trigger five workflows (named B to F) to run sequentially after an initial workflow A ' +
    'has run (that is: A -> B -> C -> D -> E -> F), workflows E and F will not be run." Every ' +
    'workflow_run hop in the loop manifest (LOOP_HOPS) MUST have its real chain depth computed from the ' +
    'live .github/workflows/*.yml graph, never a hand-maintained number; a hop past that limit MUST ' +
    'carry an explicit `gh workflow run <consumer>` dispatch fallback in its producer\'s own yml, since ' +
    'GitHub silently drops the workflow_run event past depth 3 rather than erroring. Concrete finding ' +
    'this codifies (lane LOOP-B-FIRING, 2026-09-28, confirmed against gh run history and GitHub\'s own ' +
    'docs 2026-09-29): the downstream-chain-to-propagation-drain hop sits at depth 4 (source-sweep(0) -> ' +
    'ledger-consume(1) -> population-turn/corpus-turn(2) -> downstream-chain(3) -> propagation-drain(4)) ' +
    'and had never fired autonomously for exactly this reason; every one of its prior firings traced to ' +
    'a hand-dispatched (depth-0) downstream-chain run.',
  anchor:
    "Every workflow_run hop in LOOP_HOPS is checked against GitHub's documented 3-level workflow_run " +
    'chain-depth limit, computed from the real .github/workflows/*.yml graph; a hop past the limit MUST ' +
    'carry an explicit `gh workflow run <consumer>` dispatch fallback in the producer\'s own yml, or the ' +
    'hop can never fire autonomously.',
  enforcedBy: [
    'selftest:fsi-app/.discipline/fitness/lib/workflow-run-depth.test.mjs',
  ],
  residual:
    'F60 reads .github/workflows/*.yml with the same documented line-based text scan F50 already uses ' +
    '(no YAML parser is a direct dependency of this repository); a workflow_run block written in some ' +
    'other valid YAML shape would not be found, same residual F50/RD-74 already names. The depth model ' +
    'is conservative (worst-case: a producer reachable by more than one path is scored at its DEEPEST ' +
    'reachable depth), so it can flag a hop that would, in a specific sample, have fired fine via a ' +
    'shallower path (e.g. a hand-dispatched producer); that is by design (favor class-treatment over a ' +
    'silent undetected breakage), not a false positive in the sense of ever missing a real depth-4+ hop. ' +
    'The explicit-dispatch fallback this gate requires is proven wired locally (F60 itself, plus a real ' +
    'local dry-run artifact) but has NOT yet been proven to fire on GitHub via an actual chained ' +
    'dispatch; that live proof is deferred to the coordinator\'s next authorized dispatch.',
};
