// Tests for rule 005. Run: node --test fsi-app/.discipline/rules/005-inference-correction.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rule } from './005-inference-correction.mjs';
import { buildContextFromFixture } from '../lib/context.mjs';

// ---------------------------------------------------------------------------
// Trigger
// ---------------------------------------------------------------------------

test('005 trigger: skips when not on master', () => {
  const ctx = buildContextFromFixture({
    message: 'reconstruction: original 070 file\n\nbody',
    files: [{ path: 'fsi-app/supabase/migrations/070.sql', additions: 308, deletions: 0 }],
    branch: 'feat/foo',
  });
  assert.equal(rule.trigger(ctx), false);
});

test('005 trigger: skips ordinary feat commit on master', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: add column to sources',
    files: [{ path: 'fsi-app/supabase/migrations/099.sql', additions: 10, deletions: 0 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), false);
});

test('005 trigger: skips merge commits', () => {
  const ctx = buildContextFromFixture({
    message: 'reconstruction: original 070',
    files: [{ path: 'fsi-app/supabase/migrations/070.sql', additions: 308, deletions: 0 }],
    branch: 'master',
    isMergeCommit: true,
  });
  assert.equal(rule.trigger(ctx), false);
});

test('005 trigger: fires on reconstruction: subject on master', () => {
  const ctx = buildContextFromFixture({
    message: 'reconstruction: recover original 070\n\nbody',
    files: [{ path: 'fsi-app/supabase/migrations/070.sql', additions: 308, deletions: 0 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

test('005 trigger: fires on synthesis: subject on master', () => {
  const ctx = buildContextFromFixture({
    message: 'synthesis: schema reconciliation findings',
    files: [{ path: 'docs/sprint-1/synthesis-2026-05-20.md', additions: 200, deletions: 0 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

test('005 trigger: fires on implementation: subject on master', () => {
  const ctx = buildContextFromFixture({
    message: 'implementation: apply schema discovery findings',
    files: [{ path: 'fsi-app/supabase/migrations/100.sql', additions: 50, deletions: 0 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

test('005 trigger: fires when a discovery/synthesis doc is touched', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: ship findings doc',
    files: [{ path: 'docs/sprint-1/schema-reconciliation-discovery-2026-05-18.md', additions: 500, deletions: 0 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

test('005 trigger: fires on self-attested Dispatch-type: synthesis', () => {
  const ctx = buildContextFromFixture({
    message: 'chore: roll up\n\nDispatch-type: synthesis',
    files: [{ path: 'docs/random.md', additions: 20, deletions: 0 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

// ---------------------------------------------------------------------------
// Check
// ---------------------------------------------------------------------------

test('005 check: PASS with explicit no-contradictions attestation', () => {
  const ctx = buildContextFromFixture({
    message: 'reconstruction: original 070\n\nbody.\n\nInference-correction: no contradictions surfaced',
    files: [{ path: 'fsi-app/supabase/migrations/070.sql', additions: 308, deletions: 0 }],
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'PASS');
});

test('005 check: PASS with a correction line citing prior dispatch + evidence', () => {
  const ctx = buildContextFromFixture({
    message: [
      'reconstruction: original 070',
      '',
      'Recovered from git blob d51bccf at 651ae78.',
      '',
      'Inference-correction: schema-reconciliation-discovery-2026-05-18 § Finding 5 → 070 created 3 RPCs not 5, evidence: git history (blob d51bccf at 651ae78, 308 lines)',
    ].join('\n'),
    files: [{ path: 'fsi-app/supabase/migrations/070.sql', additions: 308, deletions: 0 }],
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'PASS');
});

test('005 check: PASS with arrow form using ->', () => {
  const ctx = buildContextFromFixture({
    message: 'synthesis: reconcile\n\nInference-correction: prior doc § claim -> corrected fact, evidence: live DB',
    files: [{ path: 'docs/sprint-1/synthesis.md', additions: 100, deletions: 0 }],
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'PASS');
});

test('005 check: FAIL when no Inference-correction line', () => {
  const ctx = buildContextFromFixture({
    message: 'reconstruction: original 070\n\nbody describes work but no inference-correction line.',
    files: [{ path: 'fsi-app/supabase/migrations/070.sql', additions: 308, deletions: 0 }],
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'FAIL');
  assert.ok(result.message.includes('Inference-correction'));
});

test('005 check: FAIL when Inference-correction line is too thin', () => {
  const ctx = buildContextFromFixture({
    message: 'reconstruction: original 070\n\nInference-correction: see report',
    files: [{ path: 'fsi-app/supabase/migrations/070.sql', additions: 308, deletions: 0 }],
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'FAIL');
  assert.ok(result.message.includes('thin') || result.message.includes('state'));
});

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

test('005: has required metadata fields', () => {
  assert.equal(rule.id, '005');
  assert.equal(typeof rule.name, 'string');
  assert.equal(typeof rule.description, 'string');
  assert.ok(rule.ruleSource.includes('sprint-followups-discipline'));
});
