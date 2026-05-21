import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rule } from './014-inventory-consistency.mjs';
import { buildContextFromFixture } from '../lib/context.mjs';

test('014 trigger: skips when not on master', () => {
  const ctx = buildContextFromFixture({
    message: 'docs: tweak inventory',
    files: [{ path: 'docs/inventories/skills.md', additions: 5, deletions: 5 }],
    branch: 'feat/foo',
  });
  assert.equal(rule.trigger(ctx), false);
});

test('014 trigger: skips when no inventory files touched', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: code',
    files: [{ path: 'fsi-app/src/lib/foo.ts', additions: 5, deletions: 5 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), false);
});

test('014 trigger: fires when an inventory file is touched on master', () => {
  const ctx = buildContextFromFixture({
    message: 'docs: tweak inventory',
    files: [{ path: 'docs/inventories/skills.md', additions: 5, deletions: 5 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

test('014 trigger: skips merge commits', () => {
  const ctx = buildContextFromFixture({
    message: 'Merge branch foo',
    files: [{ path: 'docs/inventories/skills.md', additions: 5, deletions: 5 }],
    branch: 'master',
    isMergeCommit: true,
  });
  assert.equal(rule.trigger(ctx), false);
});

test('014: has required metadata fields', () => {
  assert.equal(rule.id, '014');
  assert.ok(rule.name.length > 0);
  assert.ok(rule.ruleSource.includes('ADR-005'));
});
