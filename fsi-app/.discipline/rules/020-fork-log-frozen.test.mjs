// Fire-tests for rule 020 (deprecated session-log fork is frozen).
// Run: node --test fsi-app/.discipline/rules/020-fork-log-frozen.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rule } from './020-fork-log-frozen.mjs';
import { buildContextFromFixture } from '../lib/context.mjs';

const FORK = 'fsi-app/docs/ops/session-log.md';
const CANON = 'docs/ops/session-log.md';

test('020 trigger: fires when the fork gains additions', () => {
  const ctx = buildContextFromFixture({
    message: 'log: session entry',
    files: [{ path: FORK, status: 'M', additions: 12, deletions: 0 }],
  });
  assert.equal(rule.trigger(ctx), true);
});

test('020 trigger: does NOT fire on a pure deletion from the fork', () => {
  const ctx = buildContextFromFixture({
    message: 'cleanup: trim fork',
    files: [{ path: FORK, status: 'M', additions: 0, deletions: 40 }],
  });
  assert.equal(rule.trigger(ctx), false);
});

test('020 trigger: does NOT fire when only the canonical root log changes', () => {
  const ctx = buildContextFromFixture({
    message: 'log: session entry',
    files: [{ path: CANON, status: 'M', additions: 20, deletions: 0 }],
  });
  assert.equal(rule.trigger(ctx), false);
});

test('020 trigger: skips merge commits (a master-merge may carry fork history)', () => {
  const ctx = buildContextFromFixture({
    message: "Merge remote-tracking branch 'origin/master'",
    files: [{ path: FORK, status: 'M', additions: 30, deletions: 0 }],
    isMergeCommit: true,
  });
  assert.equal(rule.trigger(ctx), false);
});

test('020 check: FAIL — the exact 2026-07-20 near-miss (a cat >> to the fork)', () => {
  const ctx = buildContextFromFixture({
    message: 'log: exhaustion pass',
    files: [{ path: FORK, status: 'M', additions: 9, deletions: 0 }],
  });
  const r = rule.check(ctx);
  assert.equal(r.status, 'FAIL');
  assert.ok(r.message.includes(FORK));
  assert.ok(r.remediation.includes(CANON));
});

test('020 check: PASS — the entry landed at the canonical root path', () => {
  const ctx = buildContextFromFixture({
    message: 'log: exhaustion pass',
    files: [{ path: CANON, status: 'M', additions: 9, deletions: 0 }],
  });
  assert.equal(rule.check(ctx).status, 'PASS');
});

test('020 check: PASS — Windows-style backslash path to the fork still normalizes and is caught by trigger, but a delete-only passes check', () => {
  const ctx = buildContextFromFixture({
    message: 'cleanup',
    files: [{ path: 'fsi-app\\docs\\ops\\session-log.md', status: 'M', additions: 0, deletions: 5 }],
  });
  assert.equal(rule.trigger(ctx), false);
  assert.equal(rule.check(ctx).status, 'PASS');
});

test('020 check: FAIL — Windows-style backslash path with additions is normalized and rejected', () => {
  const ctx = buildContextFromFixture({
    message: 'log',
    files: [{ path: 'fsi-app\\docs\\ops\\session-log.md', status: 'M', additions: 3, deletions: 0 }],
  });
  assert.equal(rule.check(ctx).status, 'FAIL');
});
