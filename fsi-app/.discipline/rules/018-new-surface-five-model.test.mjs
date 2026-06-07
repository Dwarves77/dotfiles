// Fire-tests for rule 018 (no surface outside the five-surface model).
// Run: node --test fsi-app/.discipline/rules/018-new-surface-five-model.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rule } from './018-new-surface-five-model.mjs';
import { buildContextFromFixture } from '../lib/context.mjs';

test('018 check: FAIL — a sixth customer surface (the Technology-page catch)', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: technology page',
    files: [{ path: 'fsi-app/src/app/technology/page.tsx', additions: 20, deletions: 0 }],
    fileContents: { 'fsi-app/src/app/technology/page.tsx': 'export default function Page(){return null;}\n' },
  });
  const r = rule.check(ctx);
  assert.equal(r.status, 'FAIL');
  assert.ok(r.message.includes('/technology'));
});

test('018 check: PASS — one of the five surfaces', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: market', files: [{ path: 'fsi-app/src/app/market/page.tsx', additions: 20, deletions: 0 }],
    fileContents: { 'fsi-app/src/app/market/page.tsx': 'export default function Page(){return null;}\n' },
  });
  assert.equal(rule.check(ctx).status, 'PASS');
});

test('018 check: PASS — override trailer (operator-authorized surface)', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: technology\n\nSurface-Decision-Override: Jason authorized 6th surface 2026-06-06',
    files: [{ path: 'fsi-app/src/app/technology/page.tsx', additions: 20, deletions: 0 }],
    fileContents: { 'fsi-app/src/app/technology/page.tsx': 'export default function Page(){return null;}\n' },
  });
  assert.equal(rule.check(ctx).status, 'PASS');
});

test('018: metadata', () => { assert.equal(rule.id, '018'); });
