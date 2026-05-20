// Tests for rule 003. Run: node --test fsi-app/.discipline/rules/003-remediation-discipline-load-trigger.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rule } from './003-remediation-discipline-load-trigger.mjs';
import { buildContextFromFixture } from '../lib/context.mjs';

// ---------------------------------------------------------------------------
// Trigger: subject-prefix based
// ---------------------------------------------------------------------------

test('003 trigger: skips ordinary feat commit', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: add new component',
    files: [{ path: 'fsi-app/src/components/foo.tsx', additions: 30, deletions: 0 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), false);
});

test('003 trigger: skips merge commit', () => {
  const ctx = buildContextFromFixture({
    message: 'Merge branch hotfix/x',
    files: [{ path: 'fsi-app/src/foo.ts', additions: 5, deletions: 5 }],
    branch: 'master',
    isMergeCommit: true,
  });
  assert.equal(rule.trigger(ctx), false);
});

test('003 trigger: fires on hotfix: subject', () => {
  const ctx = buildContextFromFixture({
    message: 'hotfix: regulations index null jurisdiction',
    files: [{ path: 'fsi-app/src/app/regulations/page.tsx', additions: 3, deletions: 1 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

test('003 trigger: fires on fix: subject', () => {
  const ctx = buildContextFromFixture({
    message: 'fix: pg disconnect on batch',
    files: [{ path: 'fsi-app/scripts/batch.mjs', additions: 10, deletions: 5 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

test('003 trigger: fires on post-mortem: subject', () => {
  const ctx = buildContextFromFixture({
    message: 'post-mortem: Q4 batch failure analysis',
    files: [{ path: 'docs/post-mortems/q4-batch.md', additions: 100, deletions: 0 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

test('003 trigger: fires on remediation: subject', () => {
  const ctx = buildContextFromFixture({
    message: 'remediation: extract batch primitives library',
    files: [{ path: 'fsi-app/scripts/lib/batch-primitives.mjs', status: 'A', additions: 250, deletions: 0 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

test('003 trigger: fires on patch: subject', () => {
  const ctx = buildContextFromFixture({
    message: 'patch: tolerate missing field',
    files: [{ path: 'fsi-app/src/lib/parse.ts', additions: 4, deletions: 1 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

// ---------------------------------------------------------------------------
// Trigger: file-pattern based
// ---------------------------------------------------------------------------

test('003 trigger: fires when adding new file under scripts/lib/ (primitive extraction)', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: shared retry helper',
    files: [{ path: 'fsi-app/scripts/lib/retry.mjs', status: 'A', additions: 80, deletions: 0 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

test('003 trigger: does NOT fire when modifying existing scripts/lib/ file (M, not A)', () => {
  const ctx = buildContextFromFixture({
    message: 'chore: tune retry parameters',
    files: [{ path: 'fsi-app/scripts/lib/retry.mjs', status: 'M', additions: 5, deletions: 5 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), false);
});

test('003 trigger: fires when touching SKILL.md (adding a binding rule)', () => {
  const ctx = buildContextFromFixture({
    message: 'skill: add new binding rule to discipline',
    files: [{ path: 'fsi-app/.claude/skills/sprint-followups-discipline/SKILL.md', additions: 50, deletions: 0 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

// ---------------------------------------------------------------------------
// Trigger: message-content based
// ---------------------------------------------------------------------------

test('003 trigger: fires when body declares Class-fix: line', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: shared withRetry consumer\n\nClass-fix: replaces inline retry logic in 3 batches',
    files: [{ path: 'fsi-app/scripts/q4.mjs', additions: 15, deletions: 20 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

test('003 trigger: fires when message mentions "recurring failure"', () => {
  const ctx = buildContextFromFixture({
    message: 'chore: address recurring failure pattern in cron jobs',
    files: [{ path: 'fsi-app/scripts/cron/foo.mjs', additions: 20, deletions: 10 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

// ---------------------------------------------------------------------------
// Check
// ---------------------------------------------------------------------------

test('003 check: PASS when both attestation and class-vs-instance lines present', () => {
  const ctx = buildContextFromFixture({
    message: [
      'hotfix: pg disconnect',
      '',
      'body paragraph.',
      '',
      'Skill-loaded: remediation-discipline',
      'Class-vs-instance: instance - single-batch crash, no recurrence signals fire',
    ].join('\n'),
    files: [{ path: 'fsi-app/scripts/batch.mjs', additions: 5, deletions: 5 }],
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'PASS');
});

test('003 check: FAIL when both lines missing', () => {
  const ctx = buildContextFromFixture({
    message: 'hotfix: pg disconnect\n\nbody.',
    files: [{ path: 'fsi-app/scripts/batch.mjs', additions: 5, deletions: 5 }],
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'FAIL');
  assert.ok(result.message.includes('Skill-loaded'));
  assert.ok(result.message.includes('Class-vs-instance'));
});

test('003 check: FAIL when Class-vs-instance line missing', () => {
  const ctx = buildContextFromFixture({
    message: 'hotfix: pg disconnect\n\nbody.\n\nSkill-loaded: remediation-discipline',
    files: [{ path: 'fsi-app/scripts/batch.mjs', additions: 5, deletions: 5 }],
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'FAIL');
  assert.ok(result.message.includes('Class-vs-instance'));
  assert.ok(!result.message.includes('Skill-loaded'));
});

test('003 check: FAIL when Skill-loaded line missing', () => {
  const ctx = buildContextFromFixture({
    message: 'hotfix: pg disconnect\n\nbody.\n\nClass-vs-instance: instance - one-off data fix',
    files: [{ path: 'fsi-app/scripts/batch.mjs', additions: 5, deletions: 5 }],
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'FAIL');
  assert.ok(result.message.includes('Skill-loaded'));
});

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

test('003: has required metadata fields', () => {
  assert.equal(rule.id, '003');
  assert.equal(typeof rule.name, 'string');
  assert.equal(typeof rule.description, 'string');
  assert.ok(rule.ruleSource.includes('sprint-followups-discipline'));
});
