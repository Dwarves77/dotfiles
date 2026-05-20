// Tests for rule 004. Run: node --test fsi-app/.discipline/rules/004-batch-script-resilience.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rule } from './004-batch-script-resilience.mjs';
import { buildContextFromFixture } from '../lib/context.mjs';

// ---------------------------------------------------------------------------
// Trigger
// ---------------------------------------------------------------------------

test('004 trigger: skips when no batch scripts touched', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: UI component',
    files: [{ path: 'fsi-app/src/components/foo.tsx', additions: 30, deletions: 0 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), false);
});

test('004 trigger: skips merge commit', () => {
  const ctx = buildContextFromFixture({
    message: 'Merge branch feat/batch',
    files: [{ path: 'fsi-app/scripts/q4-batch.mjs', additions: 100, deletions: 50 }],
    branch: 'master',
    isMergeCommit: true,
  });
  assert.equal(rule.trigger(ctx), false);
});

test('004 trigger: skips changes to scripts/lib/ (primitives library itself)', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: extend batch-primitives',
    files: [{ path: 'fsi-app/scripts/lib/batch-primitives.mjs', additions: 80, deletions: 10 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), false);
});

test('004 trigger: skips changes to scripts/tmp/', () => {
  const ctx = buildContextFromFixture({
    message: 'chore: scratch script',
    files: [{ path: 'fsi-app/scripts/tmp/explore.mjs', additions: 60, deletions: 0 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), false);
});

test('004 trigger: skips trivial change (<=5 line churn) — comment-only edit', () => {
  const ctx = buildContextFromFixture({
    message: 'docs: comment in batch',
    files: [{ path: 'fsi-app/scripts/q4-batch.mjs', additions: 2, deletions: 1 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), false);
});

test('004 trigger: skips non-.mjs files under scripts/', () => {
  const ctx = buildContextFromFixture({
    message: 'docs: scripts readme',
    files: [{ path: 'fsi-app/scripts/README.md', additions: 50, deletions: 0 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), false);
});

test('004 trigger: fires on new batch script under scripts/', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: add q5 batch',
    files: [{ path: 'fsi-app/scripts/q5-batch.mjs', status: 'A', additions: 250, deletions: 0 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

test('004 trigger: fires on modification of existing batch script', () => {
  const ctx = buildContextFromFixture({
    message: 'fix: q4 batch idempotency',
    files: [{ path: 'fsi-app/scripts/q4-batch.mjs', additions: 30, deletions: 20 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

test('004 trigger: fires on cron batch under scripts/cron/', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: q7 daily recompute',
    files: [{ path: 'fsi-app/scripts/cron/q7-daily-recompute.mjs', status: 'A', additions: 150, deletions: 0 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

// ---------------------------------------------------------------------------
// Check: line presence
// ---------------------------------------------------------------------------

test('004 check: FAIL when no Batch-resilience line', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: add q5 batch\n\nbody without resilience line.',
    files: [{ path: 'fsi-app/scripts/q5-batch.mjs', status: 'A', additions: 250, deletions: 0 }],
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'FAIL');
  assert.ok(result.message.includes('Batch-resilience'));
});

test('004 check: PASS when Batch-resilience line consumes primitives format', () => {
  const ctx = buildContextFromFixture({
    message: [
      'feat: add q5 batch',
      '',
      'body.',
      '',
      'Batch-resilience: fsi-app/scripts/q5-batch.mjs consumes withRetry+createPgPool+isAnthropicRetryable',
    ].join('\n'),
    files: [{ path: 'fsi-app/scripts/q5-batch.mjs', status: 'A', additions: 250, deletions: 0 }],
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'PASS');
});

test('004 check: PASS when Batch-resilience line is a deferred attestation', () => {
  const ctx = buildContextFromFixture({
    message: [
      'feat: supabase-based cron',
      '',
      'body.',
      '',
      'Batch-resilience: fsi-app/scripts/cron/q7-daily-recompute.mjs deferred (uses Supabase client; library does not fit)',
    ].join('\n'),
    files: [{ path: 'fsi-app/scripts/cron/q7-daily-recompute.mjs', status: 'A', additions: 150, deletions: 0 }],
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'PASS');
});

// ---------------------------------------------------------------------------
// Check: coverage across multiple scripts
// ---------------------------------------------------------------------------

test('004 check: PASS with multiple scripts and matching lines for each', () => {
  const ctx = buildContextFromFixture({
    message: [
      'feat: two batches',
      '',
      'Batch-resilience: fsi-app/scripts/q5-batch.mjs consumes withRetry+createPgPool',
      'Batch-resilience: fsi-app/scripts/q6-batch.mjs consumes withRetry+withRateLimit',
    ].join('\n'),
    files: [
      { path: 'fsi-app/scripts/q5-batch.mjs', status: 'A', additions: 200, deletions: 0 },
      { path: 'fsi-app/scripts/q6-batch.mjs', status: 'A', additions: 150, deletions: 0 },
    ],
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'PASS');
});

test('004 check: FAIL when multiple scripts but only one covered', () => {
  const ctx = buildContextFromFixture({
    message: [
      'feat: two batches',
      '',
      'Batch-resilience: fsi-app/scripts/q5-batch.mjs consumes withRetry+createPgPool',
    ].join('\n'),
    files: [
      { path: 'fsi-app/scripts/q5-batch.mjs', status: 'A', additions: 200, deletions: 0 },
      { path: 'fsi-app/scripts/q6-batch.mjs', status: 'A', additions: 150, deletions: 0 },
    ],
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'FAIL');
  assert.ok(result.message.includes('q6-batch.mjs'));
});

test('004 check: trivial co-changed batch script does NOT need coverage', () => {
  // Touches a substantial batch + a trivial 1-line tweak to another batch (e.g. import path bump).
  // The trivial one should not trigger the per-file coverage requirement.
  const ctx = buildContextFromFixture({
    message: [
      'feat: main batch',
      '',
      'Batch-resilience: fsi-app/scripts/q5-batch.mjs consumes withRetry+createPgPool',
    ].join('\n'),
    files: [
      { path: 'fsi-app/scripts/q5-batch.mjs', status: 'A', additions: 200, deletions: 0 },
      { path: 'fsi-app/scripts/q4-batch.mjs', additions: 1, deletions: 1 },
    ],
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'PASS');
});

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

test('004: has required metadata fields', () => {
  assert.equal(rule.id, '004');
  assert.equal(typeof rule.name, 'string');
  assert.equal(typeof rule.description, 'string');
  assert.ok(rule.ruleSource.includes('sprint-followups-discipline'));
});
