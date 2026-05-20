// Tests for predicates. Run: node --test fsi-app/.discipline/lib/predicates.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  commitMessageHasLine,
  commitMessageLines,
  commitMessageMatches,
  commitSubjectMatches,
  filesMatching,
  hasFileMatching,
  isSubstantialDispatch,
  isApplicableDispatchType,
  isInvestigationOnly,
  isHotfix,
  isResearchOnly,
  isConversationOnly,
  touchedInventorySurfaces,
  _matchesPattern,
} from './predicates.mjs';
import { buildContextFromFixture, getRepoRoot, _clearRepoRootCache } from './context.mjs';

// ---------------------------------------------------------------------------
// commitMessageHasLine
// ---------------------------------------------------------------------------

test('commitMessageHasLine: finds line by prefix', () => {
  const ctx = buildContextFromFixture({
    message: 'subject\n\nbody line 1\nLoop-closure: OBS-1 COVER; DP-1 PASS\nbody line 3',
    files: [],
  });
  assert.equal(commitMessageHasLine(ctx, 'Loop-closure:'), true);
});

test('commitMessageHasLine: returns false when prefix absent', () => {
  const ctx = buildContextFromFixture({
    message: 'subject\n\nbody only',
    files: [],
  });
  assert.equal(commitMessageHasLine(ctx, 'Loop-closure:'), false);
});

test('commitMessageHasLine: ignores leading whitespace', () => {
  const ctx = buildContextFromFixture({
    message: 'subject\n\n  Loop-closure: OBS-1 COVER',
    files: [],
  });
  assert.equal(commitMessageHasLine(ctx, 'Loop-closure:'), true);
});

test('commitMessageHasLine: does NOT match substring in middle of line', () => {
  const ctx = buildContextFromFixture({
    message: 'subject\n\nsee Loop-closure: details below',
    files: [],
  });
  assert.equal(commitMessageHasLine(ctx, 'Loop-closure:'), false);
});

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
// isSubstantialDispatch
// ---------------------------------------------------------------------------

test('isSubstantialDispatch: small commit returns false', () => {
  const ctx = buildContextFromFixture({
    message: 'fix: typo in README',
    files: [{ path: 'README.md', additions: 1, deletions: 1 }],
  });
  assert.equal(isSubstantialDispatch(ctx), false);
});

test('isSubstantialDispatch: >5 files returns true', () => {
  const ctx = buildContextFromFixture({
    message: 'refactor: rename things',
    files: Array.from({ length: 7 }, (_, i) => ({ path: `src/file${i}.ts`, additions: 5, deletions: 5 })),
  });
  assert.equal(isSubstantialDispatch(ctx), true);
});

test('isSubstantialDispatch: SKILL.md change returns true regardless of size', () => {
  const ctx = buildContextFromFixture({
    message: 'skill: tweak wording',
    files: [{ path: 'fsi-app/.claude/skills/foo/SKILL.md', additions: 2, deletions: 1 }],
  });
  assert.equal(isSubstantialDispatch(ctx), true);
});

test('isSubstantialDispatch: migration returns true', () => {
  const ctx = buildContextFromFixture({
    message: 'migration: add column',
    files: [{ path: 'fsi-app/supabase/migrations/098_add_col.sql', additions: 10, deletions: 0 }],
  });
  assert.equal(isSubstantialDispatch(ctx), true);
});

test('isSubstantialDispatch: route change returns true', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: new admin route',
    files: [{ path: 'fsi-app/src/app/api/admin/foo/route.ts', additions: 30, deletions: 0 }],
  });
  assert.equal(isSubstantialDispatch(ctx), true);
});

test('isSubstantialDispatch: discipline file change returns true', () => {
  const ctx = buildContextFromFixture({
    message: 'discipline: tweak rule',
    files: [{ path: 'fsi-app/.discipline/rules/001-foo.mjs', additions: 5, deletions: 5 }],
  });
  assert.equal(isSubstantialDispatch(ctx), true);
});

