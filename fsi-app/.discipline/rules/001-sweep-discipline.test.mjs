// Tests for rule 001. Run: node --test fsi-app/.discipline/rules/001-sweep-discipline.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rule } from './001-sweep-discipline.mjs';
import { buildContextFromFixture } from '../lib/context.mjs';

// ---------------------------------------------------------------------------
// Trigger
// ---------------------------------------------------------------------------

test('001 trigger: skips when not on master', () => {
  const ctx = buildContextFromFixture({
    message: 'audit: route surface\n\nbody',
    files: [{ path: 'docs/audit.md', additions: 50, deletions: 0 }],
    branch: 'feat/foo',
  });
  assert.equal(rule.trigger(ctx), false);
});

test('001 trigger: skips ordinary feat commit on master', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: add a route',
    files: [{ path: 'fsi-app/src/app/api/foo/route.ts', additions: 30, deletions: 0 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), false);
});

test('001 trigger: skips merge commit', () => {
  const ctx = buildContextFromFixture({
    message: 'audit: stuff',
    files: [{ path: 'docs/audit.md', additions: 50, deletions: 0 }],
    branch: 'master',
    isMergeCommit: true,
  });
  assert.equal(rule.trigger(ctx), false);
});

test('001 trigger: fires on audit: subject on master', () => {
  const ctx = buildContextFromFixture({
    message: 'audit: admin gating sweep\n\nbody',
    files: [{ path: 'docs/admin-gating-audit.md', additions: 100, deletions: 0 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

test('001 trigger: fires on sweep: subject on master', () => {
  const ctx = buildContextFromFixture({
    message: 'sweep: env var leaks',
    files: [{ path: 'docs/env-sweep.md', additions: 30, deletions: 0 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

test('001 trigger: fires on investigation: subject on master', () => {
  const ctx = buildContextFromFixture({
    message: 'investigation: pooler limits',
    files: [{ path: 'docs/pooler-investigation.md', additions: 60, deletions: 0 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

test('001 trigger: fires on self-attested Dispatch-type: sweep even with other subject', () => {
  const ctx = buildContextFromFixture({
    message: 'chore: route audit results\n\nDispatch-type: sweep',
    files: [{ path: 'docs/audit.md', additions: 20, deletions: 0 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

// ---------------------------------------------------------------------------
// Check
// ---------------------------------------------------------------------------

test('001 check: PASS when Sweep-enumeration line present with method and count', () => {
  const ctx = buildContextFromFixture({
    message: 'audit: admin gating\n\nbody.\n\nSweep-enumeration: src/app/api/admin/**/*.ts via Glob 28 items',
    files: [{ path: 'docs/audit.md', additions: 100, deletions: 0 }],
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'PASS');
});

test('001 check: PASS with multiple Sweep-enumeration lines', () => {
  const ctx = buildContextFromFixture({
    message: [
      'audit: multi-surface',
      '',
      'body.',
      '',
      'Sweep-enumeration: src/app/api/admin/**/*.ts via Glob 28 items',
      'Sweep-enumeration: sources columns via schema query 47 items',
    ].join('\n'),
    files: [{ path: 'docs/audit.md', additions: 100, deletions: 0 }],
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'PASS');
});

test('001 check: FAIL when no Sweep-enumeration line', () => {
  const ctx = buildContextFromFixture({
    message: 'audit: admin gating\n\nbody describes findings but no enumeration line.',
    files: [{ path: 'docs/audit.md', additions: 100, deletions: 0 }],
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'FAIL');
  assert.ok(result.message.includes('Sweep-enumeration'));
  assert.ok(result.remediation.length > 0);
});

test('001 check: FAIL when Sweep-enumeration line lacks count', () => {
  const ctx = buildContextFromFixture({
    message: 'audit: admin gating\n\nSweep-enumeration: src/app/api/admin via Glob (count omitted)',
    files: [{ path: 'docs/audit.md', additions: 100, deletions: 0 }],
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'FAIL');
  assert.ok(result.message.includes('method') || result.message.includes('count'));
});

test('001 check: FAIL when Sweep-enumeration line lacks method', () => {
  const ctx = buildContextFromFixture({
    message: 'audit: admin gating\n\nSweep-enumeration: route family contains 28 items',
    files: [{ path: 'docs/audit.md', additions: 100, deletions: 0 }],
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'FAIL');
});

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

test('001: has required metadata fields', () => {
  assert.equal(rule.id, '001');
  assert.equal(typeof rule.name, 'string');
  assert.equal(typeof rule.description, 'string');
  assert.ok(rule.ruleSource.includes('sprint-followups-discipline'));
});
