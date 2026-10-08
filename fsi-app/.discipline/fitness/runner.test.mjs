// Integration tests for the fitness runner.
// Run: node --test fsi-app/.discipline/fitness/runner.test.mjs

import { test, after } from 'node:test';
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
  const r = spawnSync('node', [...nodeArgs, RUNNER, ...withFirings(args)], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
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
    const out = execFileSync('node', [RUNNER, ...withFirings(['--function=F2', '--verbose'])], { encoding: 'utf-8' });
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
    execFileSync('node', [RUNNER, ...withFirings(['--function=F999'])], { encoding: 'utf-8', stdio: 'pipe' });
    assert.fail('should have thrown');
  } catch (err) {
    assert.equal(err.status, 2);
  }
});

// ── lane GATE-3 (2026-10-08): the firing artifact ─────────────────────────────────────────────────────
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildFiringRecords, writeFiringsArtifact, EVIDENCE_MAX } from './runner.mjs';

// Lane TESTFIX-1 (2026-10-08): every runner invocation below writes the firing artifact, and without
// --firings-out it writes to the default fsi-app/.discipline/out/fitness-firings.json in the REAL working
// tree (gitignored, but a test must not write there). withFirings() points each invocation that does not
// name its own target at a private temp directory, removed when the file finishes.
const FIRINGS_SCRATCH = mkdtempSync(join(tmpdir(), 'fitness-runner-test-'));
after(() => { rmSync(FIRINGS_SCRATCH, { recursive: true, force: true }); });
function withFirings(args) {
  return args.some((a) => a.startsWith('--firings-out=')) ? args : [...args, `--firings-out=${join(FIRINGS_SCRATCH, 'fitness-firings.json')}`];
}

test('firings: one record per violation, with gate, verdict, file, line and evidence', () => {
  const recs = buildFiringRecords([
    { fn: { id: 'F39' }, file: 'fsi-app/src/a.ts', line: 12, message: 'bad .in()' },
    { fn: { id: 'F25' }, file: 'fsi-app/scripts/b.mjs', line: undefined, message: 'unwired' },
  ]);
  assert.deepEqual(recs, [
    { gate: 'F39', verdict: 'fail', file: 'fsi-app/src/a.ts', line: 12, evidence: 'bad .in()' },
    { gate: 'F25', verdict: 'fail', file: 'fsi-app/scripts/b.mjs', line: null, evidence: 'unwired' },
  ]);
});

test('firings: evidence is whitespace-collapsed and cut at 200 characters', () => {
  const long = 'x'.repeat(500);
  const [r] = buildFiringRecords([{ fn: { id: 'F1' }, file: 'f', line: 1, message: `a\n   b\t${long}` }]);
  assert.equal(r.evidence.length, EVIDENCE_MAX);
  assert.equal(EVIDENCE_MAX, 200);
  assert.ok(r.evidence.startsWith('a b xxx'));
});

test('firings: writeFiringsArtifact creates the directory and writes parseable JSON', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fitness-firings-'));
  try {
    const target = join(dir, 'nested', 'out', 'fitness-firings.json');
    writeFiringsArtifact(target, buildFiringRecords([{ fn: { id: 'F6' }, file: 'm.sql', line: 3, message: 'dup' }]));
    assert.deepEqual(JSON.parse(readFileSync(target, 'utf8')), [{ gate: 'F6', verdict: 'fail', file: 'm.sql', line: 3, evidence: 'dup' }]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('firings: a real runner invocation writes the artifact (an empty array when nothing fired) to --firings-out', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fitness-firings-'));
  try {
    const target = join(dir, 'fitness-firings.json');
    const r = runRunner(['--function=F6', '--quiet', `--firings-out=${target}`]);
    assert.ok(r.status === 0 || r.status === 1, `exit ${r.status}: ${r.err}`);
    assert.ok(existsSync(target), 'the artifact must exist after every run');
    const recs = JSON.parse(readFileSync(target, 'utf8'));
    assert.ok(Array.isArray(recs));
    if (r.status === 0) assert.deepEqual(recs, []);
    else assert.ok(recs.length > 0 && recs.every((x) => x.gate === 'F6' && x.verdict === 'fail'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
