// Tests for rule 002. Run: node --test fsi-app/.discipline/rules/002-source-credibility-load-trigger.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rule } from './002-source-credibility-load-trigger.mjs';
import { buildContextFromFixture } from '../lib/context.mjs';

// ---------------------------------------------------------------------------
// Trigger: file-pattern based
// ---------------------------------------------------------------------------

test('002 trigger: skips when no credibility surface touched', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: unrelated UI tweak',
    files: [{ path: 'fsi-app/src/components/community/feed.tsx', additions: 10, deletions: 2 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), false);
});

test('002 trigger: skips merge commit even when files match', () => {
  const ctx = buildContextFromFixture({
    message: 'Merge branch feat/sources',
    files: [{ path: 'fsi-app/src/lib/trust.ts', additions: 5, deletions: 1 }],
    branch: 'master',
    isMergeCommit: true,
  });
  assert.equal(rule.trigger(ctx), false);
});

test('002 trigger: fires on src/lib/trust.ts touch', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: tune trust scoring',
    files: [{ path: 'fsi-app/src/lib/trust.ts', additions: 20, deletions: 5 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

test('002 trigger: fires on verification pipeline touch', () => {
  const ctx = buildContextFromFixture({
    message: 'fix: verification edge case',
    files: [{ path: 'fsi-app/src/lib/sources/verification.ts', additions: 10, deletions: 3 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

test('002 trigger: fires on any src/lib/sources/ touch', () => {
  const ctx = buildContextFromFixture({
    message: 'refactor: extract source helper',
    files: [{ path: 'fsi-app/src/lib/sources/helper.ts', additions: 30, deletions: 5 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

test('002 trigger: fires on canonical-sources admin route', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: review queue surface',
    files: [{ path: 'fsi-app/src/app/api/admin/canonical-sources/list/route.ts', additions: 50, deletions: 0 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

test('002 trigger: fires on Haiku recommend-classification route', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: tune Haiku prompt',
    files: [{ path: 'fsi-app/src/app/api/admin/sources/recommend-classification/route.ts', additions: 15, deletions: 5 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

test('002 trigger: fires on agent run route (discovery loop citation extraction)', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: agent discovery loop tweak',
    files: [{ path: 'fsi-app/src/app/api/agent/run/route.ts', additions: 25, deletions: 10 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

test('002 trigger: fires on sources migration', () => {
  const ctx = buildContextFromFixture({
    message: 'migration: add column',
    files: [{ path: 'fsi-app/supabase/migrations/099_alter_sources_add_bias_tag.sql', additions: 15, deletions: 0 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

// ---------------------------------------------------------------------------
// Trigger: message-content based (edge-tables, columns)
// ---------------------------------------------------------------------------

test('002 trigger: fires when commit message names source_citations edge table', () => {
  const ctx = buildContextFromFixture({
    message: 'migration: index source_citations\n\nadd index on source_citations.source_id',
    files: [{ path: 'fsi-app/supabase/migrations/100_idx_citations.sql', additions: 5, deletions: 0 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

test('002 trigger: fires when commit message names effective_tier column', () => {
  const ctx = buildContextFromFixture({
    message: 'migration: add effective_tier\n\nintroduces effective_tier column',
    files: [{ path: 'fsi-app/supabase/migrations/101_effective_tier.sql', additions: 8, deletions: 0 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

test('002 trigger: fires when commit names canonical_source_candidates table', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: candidate promotion\n\nrefines canonical_source_candidates flow',
    files: [{ path: 'fsi-app/src/app/admin/candidates/page.tsx', additions: 40, deletions: 0 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

// ---------------------------------------------------------------------------
// Check
// ---------------------------------------------------------------------------

test('002 check: PASS when Skill-loaded attestation present', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: tune trust scoring\n\nbody.\n\nSkill-loaded: source-credibility-model',
    files: [{ path: 'fsi-app/src/lib/trust.ts', additions: 20, deletions: 5 }],
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'PASS');
});

test('002 check: FAIL when attestation absent', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: tune trust scoring\n\nbody without attestation.',
    files: [{ path: 'fsi-app/src/lib/trust.ts', additions: 20, deletions: 5 }],
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'FAIL');
  assert.ok(result.message.includes('source-credibility-model'));
  assert.ok(result.remediation.length > 0);
});

test('002 check: FAIL when attestation appears inline (not at line start)', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: tune trust\n\nbody mentions Skill-loaded: source-credibility-model in mid-sentence',
    files: [{ path: 'fsi-app/src/lib/trust.ts', additions: 20, deletions: 5 }],
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'FAIL');
});

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

test('002: has required metadata fields', () => {
  assert.equal(rule.id, '002');
  assert.equal(typeof rule.name, 'string');
  assert.equal(typeof rule.description, 'string');
  assert.ok(rule.ruleSource.includes('sprint-followups-discipline'));
});
