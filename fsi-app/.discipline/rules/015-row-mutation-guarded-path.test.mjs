// Fire-tests for rule 015 (row-mutation guarded path).
// Run: node --test fsi-app/.discipline/rules/015-row-mutation-guarded-path.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rule } from './015-row-mutation-guarded-path.mjs';
import { buildContextFromFixture } from '../lib/context.mjs';

const RAW = 'const sb = createClient(u, k);\nawait sb.from("intelligence_items").update({ x: 1 }).eq("id", id);\n';
const GUARDED = 'import { guardedUpdate } from "./lib/db.mjs";\nawait guardedUpdate("intelligence_items", qb => qb.eq("id", id), { x: 1 }, { cite });\n';

test('015 trigger: fires on scripts/*.mjs, skips _diag + lib', () => {
  assert.equal(rule.trigger(buildContextFromFixture({
    message: 'x', files: [{ path: 'fsi-app/scripts/foo.mjs', additions: 5, deletions: 0 }],
  })), true);
  assert.equal(rule.trigger(buildContextFromFixture({
    message: 'x', files: [{ path: 'fsi-app/scripts/_diag/foo.mjs', additions: 5, deletions: 0 }],
  })), false);
});

test('015 check: FAIL — raw .update() outside the guarded path', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: write', files: [{ path: 'fsi-app/scripts/foo.mjs', additions: 5, deletions: 0 }],
    fileContents: { 'fsi-app/scripts/foo.mjs': RAW },
  });
  const r = rule.check(ctx);
  assert.equal(r.status, 'FAIL');
  assert.ok(r.remediation.includes('db.mjs'));
});

test('015 check: PASS — uses the guarded helper', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: write', files: [{ path: 'fsi-app/scripts/foo.mjs', additions: 5, deletions: 0 }],
    fileContents: { 'fsi-app/scripts/foo.mjs': GUARDED },
  });
  assert.equal(rule.check(ctx).status, 'PASS');
});

test('015 check: PASS — override trailer', () => {
  const ctx = buildContextFromFixture({
    message: 'fix: legacy\n\nWrite-Guard-Override: legacy edit, no new write',
    files: [{ path: 'fsi-app/scripts/foo.mjs', additions: 5, deletions: 0 }],
    fileContents: { 'fsi-app/scripts/foo.mjs': RAW },
  });
  assert.equal(rule.check(ctx).status, 'PASS');
});

test('015: metadata', () => { assert.equal(rule.id, '015'); });
