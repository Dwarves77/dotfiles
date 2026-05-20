// Tests for rule 006. Run: node --test fsi-app/.discipline/rules/006-planning-doc.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rule, _isPlanningDocPath } from './006-planning-doc.mjs';
import { buildContextFromFixture } from '../lib/context.mjs';

// ---------------------------------------------------------------------------
// Path detector
// ---------------------------------------------------------------------------

test('006 path detector: matches docs/plans/* files', () => {
  assert.equal(_isPlanningDocPath('docs/plans/2026-05-20-track-abc.md'), true);
  assert.equal(_isPlanningDocPath('docs/plans/some-plan.md'), true);
});

test('006 path detector: matches docs/sprint-N/...plan*.md', () => {
  assert.equal(_isPlanningDocPath('docs/sprint-2/planning-2026-05-19.md'), true);
  assert.equal(_isPlanningDocPath('docs/sprint-2/sprint-plan.md'), true);
  assert.equal(_isPlanningDocPath('docs/sprint-1/build-plan-q4.md'), true);
});

test('006 path detector: does NOT match unrelated docs', () => {
  assert.equal(_isPlanningDocPath('docs/sprint-2/followups.md'), false);
  assert.equal(_isPlanningDocPath('docs/sprint-1/discovery.md'), false);
  assert.equal(_isPlanningDocPath('docs/design-principles.md'), false);
  assert.equal(_isPlanningDocPath('README.md'), false);
});

// ---------------------------------------------------------------------------
// Trigger
// ---------------------------------------------------------------------------

test('006 trigger: skips when not on master', () => {
  const ctx = buildContextFromFixture({
    message: 'plan: sprint 2',
    files: [{ path: 'docs/sprint-2/planning-2026-05-19.md', additions: 200, deletions: 0 }],
    branch: 'feat/foo',
  });
  assert.equal(rule.trigger(ctx), false);
});

test('006 trigger: skips when no planning doc touched', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: add a route',
    files: [{ path: 'fsi-app/src/app/api/foo/route.ts', additions: 30, deletions: 0 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), false);
});

test('006 trigger: skips merge commits', () => {
  const ctx = buildContextFromFixture({
    message: 'plan: sprint 2',
    files: [{ path: 'docs/sprint-2/planning-2026-05-19.md', additions: 200, deletions: 0 }],
    branch: 'master',
    isMergeCommit: true,
  });
  assert.equal(rule.trigger(ctx), false);
});

test('006 trigger: fires when docs/plans/* touched on master', () => {
  const ctx = buildContextFromFixture({
    message: 'plan: track A+B+C coordination',
    files: [{ path: 'docs/plans/2026-05-20-tracks-abc.md', additions: 150, deletions: 0 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

test('006 trigger: fires when docs/sprint-*/...plan*.md touched on master', () => {
  const ctx = buildContextFromFixture({
    message: 'plan: sprint 2 builds',
    files: [{ path: 'docs/sprint-2/planning-2026-05-19.md', additions: 200, deletions: 0 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

test('006 trigger: fires on self-attested Dispatch-type: planning', () => {
  const ctx = buildContextFromFixture({
    message: 'chore: planning notes\n\nDispatch-type: planning',
    files: [{ path: 'docs/sprint-2/notes.md', additions: 50, deletions: 0 }],
    branch: 'master',
  });
  assert.equal(rule.trigger(ctx), true);
});

// ---------------------------------------------------------------------------
// Check
// ---------------------------------------------------------------------------

test('006 check: PASS with Planning-doc line citing skill + section', () => {
  const ctx = buildContextFromFixture({
    message: [
      'plan: sprint 2 builds',
      '',
      'body.',
      '',
      'Planning-doc: skill-scope verified for D7, D14 decisions; cites caros-ledge-platform-intent § 3, § 4',
    ].join('\n'),
    files: [{ path: 'docs/sprint-2/planning-2026-05-19.md', additions: 200, deletions: 0 }],
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'PASS');
});

test('006 check: PASS with no-operator-decision-points form', () => {
  const ctx = buildContextFromFixture({
    message: 'plan: single-path build\n\nPlanning-doc: no operator decision points (single-path build per skill)',
    files: [{ path: 'docs/plans/2026-05-20-single-path.md', additions: 80, deletions: 0 }],
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'PASS');
});

test('006 check: FAIL when no Planning-doc line', () => {
  const ctx = buildContextFromFixture({
    message: 'plan: sprint 2 builds\n\nbody describes plan but no skill-scope line.',
    files: [{ path: 'docs/sprint-2/planning-2026-05-19.md', additions: 200, deletions: 0 }],
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'FAIL');
  assert.ok(result.message.includes('Planning-doc'));
  assert.ok(result.remediation.length > 0);
});

test('006 check: FAIL when Planning-doc line is too thin', () => {
  const ctx = buildContextFromFixture({
    message: 'plan: sprint 2\n\nPlanning-doc: see report',
    files: [{ path: 'docs/sprint-2/planning-2026-05-19.md', additions: 200, deletions: 0 }],
    branch: 'master',
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'FAIL');
  assert.ok(result.message.includes('thin') || result.message.includes('skill-scope'));
});

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

test('006: has required metadata fields', () => {
  assert.equal(rule.id, '006');
  assert.equal(typeof rule.name, 'string');
  assert.equal(typeof rule.description, 'string');
  assert.ok(rule.ruleSource.includes('sprint-followups-discipline'));
});
