// Fire-tests for rule 016 (canonical Anthropic path).
// Run: node --test fsi-app/.discipline/rules/016-canonical-anthropic-path.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rule } from './016-canonical-anthropic-path.mjs';
import { buildContextFromFixture } from '../lib/context.mjs';

// Built by fragments so this test file does not itself match the rule's regex.
const DIRECT = 'const c = new ' + 'Anthropic' + '({ apiKey });\n';

test('016 check: FAIL — direct Anthropic call in a non-permitted file', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: gen', files: [{ path: 'fsi-app/scripts/oneoff-generate.mjs', additions: 5, deletions: 0 }],
    fileContents: { 'fsi-app/scripts/oneoff-generate.mjs': DIRECT },
  });
  const r = rule.check(ctx);
  assert.equal(r.status, 'FAIL');
  assert.ok(r.remediation.includes('canonical'));
});

test('016 check: PASS — direct call inside a permitted route', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: route', files: [{ path: 'fsi-app/src/app/api/agent/run/route.ts', additions: 5, deletions: 0 }],
    fileContents: { 'fsi-app/src/app/api/agent/run/route.ts': DIRECT },
  });
  assert.equal(rule.check(ctx).status, 'PASS');
});

test('016 check: PASS — clean file', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: clean', files: [{ path: 'fsi-app/scripts/foo.mjs', additions: 5, deletions: 0 }],
    fileContents: { 'fsi-app/scripts/foo.mjs': 'export const x = 1;\n' },
  });
  assert.equal(rule.check(ctx).status, 'PASS');
});

test('016: metadata', () => { assert.equal(rule.id, '016'); });
