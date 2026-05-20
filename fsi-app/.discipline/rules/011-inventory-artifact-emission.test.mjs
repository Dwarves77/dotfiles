// Tests for rule 011. Run: node --test fsi-app/.discipline/rules/011-inventory-artifact-emission.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rule } from './011-inventory-artifact-emission.mjs';
import { buildContextFromFixture } from '../lib/context.mjs';

// ---------------------------------------------------------------------------
// Trigger
// ---------------------------------------------------------------------------

test('011 trigger: skips when not on master', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: substantial',
    files: Array.from({ length: 10 }, (_, i) => ({ path: `src/f${i}.ts`, additions: 5, deletions: 5 })),
    branch: 'feat/foo',
  });
  assert.equal(rule.trigger(ctx), false);
});

test('011 trigger: skips trivial commit', () => {
  const ctx = buildContextFromFixture({
    message: 'fix: typo',
    files: [{ path: 'README.md', additions: 1, deletions: 1 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), false);
});

test('011 trigger: fires on substantial commit', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: ship',
    files: Array.from({ length: 10 }, (_, i) => ({ path: `src/f${i}.ts`, additions: 5, deletions: 5 })),
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

// ---------------------------------------------------------------------------
// Check: line presence
// ---------------------------------------------------------------------------

test('011 check: FAIL when no Inventory-emission line', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: substantial work\n\nbody without inventory line.',
    files: Array.from({ length: 10 }, (_, i) => ({ path: `src/f${i}.ts`, additions: 5, deletions: 5 })),
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'FAIL');
  assert.ok(result.message.includes('Inventory-emission'));
});

test('011 check: PASS when Inventory-emission line present and no specific surface touched', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: refactor 7 lib files\n\nInventory-emission: no inventory surfaces touched',
    files: Array.from({ length: 7 }, (_, i) => ({ path: `fsi-app/src/lib/f${i}.ts`, additions: 5, deletions: 5 })),
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'PASS');
});

// ---------------------------------------------------------------------------
// Check: surface coverage
// ---------------------------------------------------------------------------

test('011 check: PASS when migration touched and migrations.md line present', () => {
  const ctx = buildContextFromFixture({
    message: 'migration: add col\n\nbody.\n\nInventory-emission: docs/inventories/migrations.md +1 entry (099)',
    files: [{ path: 'fsi-app/supabase/migrations/099.sql', additions: 10, deletions: 0 }],
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'PASS');
});

test('011 check: FAIL when migration touched but migrations.md line missing', () => {
  const ctx = buildContextFromFixture({
    message: 'migration: add col\n\nbody.\n\nInventory-emission: docs/inventories/routes.md no changes',
    files: [{ path: 'fsi-app/supabase/migrations/099.sql', additions: 10, deletions: 0 }],
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'FAIL');
  assert.ok(result.message.includes('migrations'));
});

test('011 check: PASS with multiple surfaces and matching lines', () => {
  const ctx = buildContextFromFixture({
    message: [
      'feat: route + migration',
      '',
      'body.',
      '',
      'Inventory-emission: docs/inventories/routes.md +1 entry',
      'Inventory-emission: docs/inventories/migrations.md +1 entry (099)',
    ].join('\n'),
    files: [
      { path: 'fsi-app/src/app/api/admin/foo/route.ts', additions: 30, deletions: 0 },
      { path: 'fsi-app/supabase/migrations/099.sql', additions: 10, deletions: 0 },
    ],
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'PASS');
});

test('011 check: FAIL when multiple surfaces touched but only one covered', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: route + migration\n\nInventory-emission: docs/inventories/routes.md +1 entry',
    files: [
      { path: 'fsi-app/src/app/api/admin/foo/route.ts', additions: 30, deletions: 0 },
      { path: 'fsi-app/supabase/migrations/099.sql', additions: 10, deletions: 0 },
    ],
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'FAIL');
  assert.ok(result.message.includes('migrations'));
});

test('011 check: PASS for skills surface touch', () => {
  const ctx = buildContextFromFixture({
    message: 'skill: update\n\nInventory-emission: docs/inventories/skills.md +1 entry (new-skill)',
    files: [{ path: 'fsi-app/.claude/skills/new-skill/SKILL.md', additions: 100, deletions: 0 }],
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'PASS');
});

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

test('011: has required metadata fields', () => {
  assert.equal(rule.id, '011');
  assert.equal(typeof rule.name, 'string');
  assert.equal(typeof rule.description, 'string');
  assert.ok(rule.ruleSource.includes('sprint-followups-discipline'));
});
