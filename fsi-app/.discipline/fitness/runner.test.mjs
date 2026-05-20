// Integration tests for the fitness runner.
// Run: node --test fsi-app/.discipline/fitness/runner.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const RUNNER = resolve(import.meta.dirname, 'runner.mjs');

test('runner: --list prints registered functions', () => {
  const out = execFileSync('node', [RUNNER, '--list'], { encoding: 'utf-8' });
  assert.match(out, /\[F2\]/);
  assert.match(out, /\[F3\]/);
  assert.match(out, /admin-routes-isPlatformAdmin/);
  assert.match(out, /src-no-discipline-imports/);
});

test('runner: scans real codebase and reports', () => {
  // Run against the actual codebase; should either pass clean or surface known violations.
  // Either outcome is informative; this test just verifies the runner executes without engine errors.
  try {
    const out = execFileSync('node', [RUNNER, '--quiet'], { encoding: 'utf-8' });
    // Exit code 0 = no violations
    assert.ok(typeof out === 'string');
  } catch (err) {
    // Exit code 1 = violations found; that's fine for this smoke test, just confirm output structure
    assert.equal(err.status, 1, `runner failed with code ${err.status} unexpectedly: ${err.message}`);
    assert.ok(err.stderr.includes('=== Fitness violations ==='));
  }
});

test('runner: --function=F2 runs only F2', () => {
  try {
    const out = execFileSync('node', [RUNNER, '--function=F2', '--verbose'], { encoding: 'utf-8' });
    assert.match(out, /\[F2\]/);
    // F3 should not appear in the run output
    assert.equal(out.includes('[F3]'), false);
  } catch (err) {
    assert.equal(err.status, 1);
    assert.match(err.stdout + err.stderr, /\[F2\]/);
  }
});

test('runner: --function with unknown id exits 2', () => {
  try {
    execFileSync('node', [RUNNER, '--function=F999'], { encoding: 'utf-8', stdio: 'pipe' });
    assert.fail('should have thrown');
  } catch (err) {
    assert.equal(err.status, 2);
  }
});
