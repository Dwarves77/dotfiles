// Red-then-green for F65 (no-bracket-path-tests). Rule 15: a guard is proven by attack, not by
// presence -- the RED case below is exactly the fixture shape CF-SEC-11 found (a *.npmtest.mjs
// colocated under a literal [param]/ route directory); it MUST fail.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isGovernedTestPath,
  hasBracketChar,
  findBracketPathTests,
  fitnessFunction,
} from './F65-no-bracket-path-tests.mjs';

test('isGovernedTestPath: recognizes all four governed suffixes, case notwithstanding path case', () => {
  assert.equal(isGovernedTestPath('fsi-app/scripts/foo.test.mjs'), true);
  assert.equal(isGovernedTestPath('fsi-app/scripts/foo.npmtest.mjs'), true);
  assert.equal(isGovernedTestPath('fsi-app/scripts/foo.selftest.mjs'), true);
  assert.equal(isGovernedTestPath('fsi-app/scripts/foo.golden.mjs'), true);
  assert.equal(isGovernedTestPath('fsi-app/scripts/foo.mjs'), false);
  assert.equal(isGovernedTestPath('fsi-app/scripts/foo.ts'), false);
});

test('hasBracketChar: true for either bracket, anywhere in the path', () => {
  assert.equal(hasBracketChar('fsi-app/src/app/api/[id]/route.test.mjs'), true);
  assert.equal(hasBracketChar('fsi-app/src/app/[locale]/page.npmtest.mjs'), true);
  assert.equal(hasBracketChar('fsi-app/scripts/foo.test.mjs'), false);
});

test('RED (fixture that MUST fail, rule 15, the exact CF-SEC-11 shape): a *.npmtest.mjs colocated under a [param]/ route dir is flagged', () => {
  const paths = [
    'fsi-app/src/app/api/admin/statutory-rows/[id]/route.ts',
    'fsi-app/src/app/api/admin/statutory-rows/[id]/route.npmtest.mjs',
    'fsi-app/scripts/lib/db.mjs',
  ];
  const bad = findBracketPathTests(paths);
  assert.deepEqual(bad, ['fsi-app/src/app/api/admin/statutory-rows/[id]/route.npmtest.mjs']);
});

test('RED: each of the four governed suffixes is independently caught under a bracket segment', () => {
  const paths = [
    'fsi-app/src/app/[locale]/page.test.mjs',
    'fsi-app/src/app/[locale]/page.npmtest.mjs',
    'fsi-app/src/app/[locale]/page.selftest.mjs',
    'fsi-app/src/app/[locale]/page.golden.mjs',
  ];
  assert.deepEqual(findBracketPathTests(paths), paths.slice().sort());
});

test('GREEN: a governed test path with no bracket is never flagged', () => {
  const paths = [
    'fsi-app/scripts/lib/db.test.mjs',
    'fsi-app/.discipline/fitness/functions/F44-broken-main-guard.test.mjs',
  ];
  assert.deepEqual(findBracketPathTests(paths), []);
});

test('GREEN: a non-test path with a bracket segment is never flagged (only governed test suffixes count)', () => {
  const paths = [
    'fsi-app/src/app/api/admin/statutory-rows/[id]/route.ts',
    'fsi-app/src/app/[locale]/page.tsx',
  ];
  assert.deepEqual(findBracketPathTests(paths), []);
});

test('findBracketPathTests: sorts its output deterministically', () => {
  const paths = [
    'fsi-app/z/[b]/z.test.mjs',
    'fsi-app/a/[a]/a.test.mjs',
  ];
  assert.deepEqual(findBracketPathTests(paths), [
    'fsi-app/a/[a]/a.test.mjs',
    'fsi-app/z/[b]/z.test.mjs',
  ]);
});

// GATE-4 (2026-10-07): this test runs the fitness function against the live repo, which the Fitness
// functions job already does on every pull request (gate evaluation B section 7.6: it failed the unit-test
// step while the gate itself passed in the fitness job). It stays runnable here with FITNESS_LIVE_TESTS=1.
const LIVE_TREE = process.env.FITNESS_LIVE_TESTS === '1' ? {} : { skip: 'live-tree self-test, run by the Fitness functions job; set FITNESS_LIVE_TESTS=1 to run it here' };

test('LIVE: the real tracked tree carries zero bracket-path governed tests today', LIVE_TREE, () => {
  const violations = fitnessFunction.check();
  assert.deepEqual(violations, []);
});
