// docs-only-range.test.mjs (lane R22, 2026-10-01). Pure-function tests for the shared docs-only filter
// pre-push and discipline.yml both call. node:test + node:assert/strict, no npm deps.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDocsOnlyPath, isDocsOnlyDiff } from './docs-only-range.mjs';

test('isDocsOnlyPath accepts anything under docs/', () => {
  assert.equal(isDocsOnlyPath('docs/runbooks/fleet-budget-control.md'), true);
  assert.equal(isDocsOnlyPath('docs/census/some-export.json'), true);
});

test('isDocsOnlyPath accepts any *.md file anywhere in the repo', () => {
  assert.equal(isDocsOnlyPath('CLAUDE.md'), true);
  assert.equal(isDocsOnlyPath('fsi-app/STATUS.md'), true);
  assert.equal(isDocsOnlyPath('fsi-app/.claude/skills/some-skill/SKILL.md'), true);
});

test('isDocsOnlyPath rejects code and workflow files', () => {
  assert.equal(isDocsOnlyPath('fsi-app/src/lib/trust.ts'), false);
  assert.equal(isDocsOnlyPath('.github/workflows/discipline.yml'), false);
  assert.equal(isDocsOnlyPath('fsi-app/scripts/lib/db.mjs'), false);
});

test('isDocsOnlyPath normalizes backslash paths and a leading slash', () => {
  assert.equal(isDocsOnlyPath('docs\\runbooks\\fleet-budget-control.md'), true);
  assert.equal(isDocsOnlyPath('/docs/INDEX.md'), true);
});

test('isDocsOnlyPath rejects an empty or blank path', () => {
  assert.equal(isDocsOnlyPath(''), false);
  assert.equal(isDocsOnlyPath('   '), false);
});

test('isDocsOnlyDiff is true when every changed file is docs-only', () => {
  assert.equal(
    isDocsOnlyDiff(['docs/runbooks/fleet-budget-control.md', 'docs/ops/session-log.d/2026-10-01-r22.md', 'CLAUDE.md']),
    true,
  );
});

test('isDocsOnlyDiff is false when even one changed file is code (the mixed-diff attack)', () => {
  assert.equal(
    isDocsOnlyDiff(['docs/runbooks/fleet-budget-control.md', '.github/workflows/discipline.yml']),
    false,
  );
});

test('isDocsOnlyDiff is false for an empty changed-file list (no diff is not "provably docs-only")', () => {
  assert.equal(isDocsOnlyDiff([]), false);
  assert.equal(isDocsOnlyDiff(['', '   ']), false);
});

test('isDocsOnlyDiff ignores blank entries mixed into an otherwise docs-only list', () => {
  assert.equal(isDocsOnlyDiff(['docs/INDEX.md', '', 'CLAUDE.md']), true);
});
