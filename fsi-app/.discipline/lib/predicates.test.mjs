// Tests for predicates. Run: node --test fsi-app/.discipline/lib/predicates.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  commitMessageLines,
  filesMatching,
  hasFileMatching,
  isApplicableDispatchType,
  isInvestigationOnly,
  isHotfix,
  isResearchOnly,
  isConversationOnly,
  _matchesPattern,
} from './predicates.mjs';
import { buildContextFromFixture, getRepoRoot, _clearRepoRootCache } from './context.mjs';

// ---------------------------------------------------------------------------
// commitMessageLines
// ---------------------------------------------------------------------------

test('commitMessageLines: returns all matching lines', () => {
  const ctx = buildContextFromFixture({
    message: 'subject\n\nInventory-emission: docs/inventories/routes.md +1\nInventory-emission: docs/inventories/migrations.md +2',
    files: [],
  });
  const lines = commitMessageLines(ctx, 'Inventory-emission:');
  assert.equal(lines.length, 2);
  assert.ok(lines[0].includes('routes.md'));
  assert.ok(lines[1].includes('migrations.md'));
});

test('commitMessageLines: empty when no match', () => {
  const ctx = buildContextFromFixture({ message: 'subject\n\nbody', files: [] });
  assert.deepEqual(commitMessageLines(ctx, 'Inventory-emission:'), []);
});

// ---------------------------------------------------------------------------
// matchesPattern
// ---------------------------------------------------------------------------

test('_matchesPattern: exact match', () => {
  assert.equal(_matchesPattern('a/b/c.ts', 'a/b/c.ts'), true);
  assert.equal(_matchesPattern('a/b/c.ts', 'a/b/d.ts'), false);
});

test('_matchesPattern: dir/ prefix', () => {
  assert.equal(_matchesPattern('fsi-app/supabase/migrations/097.sql', 'fsi-app/supabase/migrations/'), true);
  assert.equal(_matchesPattern('fsi-app/scripts/x.mjs', 'fsi-app/supabase/migrations/'), false);
});

test('_matchesPattern: **/filename', () => {
  assert.equal(_matchesPattern('fsi-app/.claude/skills/foo/SKILL.md', '**/SKILL.md'), true);
  assert.equal(_matchesPattern('SKILL.md', '**/SKILL.md'), true);
  assert.equal(_matchesPattern('SKILL.txt', '**/SKILL.md'), false);
});

test('_matchesPattern: dir/**/*.ext', () => {
  assert.equal(_matchesPattern('fsi-app/src/app/api/admin/foo/route.ts', 'fsi-app/src/app/api/**/*.ts'), true);
  assert.equal(_matchesPattern('fsi-app/src/lib/x.ts', 'fsi-app/src/app/api/**/*.ts'), false);
});

test('_matchesPattern: dir/**/filename', () => {
  assert.equal(_matchesPattern('fsi-app/src/app/api/admin/foo/route.ts', 'fsi-app/src/app/api/**/route.ts'), true);
  assert.equal(_matchesPattern('fsi-app/src/app/api/admin/foo/page.ts', 'fsi-app/src/app/api/**/route.ts'), false);
});

test('_matchesPattern: normalizes backslashes', () => {
  assert.equal(_matchesPattern('fsi-app\\supabase\\migrations\\097.sql', 'fsi-app/supabase/migrations/'), true);
});

// ---------------------------------------------------------------------------
// isApplicableDispatchType
// ---------------------------------------------------------------------------

test('isApplicableDispatchType: regular feat returns true', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: add thing',
    files: [{ path: 'src/foo.ts', additions: 10, deletions: 0 }],
  });
  assert.equal(isApplicableDispatchType(ctx), true);
});

test('isApplicableDispatchType: audit subject returns false', () => {
  const ctx = buildContextFromFixture({
    message: 'audit: routing pipeline review',
    files: [{ path: 'docs/audit.md', additions: 100, deletions: 0 }],
  });
  assert.equal(isApplicableDispatchType(ctx), false);
});

test('isApplicableDispatchType: hotfix with 1 file returns false', () => {
  const ctx = buildContextFromFixture({
    message: 'hotfix: null check',
    files: [{ path: 'src/foo.ts', additions: 1, deletions: 0 }],
  });
  assert.equal(isApplicableDispatchType(ctx), false);
});

test('isApplicableDispatchType: large hotfix returns true (still owes closure)', () => {
  const ctx = buildContextFromFixture({
    message: 'hotfix: cascade fix',
    files: Array.from({ length: 5 }, (_, i) => ({ path: `src/f${i}.ts`, additions: 5, deletions: 5 })),
  });
  assert.equal(isApplicableDispatchType(ctx), true);
});

