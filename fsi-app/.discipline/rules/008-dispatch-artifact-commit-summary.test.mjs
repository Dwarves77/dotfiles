// Tests for rule 008. Run: node --test fsi-app/.discipline/rules/008-dispatch-artifact-commit-summary.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rule } from './008-dispatch-artifact-commit-summary.mjs';
import { buildContextFromFixture } from '../lib/context.mjs';

// ---------------------------------------------------------------------------
// Trigger
// ---------------------------------------------------------------------------

test('008 trigger: skips when not on master', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: substantial work\n\nbody',
    files: Array.from({ length: 10 }, (_, i) => ({ path: `src/f${i}.ts`, additions: 5, deletions: 5 })),
    branch: 'feat/foo',
  });
  assert.equal(rule.trigger(ctx), false);
});

test('008 trigger: skips small commit on master', () => {
  const ctx = buildContextFromFixture({
    message: 'fix: typo',
    files: [{ path: 'README.md', additions: 1, deletions: 1 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), false);
});

test('008 trigger: skips audit subject on master', () => {
  const ctx = buildContextFromFixture({
    message: 'audit: routing review',
    files: Array.from({ length: 10 }, (_, i) => ({ path: `docs/a${i}.md`, additions: 100, deletions: 0 })),
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), false);
});

test('008 trigger: skips merge commit on master', () => {
  const ctx = buildContextFromFixture({
    message: 'Merge branch feat/foo',
    files: Array.from({ length: 10 }, (_, i) => ({ path: `src/f${i}.ts`, additions: 5, deletions: 5 })),
    branch: 'master',
    isMergeCommit: true,
  });
  assert.equal(rule.trigger(ctx), false);
});

test('008 trigger: fires on substantial feat on master', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: ship the thing\n\nbody',
    files: Array.from({ length: 10 }, (_, i) => ({ path: `src/f${i}.ts`, additions: 5, deletions: 5 })),
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

test('008 trigger: fires on migration commit on master', () => {
  const ctx = buildContextFromFixture({
    message: 'migration: add column',
    files: [{ path: 'fsi-app/supabase/migrations/099.sql', additions: 10, deletions: 0 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

// ---------------------------------------------------------------------------
// Check
// ---------------------------------------------------------------------------

test('008 check: PASS when Loop-closure line present', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: substantial\n\nbody paragraph.\n\nLoop-closure: OBS-13 COVER; OBS-14 COVER; DP-1 PASS',
    files: Array.from({ length: 10 }, (_, i) => ({ path: `src/f${i}.ts`, additions: 5, deletions: 5 })),
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'PASS');
});

test('008 check: FAIL when Loop-closure line absent', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: substantial\n\nbody paragraph with no closure line.',
    files: Array.from({ length: 10 }, (_, i) => ({ path: `src/f${i}.ts`, additions: 5, deletions: 5 })),
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'FAIL');
  assert.ok(result.message.includes('Loop-closure'));
  assert.ok(result.remediation.length > 0);
});

test('008 check: FAIL when "Loop-closure:" appears only inline (not at line start)', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: substantial\n\nbody mentions Loop-closure: stuff in the middle',
    files: Array.from({ length: 10 }, (_, i) => ({ path: `src/f${i}.ts`, additions: 5, deletions: 5 })),
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'FAIL');
});

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

test('008: has required metadata fields', () => {
  assert.equal(rule.id, '008');
  assert.equal(typeof rule.name, 'string');
  assert.equal(typeof rule.description, 'string');
  assert.ok(rule.ruleSource.includes('sprint-followups-discipline'));
});
