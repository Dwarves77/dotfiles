// Tests for the governance and consistency firing records (lane GATE-8, 2026-10-08, brief item 7).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildGateFiringRecords, writeGateFirings, recordGateFirings, governanceFiringsPath, EVIDENCE_MAX } from './gate-firings.mjs';

test('buildGateFiringRecords: one record per failure, the fitness artifact shape, evidence capped', () => {
  const recs = buildGateFiringRecords('memory-gate', [
    { message: 'a'.repeat(500) },
    { file: 'docs/x.md', line: 7, reason: 'closure reason' },
    { path: 'p', detail: 'd' },
    { id: 'workflow:x.yml', reason: 'NEVER-RUN' },
  ]);
  assert.equal(recs.length, 4);
  assert.deepEqual(Object.keys(recs[0]), ['gate', 'verdict', 'file', 'line', 'evidence']);
  assert.equal(recs[0].verdict, 'fail');
  assert.equal(recs[0].evidence.length, EVIDENCE_MAX);
  assert.equal(recs[1].file, 'docs/x.md');
  assert.equal(recs[1].line, 7);
  assert.equal(recs[2].file, 'p');
  assert.equal(recs[3].evidence, 'NEVER-RUN');
  assert.deepEqual(buildGateFiringRecords('g', []), []);
});

test('writeGateFirings: replaces this gate\'s records, keeps other gates\', and an empty set clears the gate', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gate-firings-'));
  const env = { DISCIPLINE_GATE_FIRINGS: join(dir, 'out', 'gf.json') };
  try {
    recordGateFirings('closure-gate', [{ reason: 'one' }, { reason: 'two' }], env);
    recordGateFirings('memory-gate', [{ message: 'm' }], env);
    let all = JSON.parse(readFileSync(env.DISCIPLINE_GATE_FIRINGS, 'utf8'));
    assert.deepEqual(all.map((r) => r.gate).sort(), ['closure-gate', 'closure-gate', 'memory-gate']);
    recordGateFirings('closure-gate', [{ reason: 'only' }], env);
    all = JSON.parse(readFileSync(env.DISCIPLINE_GATE_FIRINGS, 'utf8'));
    assert.equal(all.filter((r) => r.gate === 'closure-gate').length, 1);
    recordGateFirings('closure-gate', [], env); // a pass clears the gate
    all = JSON.parse(readFileSync(env.DISCIPLINE_GATE_FIRINGS, 'utf8'));
    assert.deepEqual(all.map((r) => r.gate), ['memory-gate']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('DISCIPLINE_GATE_FIRINGS=off writes nothing, and a write that cannot happen never throws', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gate-firings-'));
  try {
    assert.equal(governanceFiringsPath({ DISCIPLINE_GATE_FIRINGS: 'off' }), null);
    assert.equal(writeGateFirings('g', [{ gate: 'g' }], { DISCIPLINE_GATE_FIRINGS: 'off' }), null);
    // a path under a file (not a directory) cannot be created
    const blocker = join(dir, 'blocker');
    writeGateFirings('g', [], { DISCIPLINE_GATE_FIRINGS: blocker });
    assert.equal(writeGateFirings('g', [], { DISCIPLINE_GATE_FIRINGS: join(blocker, 'nested', 'x.json') }), null);
    assert.equal(existsSync(join(blocker, 'nested')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the default path is .discipline/out/governance-firings.json (the directory the fitness artifact uses)', () => {
  const p = governanceFiringsPath({}).replace(/\\/g, '/');
  assert.match(p, /fsi-app\/\.discipline\/out\/governance-firings\.json$/);
});