test('isApplicableDispatchType: research-only returns false', () => {
  const ctx = buildContextFromFixture({
    message: 'research: market analysis',
    files: [{ path: 'docs/research.md', additions: 100, deletions: 0 }],
  });
  assert.equal(isApplicableDispatchType(ctx), false);
});

test('isApplicableDispatchType: conversation docs returns false', () => {
  const ctx = buildContextFromFixture({
    message: 'docs: notes from convo',
    files: [{ path: 'docs/notes.md', additions: 50, deletions: 0 }],
  });
  assert.equal(isApplicableDispatchType(ctx), false);
});

test('isApplicableDispatchType: docs subject with code change returns true', () => {
  const ctx = buildContextFromFixture({
    message: 'docs: clarify API contract',
    files: [{ path: 'src/api.ts', additions: 5, deletions: 5 }],
  });
  assert.equal(isApplicableDispatchType(ctx), true);
});

test('isApplicableDispatchType: merge commit returns false', () => {
  const ctx = buildContextFromFixture({
    message: 'Merge branch feat/foo',
    files: [{ path: 'src/foo.ts', additions: 10, deletions: 0 }],
    isMergeCommit: true,
  });
  assert.equal(isApplicableDispatchType(ctx), false);
});

test('isApplicableDispatchType: revert commit returns false', () => {
  const ctx = buildContextFromFixture({
    message: 'Revert "feat: add thing"',
    files: [{ path: 'src/foo.ts', additions: 0, deletions: 10 }],
  });
  assert.equal(isApplicableDispatchType(ctx), false);
});

// ---------------------------------------------------------------------------
// getRepoRoot (OBS-59: env var override + explicit error outside git context)
// ---------------------------------------------------------------------------

test('getRepoRoot: honors DISCIPLINE_REPO_ROOT env var override', () => {
  const savedEnv = process.env.DISCIPLINE_REPO_ROOT;
  _clearRepoRootCache();
  process.env.DISCIPLINE_REPO_ROOT = '/fake/override/path';
  try {
    assert.equal(getRepoRoot(), '/fake/override/path');
  } finally {
    if (savedEnv === undefined) delete process.env.DISCIPLINE_REPO_ROOT;
    else process.env.DISCIPLINE_REPO_ROOT = savedEnv;
    _clearRepoRootCache();
  }
});

test('getRepoRoot: trims whitespace from env override', () => {
  const savedEnv = process.env.DISCIPLINE_REPO_ROOT;
  _clearRepoRootCache();
  process.env.DISCIPLINE_REPO_ROOT = '  /trimmed/path  \n';
  try {
    assert.equal(getRepoRoot(), '/trimmed/path');
  } finally {
    if (savedEnv === undefined) delete process.env.DISCIPLINE_REPO_ROOT;
    else process.env.DISCIPLINE_REPO_ROOT = savedEnv;
    _clearRepoRootCache();
  }
});

test('getRepoRoot: ignores empty env override and falls through to git', () => {
  const savedEnv = process.env.DISCIPLINE_REPO_ROOT;
  _clearRepoRootCache();
  process.env.DISCIPLINE_REPO_ROOT = '   ';
  try {
    const root = getRepoRoot();
    assert.ok(root.includes('dotfiles'), `expected git fallback to return dotfiles path, got: ${root}`);
  } finally {
    if (savedEnv === undefined) delete process.env.DISCIPLINE_REPO_ROOT;
    else process.env.DISCIPLINE_REPO_ROOT = savedEnv;
    _clearRepoRootCache();
  }
});

test('getRepoRoot: throws clear error when no env var and git fails', () => {
  // Simulate a non-git context by pointing PATH at an empty directory so the
  // git binary cannot be found, then clearing the env override.
  const savedEnv = process.env.DISCIPLINE_REPO_ROOT;
  const savedPath = process.env.PATH;
  const savedPathExt = process.env.PATHEXT;
  _clearRepoRootCache();
  delete process.env.DISCIPLINE_REPO_ROOT;
  process.env.PATH = '';
  process.env.PATHEXT = '';
  try {
    assert.throws(
      () => getRepoRoot(),
      (err) => {
        assert.match(err.message, /discipline engine: could not determine repo root/);
        assert.match(err.message, /DISCIPLINE_REPO_ROOT/);
        return true;
      }
    );
  } finally {
    process.env.PATH = savedPath;
    if (savedPathExt === undefined) delete process.env.PATHEXT;
    else process.env.PATHEXT = savedPathExt;
    if (savedEnv !== undefined) process.env.DISCIPLINE_REPO_ROOT = savedEnv;
    _clearRepoRootCache();
  }
});
