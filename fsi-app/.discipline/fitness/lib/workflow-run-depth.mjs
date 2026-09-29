// workflow-run-depth.mjs - the workflow_run chain-depth model (lane LOOP-B-FIRING, 2026-09-28).
//
// GitHub's own documented limit (docs.github.com/en/actions/writing-workflows/choosing-when-your-
// workflow-runs/events-that-trigger-workflows, workflow_run section, fetched 2026-09-28), quoted
// verbatim: "You can't use workflow_run to chain together more than three levels of workflows. For
// example, if you attempt to trigger five workflows (named B to F) to run sequentially after an initial
// workflow A has run (that is: A -> B -> C -> D -> E -> F), workflows E and F will not be run." A
// workflow reached at depth 4 or deeper in a workflow_run chain NEVER fires - GitHub silently drops the
// event; this is a platform limit, not a wiring mistake in any one repo's yml.
//
// The model: depth(a workflow with no workflow_run trigger at all, i.e. a chain ROOT - workflow_dispatch,
// push, schedule, or any other non-workflow_run event) = 0. depth(a workflow_run-triggered workflow) = 1
// + the MAXIMUM depth among its own producers - the worst case, since a producer reachable by more than
// one path can be reached at more than one depth depending on how ITS OWN run was triggered (a hand
// dispatch is depth 0 for that run; a chained run carries whatever depth its own chain reached). A
// specific HOP's depth (producer -> consumer) is depth(producer) + 1: using the producer's own worst-case
// depth is deliberately conservative, matching the doctrine this lane already applies elsewhere
// (favor class-treatment / fail loud over silent undetected breakage) - it flags a hop the moment ANY
// realistic autonomous chain could exceed depth 3, not only the one sample that happened to be observed.
//
// No YAML parser dependency (repo convention, see yml-read.mjs's own header): this module reads the
// SAME `.github/workflows/*.yml` files the same line-based way, reusing yml-read.mjs's extractors rather
// than a second copy.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractWorkflowRunNames, extractWorkflowName } from './yml-read.mjs';

/**
 * Pure. Compute the worst-case workflow_run chain depth of every workflow named in `producersByName`.
 * @param {Map<string, string[] | null>} producersByName - workflow name -> its own workflow_run producer
 *   names (the `on.workflow_run.workflows` list), or null for a chain root (no workflow_run trigger at
 *   all). A producer name absent from this map entirely (an external/unrecognized name) is treated as a
 *   root (depth 0) - this module only ever sees the closed universe of `.github/workflows/*.yml` files in
 *   this repo, so an absent name is a real gap in the caller's input, not a defect in the computation;
 *   ANY caller list gets an honest answer rather than a throw.
 * @returns {Map<string, number>} workflow name -> depth
 */
export function computeWorkflowRunDepths(producersByName) {
  const depths = new Map();
  const visiting = new Set();

  function depthOf(name) {
    if (depths.has(name)) return depths.get(name);
    if (!producersByName.has(name)) return 0; // unknown name: treat as an external root
    const producers = producersByName.get(name);
    if (producers === null || producers.length === 0) {
      depths.set(name, 0);
      return 0;
    }
    if (visiting.has(name)) {
      throw new Error(`computeWorkflowRunDepths: cycle detected in workflow_run graph at "${name}"`);
    }
    visiting.add(name);
    const d = 1 + Math.max(...producers.map((p) => depthOf(p)));
    visiting.delete(name);
    depths.set(name, d);
    return d;
  }

  for (const name of producersByName.keys()) depthOf(name);
  return depths;
}

/**
 * Pure. The depth of one specific hop (producer -> consumer), given the depths map `computeWorkflowRunDepths`
 * returned. A producer name not present in `depths` (unknown/external) is treated as depth 0 (a root),
 * same convention as `computeWorkflowRunDepths` itself.
 * @param {string} producerName
 * @param {Map<string, number>} depths
 * @returns {number}
 */
export function hopDepth(producerName, depths) {
  return (depths.get(producerName) ?? 0) + 1;
}

/**
 * Impure. Read every `.yml` file directly under `<repoRoot>/.github/workflows/`, extract each one's own
 * `name:` field and its `on.workflow_run.workflows` producer list (null when it has none), and return the
 * name -> producers map `computeWorkflowRunDepths` consumes. A file with no top-level `name:` is skipped
 * (malformed, not this reader's business - same posture as run-artifact.mjs's readRunHistory skipping a
 * bad file rather than throwing on the rest).
 * @param {string} repoRoot
 * @returns {Map<string, string[] | null>}
 */
export function readWorkflowRunGraph(repoRoot) {
  const dir = join(repoRoot, '.github', 'workflows');
  const map = new Map();
  let entries = [];
  try {
    entries = readdirSync(dir).filter((f) => f.endsWith('.yml'));
  } catch {
    return map;
  }
  for (const file of entries) {
    let text = '';
    try {
      text = readFileSync(join(dir, file), 'utf8');
    } catch {
      continue;
    }
    const name = extractWorkflowName(text);
    if (!name) continue;
    map.set(name, extractWorkflowRunNames(text));
  }
  return map;
}

/**
 * Pure. True when `producerYmlText` contains an explicit `gh workflow run <consumerFileBasename>`
 * dispatch call - the fallback this lane wires for a hop whose depth exceeds GitHub's 3-level
 * workflow_run chain limit (see this module's own header). Matches `gh workflow run` followed by the
 * filename, optionally quoted, allowing any flags/whitespace the real call carries after it.
 * @param {string} producerYmlText
 * @param {string} consumerFileBasename e.g. "propagation-drain.yml"
 * @returns {boolean}
 */
export function hasExplicitDispatchFallback(producerYmlText, consumerFileBasename) {
  const re = /\bgh\s+workflow\s+run\s+["']?([\w.-]+\.ya?ml)["']?/g;
  let m;
  while ((m = re.exec(producerYmlText))) {
    if (m[1] === consumerFileBasename) return true;
  }
  return false;
}