test('isSubstantialDispatch: vercel.json change returns true', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: add cron',
    files: [{ path: 'fsi-app/vercel.json', additions: 5, deletions: 0 }],
  });
  assert.equal(isSubstantialDispatch(ctx), true);
});

test('isSubstantialDispatch: large followups doc add returns true', () => {
  const ctx = buildContextFromFixture({
    message: 'obs: add entry',
    files: [{ path: 'docs/sprint-1/followups.md', additions: 25, deletions: 0 }],
  });
  assert.equal(isSubstantialDispatch(ctx), true);
});

test('isSubstantialDispatch: small followups touch returns false', () => {
  const ctx = buildContextFromFixture({
    message: 'fix: typo',
    files: [{ path: 'docs/sprint-1/followups.md', additions: 2, deletions: 1 }],
  });
  assert.equal(isSubstantialDispatch(ctx), false);
});

test('isSubstantialDispatch: respects "Substantial: no" override', () => {
  const ctx = buildContextFromFixture({
    message: 'huge refactor\n\nSubstantial: no',
    files: Array.from({ length: 50 }, (_, i) => ({ path: `src/file${i}.ts`, additions: 1, deletions: 1 })),
  });
  assert.equal(isSubstantialDispatch(ctx), false);
});

test('isSubstantialDispatch: respects "Substantial: yes" override', () => {
  const ctx = buildContextFromFixture({
    message: 'tiny but substantial\n\nSubstantial: yes',
    files: [{ path: 'README.md', additions: 1, deletions: 0 }],
  });
  assert.equal(isSubstantialDispatch(ctx), true);
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
// touchedInventorySurfaces
// ---------------------------------------------------------------------------

test('touchedInventorySurfaces: empty for unrelated changes', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: tweak',
    files: [{ path: 'src/lib/util.ts', additions: 5, deletions: 5 }],
  });
  assert.deepEqual(touchedInventorySurfaces(ctx), []);
});

test('touchedInventorySurfaces: detects skills', () => {
  const ctx = buildContextFromFixture({
    message: 'skill: tweak',
    files: [{ path: 'fsi-app/.claude/skills/foo/SKILL.md', additions: 5, deletions: 0 }],
  });
  assert.deepEqual(touchedInventorySurfaces(ctx), ['skills']);
});

test('touchedInventorySurfaces: detects routes', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: route',
    files: [{ path: 'fsi-app/src/app/api/admin/foo/route.ts', additions: 30, deletions: 0 }],
  });
  assert.deepEqual(touchedInventorySurfaces(ctx), ['routes']);
});

test('touchedInventorySurfaces: detects migrations', () => {
  const ctx = buildContextFromFixture({
    message: 'migration: add col',
    files: [{ path: 'fsi-app/supabase/migrations/099.sql', additions: 10, deletions: 0 }],
  });
  assert.deepEqual(touchedInventorySurfaces(ctx), ['migrations']);
});

test('touchedInventorySurfaces: detects multiple', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: route + migration',
    files: [
      { path: 'fsi-app/src/app/api/admin/foo/route.ts', additions: 30, deletions: 0 },
      { path: 'fsi-app/supabase/migrations/099.sql', additions: 10, deletions: 0 },
    ],
  });
  const surfaces = touchedInventorySurfaces(ctx);
  assert.ok(surfaces.includes('routes'));
  assert.ok(surfaces.includes('migrations'));
  assert.equal(surfaces.length, 2);
});

test('touchedInventorySurfaces: detects discipline', () => {
  const ctx = buildContextFromFixture({
    message: 'discipline: tweak rule',
    files: [{ path: 'fsi-app/.discipline/rules/001-foo.mjs', additions: 5, deletions: 5 }],
  });
  assert.ok(touchedInventorySurfaces(ctx).includes('discipline'));
});

test('touchedInventorySurfaces: detects obs-status from followups', () => {
  const ctx = buildContextFromFixture({
    message: 'obs: add entry',
    files: [{ path: 'docs/sprint-1/followups.md', additions: 25, deletions: 0 }],
  });
  assert.ok(touchedInventorySurfaces(ctx).includes('obs-status'));
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
