// Tests for F9. Run: node --test fsi-app/.discipline/fitness/functions/F9-build-compiles.test.mjs
//
// Note: F9's real check invokes tsc against the whole project, which takes ~10-15s
// and depends on the live tsconfig + source. Unit tests here cover:
//   - Metadata fields
//   - Sentinel behavior (only triggers check on tsconfig.json sentinel)
//   - Result-shape expectations
//
// Integration verification (does tsc actually pass) is intentionally NOT a unit test;
// it's the operator running `node fsi-app/.discipline/fitness/runner.mjs --function=F9`
// or CI running the same. Unit-testing the integration would re-invoke tsc per test
// and slow the suite by minutes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitnessFunction, _findTsc } from './F9-build-compiles.mjs';

test('F9: has required metadata fields', () => {
  assert.equal(fitnessFunction.id, 'F9');
  assert.equal(typeof fitnessFunction.name, 'string');
  assert.ok(fitnessFunction.description.length > 0);
  assert.ok(fitnessFunction.source.includes('OBS-64'));
});

test('F9: enumerate returns single sentinel path', () => {
  const files = fitnessFunction.enumerate();
  assert.equal(files.length, 1);
  assert.equal(files[0], 'fsi-app/tsconfig.json');
});

test('F9: check on non-sentinel filepath returns empty (PASS)', () => {
  const v = fitnessFunction.check('fsi-app/src/lib/foo.ts', 'some content');
  assert.deepEqual(v, []);
});

test('F9: _findTsc returns a path or null', () => {
  // Either fsi-app/node_modules/.bin/tsc(.cmd) exists, or null.
  const tsc = _findTsc();
  if (tsc !== null) {
    assert.ok(typeof tsc === 'string');
    assert.ok(tsc.endsWith('tsc') || tsc.endsWith('tsc.cmd'));
  }
});

// Optional integration smoke (slow; only run if explicitly invoked via the runner).
// This test is here for documentation purposes; the actual gate is the runner
// running F9 against the codebase.
