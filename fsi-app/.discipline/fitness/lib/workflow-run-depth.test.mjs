// workflow-run-depth.test.mjs - lane LOOP-B-FIRING, 2026-09-28. Proves the depth model against GitHub's
// own documented example verbatim, plus this repo's real chain shape (the downstream-chain ->
// propagation-drain hop that never fires), plus the explicit-dispatch-fallback text scanner.
//
// node:test + node:assert/strict, no npm deps.
// Run: node --test .discipline/fitness/lib/workflow-run-depth.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeWorkflowRunDepths,
  hopDepth,
  hasExplicitDispatchFallback,
} from './workflow-run-depth.mjs';

// ── computeWorkflowRunDepths: GitHub's own documented example, verbatim shape ───────────────────────
// "if you attempt to trigger five workflows (named B to F) to run sequentially after an initial
// workflow A has run (that is: A -> B -> C -> D -> E -> F), workflows E and F will not be run."
// A is a root (no workflow_run trigger); B is triggered by A; C by B; D by C; E by D; F by E.

test('GitHub docs example: A is a root (depth 0)', () => {
  const graph = new Map([
    ['A', null],
    ['B', ['A']],
    ['C', ['B']],
    ['D', ['C']],
    ['E', ['D']],
    ['F', ['E']],
  ]);
  const depths = computeWorkflowRunDepths(graph);
  assert.equal(depths.get('A'), 0);
});

test('GitHub docs example: B, C, D are the three levels that DO fire (depth 1, 2, 3)', () => {
  const graph = new Map([
    ['A', null],
    ['B', ['A']],
    ['C', ['B']],
    ['D', ['C']],
    ['E', ['D']],
    ['F', ['E']],
  ]);
  const depths = computeWorkflowRunDepths(graph);
  assert.equal(depths.get('B'), 1);
  assert.equal(depths.get('C'), 2);
  assert.equal(depths.get('D'), 3);
});

test('GitHub docs example: E and F are past the limit (depth 4, 5) -- the docs say these "will not be run"', () => {
  const graph = new Map([
    ['A', null],
    ['B', ['A']],
    ['C', ['B']],
    ['D', ['C']],
    ['E', ['D']],
    ['F', ['E']],
  ]);
  const depths = computeWorkflowRunDepths(graph);
  assert.equal(depths.get('E'), 4);
  assert.equal(depths.get('F'), 5);
  assert.ok(depths.get('E') > 3);
  assert.ok(depths.get('F') > 3);
});

// ── computeWorkflowRunDepths: this repo's real shape (the hop that has never fired) ────────────────

test("this repo's real chain: downstream-chain is depth 3 (fed by population-turn/corpus-turn, both depth 2)", () => {
  const graph = new Map([
    ['Source sweep', null],
    ['Ledger consume', ['Source sweep']],
    ['Population turn', ['Ledger consume']],
    ['Corpus turn', ['Ledger consume']],
    ['Downstream chain', ['Population turn', 'Corpus turn']],
    ['Data producers', null],
    ['Propagation drain', ['Data producers', 'Downstream chain']],
  ]);
  const depths = computeWorkflowRunDepths(graph);
  assert.equal(depths.get('Source sweep'), 0);
  assert.equal(depths.get('Ledger consume'), 1);
  assert.equal(depths.get('Population turn'), 2);
  assert.equal(depths.get('Corpus turn'), 2);
  assert.equal(depths.get('Downstream chain'), 3);
});

test("this repo's real chain: the downstream-chain -> propagation-drain hop is depth 4 (past the limit); the producers -> propagation-drain hop is depth 1 (fine)", () => {
  const graph = new Map([
    ['Source sweep', null],
    ['Ledger consume', ['Source sweep']],
    ['Population turn', ['Ledger consume']],
    ['Corpus turn', ['Ledger consume']],
    ['Downstream chain', ['Population turn', 'Corpus turn']],
    ['Data producers', null],
    ['Propagation drain', ['Data producers', 'Downstream chain']],
  ]);
  const depths = computeWorkflowRunDepths(graph);
  assert.equal(hopDepth('Downstream chain', depths), 4);
  assert.equal(hopDepth('Data producers', depths), 1);
});

// ── computeWorkflowRunDepths: edge cases ─────────────────────────────────────────────────────────────

test('a workflow with an empty producers array (malformed workflow_run block) is treated as a root', () => {
  const graph = new Map([['X', []]]);
  const depths = computeWorkflowRunDepths(graph);
  assert.equal(depths.get('X'), 0);
});

test('a cycle throws a named error rather than looping forever', () => {
  const graph = new Map([
    ['A', ['B']],
    ['B', ['A']],
  ]);
  assert.throws(() => computeWorkflowRunDepths(graph), /cycle detected/);
});

// ── hopDepth: an unknown/external producer name is treated as a root (depth 0), hop depth 1 ─────────

test('hopDepth: a producer name absent from the depths map is treated as an external root', () => {
  const depths = new Map([['Known', 2]]);
  assert.equal(hopDepth('Some unrelated external workflow', depths), 1);
});

// ── hasExplicitDispatchFallback ───────────────────────────────────────────────────────────────────

test('hasExplicitDispatchFallback: finds a plain gh workflow run call naming the consumer file', () => {
  const yml = 'run: |\n  gh workflow run propagation-drain.yml --ref ${{ github.ref_name }} -f mode=apply\n';
  assert.equal(hasExplicitDispatchFallback(yml, 'propagation-drain.yml'), true);
});

test('hasExplicitDispatchFallback: finds a quoted filename', () => {
  const yml = 'run: |\n  gh workflow run "propagation-drain.yml" --ref main\n';
  assert.equal(hasExplicitDispatchFallback(yml, 'propagation-drain.yml'), true);
});

test('hasExplicitDispatchFallback: false when the yml has no such call at all', () => {
  const yml = 'run: |\n  echo hello\n';
  assert.equal(hasExplicitDispatchFallback(yml, 'propagation-drain.yml'), false);
});

test('hasExplicitDispatchFallback: false when a gh workflow run call names a DIFFERENT file', () => {
  const yml = 'run: |\n  gh workflow run some-other-workflow.yml\n';
  assert.equal(hasExplicitDispatchFallback(yml, 'propagation-drain.yml'), false);
});
