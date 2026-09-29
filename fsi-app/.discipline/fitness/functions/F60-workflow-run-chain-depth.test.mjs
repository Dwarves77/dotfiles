// F60-workflow-run-chain-depth.test.mjs - lane LOOP-B-FIRING, 2026-09-28. ATTACK tests: a hop past
// GitHub's documented workflow_run chain-depth limit is caught when its producer carries no explicit
// dispatch fallback, and is cleared once it does. Plus a live proof that today's real tree (this lane's
// own fix, downstream-chain.yml's explicit `gh workflow run propagation-drain.yml` step) reports zero
// violations.
//
// node:test + node:assert/strict, no npm deps.
// Run: node --test .discipline/fitness/functions/F60-workflow-run-chain-depth.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitnessFunction } from './F60-workflow-run-chain-depth.mjs';

// ── LIVE: the real tree, today, reports zero violations (this lane's own fix) ───────────────────────

test('LIVE: fitnessFunction.check() over the real committed tree returns zero violations', () => {
  const result = fitnessFunction.check();
  assert.deepEqual(
    result,
    [],
    `expected 0 violations, got: ${JSON.stringify(result, null, 2)}`,
  );
});

test('enumerate() returns exactly one sentinel path (holistic pattern, same as F50)', () => {
  assert.deepEqual(fitnessFunction.enumerate(), ['fsi-app/.discipline/governance/loop-manifest.mjs']);
});

test('fitnessFunction carries the required id/name/description/source shape', () => {
  assert.equal(fitnessFunction.id, 'F60');
  assert.equal(fitnessFunction.name, 'workflow-run-chain-depth');
  assert.equal(typeof fitnessFunction.description, 'string');
  assert.ok(fitnessFunction.description.length > 0);
  assert.equal(typeof fitnessFunction.source, 'string');
  assert.match(fitnessFunction.source, /events-that-trigger-workflows/);
});
