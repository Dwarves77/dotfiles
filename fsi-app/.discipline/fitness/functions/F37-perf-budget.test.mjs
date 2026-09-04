// Fire-tests for F37 (perf-budget ratchet).
// Run: node --test fsi-app/.discipline/fitness/functions/F37-perf-budget.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitnessFunction, checkRegistry } from './F37-perf-budget.mjs';
import { isWellFormedMetric, PERF_BUDGET_REGISTRY, REQUIRED_ROUTES } from '../../../src/lib/perf/perf-budget.mjs';

const REGISTRY_FILE = 'fsi-app/src/lib/perf/perf-budget.mjs';

test('isWellFormedMetric: GREEN — a real registry-shaped metric passes', () => {
  assert.equal(
    isWellFormedMetric({
      ratchet: 1000,
      target: 200,
      measuredAt: '2026-09-04',
      evidence: '[CONFIRMED] measured live.',
    }),
    true,
  );
});

test('isWellFormedMetric: RED — target worse than ratchet is never allowed', () => {
  assert.equal(
    isWellFormedMetric({ ratchet: 100, target: 200, measuredAt: '2026-09-04', evidence: '[CONFIRMED] x' }),
    false,
  );
});

test('isWellFormedMetric: RED — an unlabeled evidence string (no [CONFIRMED]/[HYPOTHESIS]) fails, per CLAUDE.md rule 14', () => {
  assert.equal(
    isWellFormedMetric({ ratchet: 100, target: 50, measuredAt: '2026-09-04', evidence: 'measured it, trust me' }),
    false,
  );
});

test('isWellFormedMetric: RED — a [HYPOTHESIS] label is accepted, not just [CONFIRMED]', () => {
  assert.equal(
    isWellFormedMetric({ ratchet: 100, target: 50, measuredAt: '2026-09-04', evidence: '[HYPOTHESIS] not yet verified live.' }),
    true,
  );
});

test('isWellFormedMetric: RED — negative ratchet, negative target, non-finite, missing/malformed date all fail', () => {
  assert.equal(isWellFormedMetric({ ratchet: -1, target: 0, measuredAt: '2026-09-04', evidence: '[CONFIRMED] x' }), false);
  assert.equal(isWellFormedMetric({ ratchet: 100, target: -1, measuredAt: '2026-09-04', evidence: '[CONFIRMED] x' }), false);
  assert.equal(isWellFormedMetric({ ratchet: Infinity, target: 0, measuredAt: '2026-09-04', evidence: '[CONFIRMED] x' }), false);
  assert.equal(isWellFormedMetric({ ratchet: 100, target: 50, measuredAt: '09/04/2026', evidence: '[CONFIRMED] x' }), false);
  assert.equal(isWellFormedMetric({ ratchet: 100, target: 50, evidence: '[CONFIRMED] x' }), false);
  assert.equal(isWellFormedMetric(null), false);
  assert.equal(isWellFormedMetric(undefined), false);
});

test('check(): a file other than the registry is always PASS (out of scope)', () => {
  assert.deepEqual(fitnessFunction.check('fsi-app/src/lib/perf/server-timing.ts'), []);
});

test('LIVE: the real PERF_BUDGET_REGISTRY passes check() with zero violations', () => {
  const violations = fitnessFunction.check(REGISTRY_FILE);
  assert.deepEqual(violations, [], `expected 0 violations, got: ${JSON.stringify(violations, null, 2)}`);
});

test('LIVE: every REQUIRED_ROUTES entry is present in PERF_BUDGET_REGISTRY with >=1 metric', () => {
  for (const route of REQUIRED_ROUTES) {
    const entry = PERF_BUDGET_REGISTRY[route];
    assert.ok(entry, `missing registry entry for required route "${route}"`);
    assert.ok(Object.keys(entry).length > 0, `registry entry "${route}" has no metrics`);
  }
});

test('RED: checkRegistry() catches a route dropped from REQUIRED_ROUTES coverage', () => {
  const violations = checkRegistry({}, REQUIRED_ROUTES);
  assert.equal(violations.length, REQUIRED_ROUTES.length);
  for (const v of violations) assert.match(v.message, /no entry for it/);
});

test('RED: checkRegistry() catches an entry with zero metrics', () => {
  const violations = checkRegistry({ 'regulations-list': {} }, ['regulations-list']);
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /has no metrics/);
});

test('RED: checkRegistry() catches a malformed metric (target worse than ratchet)', () => {
  const violations = checkRegistry(
    {
      'workspace-bootstrap': {
        sequentialDbHops: { ratchet: 1, target: 2, measuredAt: '2026-09-04', evidence: '[CONFIRMED] x' },
      },
    },
    ['workspace-bootstrap'],
  );
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /not well-formed/);
});

test('GREEN: checkRegistry() passes a well-formed fixture registry with zero violations', () => {
  const violations = checkRegistry(
    {
      'workspace-bootstrap': {
        sequentialDbHops: { ratchet: 1, target: 1, measuredAt: '2026-09-04', evidence: '[CONFIRMED] x' },
      },
    },
    ['workspace-bootstrap'],
  );
  assert.deepEqual(violations, []);
});

test('LIVE: enumerate() targets exactly the registry file', () => {
  assert.deepEqual(fitnessFunction.enumerate(), [REGISTRY_FILE]);
});
