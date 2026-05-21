import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rule } from './013-adr-cross-reference.mjs';
import { buildContextFromFixture } from '../lib/context.mjs';

// ---------------------------------------------------------------------------
// Trigger
// ---------------------------------------------------------------------------

test('013 trigger: skips when not on master', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: stuff',
    files: [{ path: 'fsi-app/src/lib/trust.ts', additions: 5, deletions: 5 }],
    branch: 'feat/foo',
  });
  assert.equal(rule.trigger(ctx), false);
});

test('013 trigger: skips merge commits', () => {
  const ctx = buildContextFromFixture({
    message: 'Merge branch foo',
    files: [{ path: 'fsi-app/src/lib/trust.ts', additions: 5, deletions: 0 }],
    branch: 'master',
    isMergeCommit: true,
  });
  assert.equal(rule.trigger(ctx), false);
});

test('013 trigger: fires when staged files match an accepted ADR scope', () => {
  // ADR-002 has scope including fsi-app/src/lib/trust.ts
  const ctx = buildContextFromFixture({
    message: 'feat: tweak trust scoring',
    files: [{ path: 'fsi-app/src/lib/trust.ts', additions: 5, deletions: 0 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

test('013 trigger: skips when no staged files match any ADR scope', () => {
  const ctx = buildContextFromFixture({
    message: 'docs: tweak README',
    files: [{ path: 'README.md', additions: 1, deletions: 1 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), false);
});

// ---------------------------------------------------------------------------
// Check
// ---------------------------------------------------------------------------

test('013 check: PASS when commit references all intersecting ADRs', () => {
  // trust.ts intersects ADR-002 (tier model)
  const ctx = buildContextFromFixture({
    message: 'feat: tweak trust\n\nADR-Reference: ADR-002',
    files: [{ path: 'fsi-app/src/lib/trust.ts', additions: 5, deletions: 0 }],
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'PASS');
});

test('013 check: FAIL when commit missing reference to intersecting ADR', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: tweak trust without referencing ADR',
    files: [{ path: 'fsi-app/src/lib/trust.ts', additions: 5, deletions: 0 }],
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'FAIL');
  assert.match(result.message, /ADR-002/);
});

test('013 check: PASS when commit uses ADR-Override with rationale', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: contradict tier model intentionally\n\nADR-Override: ADR-002 (rationale: experimental rollback for one specific use case; tracked in OBS-XX)',
    files: [{ path: 'fsi-app/src/lib/trust.ts', additions: 5, deletions: 0 }],
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'PASS');
});

test('013 check: FAIL when ADR-Override missing rationale', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: tweak\n\nADR-Override: ADR-002 (rationale: )',
    files: [{ path: 'fsi-app/src/lib/trust.ts', additions: 5, deletions: 0 }],
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'FAIL');
});

test('013 check: PASS when multiple ADRs intersect and all are referenced', () => {
  // trust.ts intersects ADR-002 (tier model).
  // canonical-sources/decide/route.ts intersects ADR-001 (canonical-sources scope),
  // ADR-003 (server-centric dual-write specific scope), AND ADR-004 (admin/ auth scope).
  // All four must be referenced.
  const ctx = buildContextFromFixture({
    message: [
      'feat: cross-cutting tweak',
      '',
      'ADR-Reference: ADR-001',
      'ADR-Reference: ADR-002',
      'ADR-Reference: ADR-003',
      'ADR-Reference: ADR-004',
    ].join('\n'),
    files: [
      { path: 'fsi-app/src/lib/trust.ts', additions: 5, deletions: 0 },
      { path: 'fsi-app/src/app/api/admin/canonical-sources/decide/route.ts', additions: 5, deletions: 0 },
    ],
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'PASS');
});

test('013 check: FAIL when only some intersecting ADRs are referenced', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: cross-cutting tweak\n\nADR-Reference: ADR-002',
    files: [
      { path: 'fsi-app/src/lib/trust.ts', additions: 5, deletions: 0 },
      { path: 'fsi-app/src/app/api/admin/canonical-sources/decide/route.ts', additions: 5, deletions: 0 },
    ],
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'FAIL');
  // Missing ADR-001 and ADR-003 (both scope-matched by the decide route)
  assert.match(result.message, /ADR-003|ADR-001/);
});

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

test('013: has required metadata fields', () => {
  assert.equal(rule.id, '013');
  assert.ok(rule.name.length > 0);
  assert.ok(rule.description.length > 0);
  assert.ok(rule.ruleSource.includes('ADR-009'));
});
