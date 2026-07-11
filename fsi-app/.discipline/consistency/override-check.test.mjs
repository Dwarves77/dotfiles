// Tests for the override-aware consistency primitive (g1/g1b): drift parsing + VALID override parsing
// (non-empty rationale + future deadline) + the pure verdict + pre-push stdin range parsing.
// Run: node --test fsi-app/.discipline/consistency/override-check.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDriftCheckIds,
  parseValidOverrides,
  evaluate,
  messagesFromPrepushStdin,
} from './override-check.mjs';

const NOW = new Date('2026-07-11T12:00:00Z');

test('parseDriftCheckIds: pulls C-ids from stderr drift lines only', () => {
  const stderr = '=== Consistency drift ===\n\n  [C3] missing-claim\n        detail\n  [C4] orphan\n';
  assert.deepEqual([...parseDriftCheckIds(stderr)].sort(), ['C3', 'C4']);
});

test('parseValidOverrides: a non-empty rationale + FUTURE deadline is valid', () => {
  const msg = 'subject\n\nConsistency-Override: C3 (rationale: migration lands next PR; remediation-deadline: 2026-08-01)';
  assert.deepEqual([...parseValidOverrides([msg], { now: NOW })], ['C3']);
});

test('parseValidOverrides: accepts the C-3 hyphen form, normalizes to C3', () => {
  const msg = 'Consistency-Override: C-4 (rationale: worktree cleanup pending; remediation-deadline: 2026-12-31)';
  assert.deepEqual([...parseValidOverrides([msg], { now: NOW })], ['C4']);
});

test('parseValidOverrides: an EXPIRED deadline is NOT a valid override', () => {
  const msg = 'Consistency-Override: C3 (rationale: stale; remediation-deadline: 2026-01-01)';
  assert.deepEqual([...parseValidOverrides([msg], { now: NOW })], []);
});

test('parseValidOverrides: today counts as valid (>= today)', () => {
  const msg = 'Consistency-Override: C3 (rationale: fixing today; remediation-deadline: 2026-07-11)';
  assert.deepEqual([...parseValidOverrides([msg], { now: NOW })], ['C3']);
});

test('parseValidOverrides: EMPTY rationale is rejected', () => {
  const msg = 'Consistency-Override: C3 (rationale: ; remediation-deadline: 2026-08-01)';
  assert.deepEqual([...parseValidOverrides([msg], { now: NOW })], []);
});

test('evaluate: clean runner (status 0) passes with no drift', () => {
  const v = evaluate({ runnerStatus: 0, stderr: '', messages: [], now: NOW });
  assert.equal(v.ok, true);
  assert.deepEqual(v.failing, []);
});

test('evaluate: drift with NO override FAILS (uncovered)', () => {
  const v = evaluate({ runnerStatus: 1, stderr: '  [C3] missing-claim\n', messages: ['no trailer'], now: NOW });
  assert.equal(v.ok, false);
  assert.deepEqual(v.uncovered, ['C3']);
});

test('evaluate: drift with a matching VALID override PASSES', () => {
  const msg = 'Consistency-Override: C3 (rationale: will fix; remediation-deadline: 2026-09-01)';
  const v = evaluate({ runnerStatus: 1, stderr: '  [C3] missing-claim\n', messages: [msg], now: NOW });
  assert.equal(v.ok, true);
  assert.deepEqual(v.uncovered, []);
});

test('evaluate: PARTIAL override (C3 covered, C4 not) FAILS on the uncovered one', () => {
  const msg = 'Consistency-Override: C3 (rationale: will fix; remediation-deadline: 2026-09-01)';
  const v = evaluate({ runnerStatus: 1, stderr: '  [C3] x\n  [C4] y\n', messages: [msg], now: NOW });
  assert.equal(v.ok, false);
  assert.deepEqual(v.uncovered, ['C4']);
});

test('evaluate: runner ERROR (status 2) is not passable', () => {
  const v = evaluate({ runnerStatus: 2, stderr: '', messages: [], now: NOW });
  assert.equal(v.ok, false);
  assert.equal(v.runnerError, true);
});

test('messagesFromPrepushStdin: deleting a ref (zero local sha) yields nothing', () => {
  const stdin = 'refs/heads/x 0000000000000000000000000000000000000000 refs/heads/x abc123\n';
  assert.deepEqual(messagesFromPrepushStdin(stdin, process.cwd()), []);
});
