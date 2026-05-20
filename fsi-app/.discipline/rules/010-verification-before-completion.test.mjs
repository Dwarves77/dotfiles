// Tests for rule 010. Run: node --test fsi-app/.discipline/rules/010-verification-before-completion.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rule } from './010-verification-before-completion.mjs';
import { buildContextFromFixture } from '../lib/context.mjs';

// ---------------------------------------------------------------------------
// Trigger
// ---------------------------------------------------------------------------

test('010 trigger: skips when not on master', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: ship a thing\n\nbody',
    files: [
      { path: 'fsi-app/src/lib/foo.ts', additions: 20, deletions: 5 },
      { path: 'fsi-app/src/lib/bar.ts', additions: 12, deletions: 0 },
    ],
    branch: 'feat/foo',
  });
  assert.equal(rule.trigger(ctx), false);
});

test('010 trigger: skips trivial single-file <=5-addition commit', () => {
  const ctx = buildContextFromFixture({
    message: 'fix: typo',
    files: [{ path: 'README.md', additions: 1, deletions: 1 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), false);
});

test('010 trigger: skips audit subject on master', () => {
  const ctx = buildContextFromFixture({
    message: 'audit: route review',
    files: Array.from({ length: 5 }, (_, i) => ({ path: `docs/a${i}.md`, additions: 50, deletions: 0 })),
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), false);
});

test('010 trigger: skips hotfix subject on master', () => {
  const ctx = buildContextFromFixture({
    message: 'hotfix: null jurisdiction',
    files: [{ path: 'fsi-app/src/app/regulations/page.tsx', additions: 3, deletions: 1 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), false);
});

test('010 trigger: skips research subject on master', () => {
  const ctx = buildContextFromFixture({
    message: 'research: model evaluation notes',
    files: Array.from({ length: 3 }, (_, i) => ({ path: `docs/r${i}.md`, additions: 200, deletions: 0 })),
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), false);
});

test('010 trigger: skips merge commit on master', () => {
  const ctx = buildContextFromFixture({
    message: 'Merge branch feat/foo',
    files: Array.from({ length: 10 }, (_, i) => ({ path: `src/f${i}.ts`, additions: 5, deletions: 5 })),
    branch: 'master',
    isMergeCommit: true,
  });
  assert.equal(rule.trigger(ctx), false);
});

test('010 trigger: skips revert commit on master', () => {
  const ctx = buildContextFromFixture({
    message: 'Revert "feat: ship a thing"',
    files: Array.from({ length: 6 }, (_, i) => ({ path: `src/f${i}.ts`, additions: 0, deletions: 5 })),
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), false);
});

test('010 trigger: fires on small-but-nontrivial commit on master', () => {
  // Two files (>1) so the trivial gate does not apply
  const ctx = buildContextFromFixture({
    message: 'fix: regression in trust scoring',
    files: [
      { path: 'fsi-app/src/lib/trust.ts', additions: 3, deletions: 2 },
      { path: 'fsi-app/src/lib/trust.test.ts', additions: 8, deletions: 0 },
    ],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

test('010 trigger: fires on single-file commit with many additions', () => {
  // One file but >5 additions, so not trivial
  const ctx = buildContextFromFixture({
    message: 'feat: extract helper',
    files: [{ path: 'fsi-app/src/lib/helper.ts', additions: 40, deletions: 0 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

test('010 trigger: fires on substantial feat on master', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: ship the thing\n\nbody',
    files: Array.from({ length: 10 }, (_, i) => ({ path: `src/f${i}.ts`, additions: 5, deletions: 5 })),
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

// ---------------------------------------------------------------------------
// Check: presence
// ---------------------------------------------------------------------------

test('010 check: FAIL when no Verification line', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: ship\n\nbody paragraph without verification.',
    files: Array.from({ length: 10 }, (_, i) => ({ path: `src/f${i}.ts`, additions: 5, deletions: 5 })),
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'FAIL');
  assert.ok(result.message.includes('Verification'));
  assert.ok(result.remediation.length > 0);
});

// ---------------------------------------------------------------------------
// Check: substance
// ---------------------------------------------------------------------------

test('010 check: FAIL when Verification line is trivial ("done")', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: ship\n\nbody.\n\nVerification: done',
    files: Array.from({ length: 10 }, (_, i) => ({ path: `src/f${i}.ts`, additions: 5, deletions: 5 })),
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'FAIL');
  assert.ok(result.message.toLowerCase().includes('substance'));
});

test('010 check: FAIL when Verification line is trivial ("passed")', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: ship\n\nbody.\n\nVerification: passed',
    files: Array.from({ length: 10 }, (_, i) => ({ path: `src/f${i}.ts`, additions: 5, deletions: 5 })),
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'FAIL');
});

test('010 check: PASS when Verification line cites a command and observation', () => {
  const ctx = buildContextFromFixture({
    message: [
      'feat: ship trust scoring update',
      '',
      'body paragraph.',
      '',
      'Verification: ran `npx tsc --noEmit`; observed zero errors',
    ].join('\n'),
    files: Array.from({ length: 10 }, (_, i) => ({ path: `src/f${i}.ts`, additions: 5, deletions: 5 })),
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'PASS');
});

test('010 check: PASS when Verification line cites psql schema query', () => {
  const ctx = buildContextFromFixture({
    message: [
      'migration: add effective_tier column',
      '',
      'body.',
      '',
      "Verification: ran psql -c \"SELECT column_name FROM information_schema.columns WHERE table_name='sources'\"; observed effective_tier present",
    ].join('\n'),
    files: [{ path: 'fsi-app/supabase/migrations/099.sql', additions: 20, deletions: 0 }],
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'PASS');
});

test('010 check: PASS when Verification line cites node --test run', () => {
  const ctx = buildContextFromFixture({
    message: [
      'feat: add discipline rule',
      '',
      'Verification: ran node --test fsi-app/.discipline; observed all suites pass',
    ].join('\n'),
    files: Array.from({ length: 6 }, (_, i) => ({ path: `fsi-app/.discipline/rules/r${i}.mjs`, additions: 30, deletions: 0 })),
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'PASS');
});

test('010 check: PASS with operator-routed unverifiable claim', () => {
  // The skill text explicitly allows "cannot verify in dispatch; operator to confirm" as acceptable.
  // The substance heuristic accepts this because the line is long enough and includes "verified" via "cannot verify".
  const ctx = buildContextFromFixture({
    message: [
      'feat: production deploy hook',
      '',
      'Verification: cannot verify in dispatch context; operator to confirm via Vercel dashboard; ran tsc --noEmit and observed zero errors locally',
    ].join('\n'),
    files: Array.from({ length: 7 }, (_, i) => ({ path: `fsi-app/src/lib/d${i}.ts`, additions: 12, deletions: 0 })),
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'PASS');
});

test('010 check: PASS accepts the first substantive line when an earlier line is trivial', () => {
  const ctx = buildContextFromFixture({
    message: [
      'feat: belt and suspenders',
      '',
      'Verification: done',
      'Verification: ran npx tsc --noEmit; observed zero errors',
    ].join('\n'),
    files: Array.from({ length: 10 }, (_, i) => ({ path: `src/f${i}.ts`, additions: 5, deletions: 5 })),
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'PASS');
});

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

test('010: has required metadata fields', () => {
  assert.equal(rule.id, '010');
  assert.equal(typeof rule.name, 'string');
  assert.equal(typeof rule.description, 'string');
  assert.ok(rule.ruleSource.includes('sprint-followups-discipline'));
});
