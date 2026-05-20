// Tests for rule 007. Run: node --test fsi-app/.discipline/rules/007-sources-schema-touch.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rule, _touchesSourcesSchema } from './007-sources-schema-touch.mjs';
import { buildContextFromFixture } from '../lib/context.mjs';

// ---------------------------------------------------------------------------
// Trigger: skips
// ---------------------------------------------------------------------------

test('007 trigger: skips when not on master', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: source_role consumer update',
    files: [{ path: 'fsi-app/src/lib/sources/foo.ts', additions: 20, deletions: 0 }],
    branch: 'feat/sources',
  });
  assert.equal(rule.trigger(ctx), false);
});

test('007 trigger: skips audit subject on master', () => {
  const ctx = buildContextFromFixture({
    message: 'audit: sources table review',
    files: [{ path: 'fsi-app/src/lib/sources/foo.ts', additions: 20, deletions: 0 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), false);
});

test('007 trigger: skips commit with no sources-related touch', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: regulations index page',
    files: [
      { path: 'fsi-app/src/app/regulations/page.tsx', additions: 30, deletions: 10 },
      { path: 'fsi-app/src/components/RegulationCard.tsx', additions: 20, deletions: 0 },
    ],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), false);
});

test('007 trigger: skips unrelated migration on master', () => {
  const ctx = buildContextFromFixture({
    message: 'migration: add jurisdictions column',
    files: [{ path: 'fsi-app/supabase/migrations/099-jurisdictions.sql', additions: 20, deletions: 0 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), false);
});

// ---------------------------------------------------------------------------
// Trigger: fires
// ---------------------------------------------------------------------------

test('007 trigger: fires on migration filename mentioning sources', () => {
  const ctx = buildContextFromFixture({
    message: 'migration: add source_role default',
    files: [{ path: 'fsi-app/supabase/migrations/099-sources-role-default.sql', additions: 12, deletions: 0 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

test('007 trigger: fires on files in src/lib/sources/', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: extract canonical resolver',
    files: [{ path: 'fsi-app/src/lib/sources/resolver.ts', additions: 60, deletions: 0 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

test('007 trigger: fires on canonical-sources API route', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: review queue endpoint',
    files: [{ path: 'fsi-app/src/app/api/admin/canonical-sources/review/route.ts', additions: 80, deletions: 0 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

test('007 trigger: fires when message names a known sources column', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: trust scoring uses classification_confidence',
    files: [{ path: 'fsi-app/src/lib/trust.ts', additions: 30, deletions: 5 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

test('007 trigger: fires when message names source_citations edge', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: render source_citations counts',
    files: [{ path: 'fsi-app/src/components/CitationCount.tsx', additions: 40, deletions: 0 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

test('007 trigger: fires when message names sources table explicitly', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: filter sources table by tier',
    files: [{ path: 'fsi-app/src/app/api/admin/foo/route.ts', additions: 25, deletions: 0 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

test('007 trigger: skips when only "open source" appears in message (not the table)', () => {
  const ctx = buildContextFromFixture({
    message: 'docs: link to open source compliance',
    files: [{ path: 'docs/compliance.md', additions: 5, deletions: 0 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), false);
});

// ---------------------------------------------------------------------------
// Helper coverage
// ---------------------------------------------------------------------------

test('007 helper: _touchesSourcesSchema true for src/lib/sources/', () => {
  const ctx = buildContextFromFixture({
    message: 'noop',
    files: [{ path: 'fsi-app/src/lib/sources/foo.ts', additions: 1, deletions: 0 }],
    branch: 'master',
  });
  assert.equal(_touchesSourcesSchema(ctx), true);
});

test('007 helper: _touchesSourcesSchema false for unrelated touch', () => {
  const ctx = buildContextFromFixture({
    message: 'docs: clarify glossary',
    files: [{ path: 'docs/glossary.md', additions: 5, deletions: 0 }],
    branch: 'master',
  });
  assert.equal(_touchesSourcesSchema(ctx), false);
});

// ---------------------------------------------------------------------------
// Check: PASS / FAIL
// ---------------------------------------------------------------------------

test('007 check: FAIL when no Schema-touch-precondition line', () => {
  const ctx = buildContextFromFixture({
    message: [
      'feat: new source_role consumer for trust scoring',
      '',
      'Body paragraph describing the change.',
      '',
      'Loop-closure: OBS-4 NO ACTION; DP-1 N/A',
    ].join('\n'),
    files: [
      { path: 'fsi-app/src/lib/trust.ts', additions: 25, deletions: 0 },
      { path: 'fsi-app/src/lib/sources/resolver.ts', additions: 10, deletions: 0 },
    ],
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'FAIL');
  assert.ok(result.message.includes('Schema-touch-precondition'));
  assert.ok(result.remediation.length > 0);
});

test('007 check: PASS when Schema-touch-precondition line present with full attestation', () => {
  const ctx = buildContextFromFixture({
    message: [
      'feat: new source_role consumer for trust scoring',
      '',
      'Body.',
      '',
      'Schema-touch-precondition: source_role; origin-migration 063; consumers audited (12 PASS, 0 SUSPECT)',
    ].join('\n'),
    files: [{ path: 'fsi-app/src/lib/sources/resolver.ts', additions: 15, deletions: 0 }],
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'PASS');
});

test('007 check: PASS with no-new-consumer attestation (refactor exemption)', () => {
  const ctx = buildContextFromFixture({
    message: [
      'refactor: tidy src/lib/sources/resolver internals',
      '',
      'Schema-touch-precondition: no new consumer (internal refactor of src/lib/sources/resolver.ts)',
    ].join('\n'),
    files: [{ path: 'fsi-app/src/lib/sources/resolver.ts', additions: 30, deletions: 30 }],
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'PASS');
});

test('007 check: PASS with not-applicable attestation (false-positive override)', () => {
  const ctx = buildContextFromFixture({
    message: [
      'feat: api route in canonical-sources namespace; not a sources-schema touch',
      '',
      'Schema-touch-precondition: not-applicable (route is unrelated metadata; no sources columns touched)',
    ].join('\n'),
    files: [{ path: 'fsi-app/src/app/api/admin/canonical-sources/health/route.ts', additions: 20, deletions: 0 }],
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'PASS');
});

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

test('007: has required metadata fields', () => {
  assert.equal(rule.id, '007');
  assert.equal(typeof rule.name, 'string');
  assert.equal(typeof rule.description, 'string');
  assert.ok(rule.ruleSource.includes('sprint-followups-discipline'));
});
