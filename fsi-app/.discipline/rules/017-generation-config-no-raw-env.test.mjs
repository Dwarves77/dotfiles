// Fire-tests for rule 017 (generation config — no raw env).
// Run: node --test fsi-app/.discipline/rules/017-generation-config-no-raw-env.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rule } from './017-generation-config-no-raw-env.mjs';
import { buildContextFromFixture } from '../lib/context.mjs';

// Built by fragments so this test file does not itself match the rule's regex.
const ENVREAD = 'const n = process' + '.env.' + 'BROWSERLESS_FETCH_CONCURRENCY;\n';        // a KNOB → violation
const CREDREAD = 'const k = process' + '.env.' + 'ANTHROPIC_API_KEY;\n';                   // a CREDENTIAL → exempt
const SUPAREAD = 'createClient(process' + '.env.' + 'NEXT_PUBLIC_SUPABASE_URL, process' + '.env.' + 'SUPABASE_SERVICE_ROLE_KEY);\n';

test('017 check: FAIL — raw KNOB env read in a generation file', () => {
  const ctx = buildContextFromFixture({
    message: 'tune', files: [{ path: 'fsi-app/src/lib/agent/canonical-pipeline.ts', additions: 5, deletions: 0 }],
    fileContents: { 'fsi-app/src/lib/agent/canonical-pipeline.ts': ENVREAD },
  });
  const r = rule.check(ctx);
  assert.equal(r.status, 'FAIL');
  assert.ok(r.remediation.includes('generation-config.ts'));
});

test('017 check: PASS — the config module itself may read env', () => {
  const ctx = buildContextFromFixture({
    message: 'tune', files: [{ path: 'fsi-app/src/lib/agent/generation-config.ts', additions: 5, deletions: 0 }],
    fileContents: { 'fsi-app/src/lib/agent/generation-config.ts': ENVREAD },
  });
  assert.equal(rule.check(ctx).status, 'PASS');
});

test('017 check: PASS — non-generation file may read env', () => {
  const ctx = buildContextFromFixture({
    message: 'feat', files: [{ path: 'fsi-app/src/lib/other.ts', additions: 5, deletions: 0 }],
    fileContents: { 'fsi-app/src/lib/other.ts': ENVREAD },
  });
  assert.equal(rule.check(ctx).status, 'PASS');
});

test('017 check: PASS — CREDENTIAL env reads in a generation file are exempt (not knobs)', () => {
  const ctx = buildContextFromFixture({
    message: 'feat', files: [{ path: 'fsi-app/src/lib/agent/canonical-pipeline.ts', additions: 5, deletions: 0 }],
    fileContents: { 'fsi-app/src/lib/agent/canonical-pipeline.ts': CREDREAD + SUPAREAD },
  });
  assert.equal(rule.check(ctx).status, 'PASS');
});

test('017 check: FAIL — a knob alongside credentials still trips (only the knob is flagged)', () => {
  const ctx = buildContextFromFixture({
    message: 'feat', files: [{ path: 'fsi-app/src/lib/agent/canonical-pipeline.ts', additions: 5, deletions: 0 }],
    fileContents: { 'fsi-app/src/lib/agent/canonical-pipeline.ts': CREDREAD + ENVREAD },
  });
  const r = rule.check(ctx);
  assert.equal(r.status, 'FAIL');
  assert.ok(r.message.includes('1'), 'only the single knob read should be flagged');
});

test('017: metadata', () => { assert.equal(rule.id, '017'); });
