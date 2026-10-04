// Integration tests for the fitness runner.
// Run: node --test fsi-app/.discipline/fitness/runner.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const RUNNER = resolve(import.meta.dirname, 'runner.mjs');

test('runner: --list prints registered functions', () => {
  const out = execFileSync('node', [RUNNER, '--list'], { encoding: 'utf-8' });
  assert.match(out, /\[F2\]/);
  assert.match(out, /\[F6\]/);
  assert.match(out, /\[F8\]/);
  assert.match(out, /\[F9\]/);
  assert.match(out, /admin-routes-isPlatformAdmin/);
  assert.match(out, /client-server-tier-boundary/);
});

// Lane GATES-1 (2026-10-04). This file is in the no-npm discipline glob, whose CI job never runs npm ci.
// The old smoke test spawned the WHOLE runner there, so F9 to F12 (which need fsi-app's installed
// dependencies) printed "FAILED" stacks into the job log inside a passing test. The smoke test now runs
// an npm-free subset and captures the child's stderr so nothing leaks; F9 to F12 are enforced by the
// Fitness functions job, which installs dependencies.
const NPM_FREE_SUBSET = ['F2', 'F6', 'F8'];
const SANDBOX = pathToFileURL(resolve(import.meta.dirname, '..', 'lib', 'no-npm-sandbox.mjs')).href;

function runRunner(args, nodeArgs = []) {
  const r = spawnSync('node', [...nodeArgs, RUNNER, ...args], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
  return { status: r.status, out: r.stdout || '', err: r.stderr || '' };
}

test('runner: npm-free subset executes without engine errors and leaks nothing to this process', () => {
  for (const id of NPM_FREE_SUBSET) {
    const r = runRunner([`--function=${id}`, '--quiet']);
    // 0 = clean, 1 = violations found (informative for a smoke test); 2 would be an engine error.
    assert.ok(r.status === 0 || r.status === 1, `runner --function=${id} exited ${r.status}: ${r.err}`);
    if (r.status === 1) assert.ok(r.err.includes('=== Fitness violations ==='));
    assert.equal(r.err.includes('ERR_MODULE_NOT_FOUND'), false, `${id} must not need an npm package`);
  }
});

test('runner: F9 to F12 with no installed dependencies SKIP (no violation, exit 0)', () => {
  // The no-npm sandbox reproduces CI's "no npm ci" job: jiti and typescript do not resolve from fsi-app/.
  for (const id of ['F9', 'F10', 'F11', 'F12']) {
    const r = runRunner([`--function=${id}`], ['--import', SANDBOX]);
    assert.equal(r.status, 0, `${id} must not violate when dependencies are absent: ${r.out}${r.err}`);
    assert.ok(r.out.includes(`[${id}] SKIP:`), `${id} must report a SKIP line: ${r.out}`);
    assert.equal(r.err.includes('FAILED'), false);
    assert.equal(r.err.includes('=== Fitness violations ==='), false);
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
