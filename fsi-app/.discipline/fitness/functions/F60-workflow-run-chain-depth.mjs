// F60: workflow-run-chain-depth (lane LOOP-B-FIRING, 2026-09-28). Sibling of F50 (loop-wiring): F50
// proves a hop's `on.workflow_run.workflows` edge exists and, separately, whether an artifact has ever
// recorded `trigger:"workflow_run"` for it. Neither check can see the platform-level reason a hop's edge
// can exist, be correctly named, and STILL never fire: GitHub's own documented limit  - 
// docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-
// workflows, workflow_run section, fetched 2026-09-28, quoted verbatim: "You can't use workflow_run to
// chain together more than three levels of workflows. For example, if you attempt to trigger five
// workflows (named B to F) to run sequentially after an initial workflow A has run (that is: A -> B -> C
// -> D -> E -> F), workflows E and F will not be run." [CONFIRMED against this repo's own gh run history,
// lane LOOP-B-FIRING session note 2026-09-28-loop-b-firing.md]: the downstream-chain -> propagation-drain
// hop sits at depth 4 (source-sweep(0) -> ledger-consume(1) -> population-turn/corpus-turn(2) ->
// downstream-chain(3) -> propagation-drain(4)) and has NEVER fired via that edge when downstream-chain
// was itself reached by chaining - every firing on record traces to a hand-dispatched (depth-0)
// downstream-chain run, which puts propagation-drain back at depth 1.
//
// THIS GATE: for every workflow_run hop the loop manifest states, compute its real depth from the actual
// `.github/workflows/*.yml` graph (never trust a hand-maintained depth number - the same "read the real
// tree, not the manifest's own claim" posture F50 already applies to the edge itself). A hop whose depth
// exceeds 3 MUST carry an explicit `gh workflow run <consumer file>` dispatch fallback in the PRODUCER's
// own yml (the fix this lane wires for the one hop currently past the limit) - that fallback is what lets
// the hop fire at all when its natural chain depth would otherwise silently drop the event. A hop at depth
// <=3 needs no such thing and is not checked here (F50 already governs its wiring).
import { violation } from '../lib/result.mjs';
import { getRepoRoot } from '../../lib/context.mjs';
import { readFile } from '../lib/file-content.mjs';
import { LOOP_HOPS } from '../../governance/loop-manifest.mjs';
import {
  computeWorkflowRunDepths,
  hopDepth,
  readWorkflowRunGraph,
  hasExplicitDispatchFallback,
} from '../lib/workflow-run-depth.mjs';

const CHAIN_LIMIT = 3;

export const fitnessFunction = {
  id: 'F60',
  name: 'workflow-run-chain-depth',
  description:
    "Every workflow_run hop in LOOP_HOPS is checked against GitHub's documented 3-level workflow_run " +
    'chain-depth limit, computed from the real .github/workflows/*.yml graph (never a hand-maintained ' +
    "number). A hop past the limit MUST carry an explicit `gh workflow run <consumer>` dispatch fallback " +
    "in the producer's own yml, or the hop can never fire autonomously - GitHub silently drops the event.",
  source:
    'docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/' +
    'events-that-trigger-workflows (workflow_run section, fetched 2026-09-28); ' +
    'docs/ops/session-log.d/2026-09-28-loop-b-firing.md',

  enumerate() {
    return ['fsi-app/.discipline/governance/loop-manifest.mjs'];
  },

  check() {
    const out = [];
    const repoRoot = getRepoRoot();
    const graph = readWorkflowRunGraph(repoRoot);
    const depths = computeWorkflowRunDepths(graph);
    let beyondLimit = 0;

    for (const hop of LOOP_HOPS) {
      if (hop.trigger !== 'workflow_run') continue;
      const depth = hopDepth(hop.producer.name, depths);
      if (depth <= CHAIN_LIMIT) continue;
      beyondLimit++;

      const producerText = readFile(hop.producer.file);
      if (producerText === null) {
        out.push(
          violation(
            1,
            `${hop.id}: workflow_run depth is ${depth} (> ${CHAIN_LIMIT}, GitHub's documented chain ` +
              `limit) but ${hop.producer.file} could not be read (missing?) to check for an explicit ` +
              `dispatch fallback.`,
          ),
        );
        continue;
      }
      const consumerBasename = hop.consumer.file.split('/').pop();
      if (!hasExplicitDispatchFallback(producerText, consumerBasename)) {
        out.push(
          violation(
            1,
            `${hop.id}: workflow_run depth is ${depth} (> ${CHAIN_LIMIT}) - GitHub's documented limit ` +
              `("You can't use workflow_run to chain together more than three levels of workflows") ` +
              `means this hop's own on.workflow_run edge will never fire when the producer is itself ` +
              `reached by chaining. ${hop.producer.file} carries no \`gh workflow run ${consumerBasename}\` ` +
              `explicit dispatch fallback to compensate.`,
          ),
        );
      }
    }

    console.log(`  [F60] hops past the workflow_run 3-level chain limit: ${beyondLimit}`);

    return out;
  },
};
