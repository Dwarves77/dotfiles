// Tests for rule 012. Run: node --test fsi-app/.discipline/rules/012-hardcoded-user-path.test.mjs
//
// Note on fixture construction: this file CONTAINS test data that includes
// hardcoded-path patterns the rule is supposed to catch. To avoid the rule
// flagging this test file itself (false-positive when rule 012 runs against
// a commit that includes this file), all offending strings are built by
// concatenating literal fragments at runtime. The grep against file source
// then sees only the fragments, not the full pattern.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rule, _HARDCODED_PATH_RE } from './012-hardcoded-user-path.mjs';
import { buildContextFromFixture } from '../lib/context.mjs';

// Helper: build offending paths via concatenation so this test file doesn't
// itself match the rule's regex.
const WIN_USERS = 'C:/Users' + '/' + 'jason' + '/dotfiles/foo';
const WIN_BACKSLASH = 'C:\\Users' + '\\' + 'jason' + '\\dotfiles\\foo';
const GITBASH = '/c/Users' + '/' + 'jason' + '/dotfiles/foo';
const UNIX_JASON = '/home' + '/' + 'jason' + '/dotfiles/foo';
const MAC_JASON = '/Users' + '/' + 'jason' + '/dotfiles/foo';

// ---------------------------------------------------------------------------
// Regex
// ---------------------------------------------------------------------------

test('012 regex: matches Windows user-home forward-slash pattern', () => {
  _HARDCODED_PATH_RE.lastIndex = 0;
  assert.ok(_HARDCODED_PATH_RE.test(`const X = '${WIN_USERS}';`));
});

test('012 regex: matches Windows user-home backslash pattern', () => {
  _HARDCODED_PATH_RE.lastIndex = 0;
  assert.ok(_HARDCODED_PATH_RE.test(`const X = "${WIN_BACKSLASH}";`));
});

test('012 regex: matches Git Bash user-home pattern', () => {
  _HARDCODED_PATH_RE.lastIndex = 0;
  assert.ok(_HARDCODED_PATH_RE.test(`const X = '${GITBASH}';`));
});

test('012 regex: matches operator Unix home directory', () => {
  _HARDCODED_PATH_RE.lastIndex = 0;
  assert.ok(_HARDCODED_PATH_RE.test(`const X = '${UNIX_JASON}';`));
});

test('012 regex: matches operator macOS home directory', () => {
  _HARDCODED_PATH_RE.lastIndex = 0;
  assert.ok(_HARDCODED_PATH_RE.test(`const X = '${MAC_JASON}';`));
});

test('012 regex: does NOT match GitHub Actions Linux runner home', () => {
  _HARDCODED_PATH_RE.lastIndex = 0;
  assert.equal(_HARDCODED_PATH_RE.test('const X = "/home/runner/work/foo";'), false);
});

test('012 regex: does NOT match generic test-user macOS home', () => {
  _HARDCODED_PATH_RE.lastIndex = 0;
  assert.equal(_HARDCODED_PATH_RE.test('const X = "/Users/test/foo";'), false);
});

test('012 regex: does NOT match clean code', () => {
  _HARDCODED_PATH_RE.lastIndex = 0;
  assert.equal(_HARDCODED_PATH_RE.test('const REPO_ROOT = getRepoRoot();'), false);
});

// ---------------------------------------------------------------------------
// Trigger
// ---------------------------------------------------------------------------

test('012 trigger: skips merge commits', () => {
  const ctx = buildContextFromFixture({
    message: 'Merge branch foo',
    files: [{ path: 'fsi-app/src/foo.ts', additions: 10, deletions: 0 }],
    isMergeCommit: true,
  });
  assert.equal(rule.trigger(ctx), false);
});

test('012 trigger: skips revert commits', () => {
  const ctx = buildContextFromFixture({
    message: 'Revert "feat: thing"',
    files: [{ path: 'fsi-app/src/foo.ts', additions: 10, deletions: 0 }],
  });
  assert.equal(rule.trigger(ctx), false);
});

test('012 trigger: skips when no code files staged', () => {
  const ctx = buildContextFromFixture({
    message: 'docs: update README',
    files: [{ path: 'README.md', additions: 5, deletions: 0 }],
  });
  assert.equal(rule.trigger(ctx), false);
});

test('012 trigger: fires when at least one code file staged', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: thing',
    files: [{ path: 'fsi-app/src/foo.ts', additions: 10, deletions: 0 }],
  });
  assert.equal(rule.trigger(ctx), true);
});

test('012 trigger: skips files under scripts/tmp/', () => {
  const ctx = buildContextFromFixture({
    message: 'tmp: scratch script',
    files: [{ path: 'fsi-app/scripts/tmp/throwaway.mjs', additions: 100, deletions: 0 }],
  });
  assert.equal(rule.trigger(ctx), false);
});

test('012 trigger: skips deletions', () => {
  const ctx = buildContextFromFixture({
    message: 'refactor: remove old file',
    files: [{ path: 'fsi-app/src/old.ts', additions: 0, deletions: 50, status: 'D' }],
  });
  assert.equal(rule.trigger(ctx), false);
});

// ---------------------------------------------------------------------------
// Check: pass cases
// ---------------------------------------------------------------------------

test('012 check: PASS for clean code', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: clean code',
    files: [{ path: 'fsi-app/src/foo.ts', additions: 10, deletions: 0 }],
    fileContents: {
      'fsi-app/src/foo.ts': 'import { getRepoRoot } from "./lib/context.mjs";\nconst x = getRepoRoot();\n',
    },
  });
  assert.equal(rule.check(ctx).status, 'PASS');
});

test('012 check: PASS when content is null (file not readable; tolerant)', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: thing',
    files: [{ path: 'fsi-app/src/foo.ts', additions: 10, deletions: 0 }],
    // fileContents omitted; getFileContent returns null in fixture mode
  });
  assert.equal(rule.check(ctx).status, 'PASS');
});

// ---------------------------------------------------------------------------
// Check: fail cases (each pattern variant)
// ---------------------------------------------------------------------------

test('012 check: FAIL when Windows user-home forward-slash pattern present', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: thing',
    files: [{ path: 'fsi-app/src/foo.ts', additions: 10, deletions: 0 }],
    fileContents: {
      'fsi-app/src/foo.ts': `const REPO = '${WIN_USERS}';\n`,
    },
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'FAIL');
  assert.ok(result.message.includes('1 location'));
  assert.ok(result.remediation.includes('getRepoRoot'));
  assert.ok(result.remediation.includes('fsi-app/src/foo.ts:1'));
});

test('012 check: FAIL when Windows user-home backslash pattern present', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: thing',
    files: [{ path: 'fsi-app/src/foo.ts', additions: 10, deletions: 0 }],
    fileContents: {
      'fsi-app/src/foo.ts': `const REPO = "${WIN_BACKSLASH}";\n`,
    },
  });
  assert.equal(rule.check(ctx).status, 'FAIL');
});

test('012 check: FAIL when operator Unix home pattern present', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: thing',
    files: [{ path: 'fsi-app/src/foo.ts', additions: 10, deletions: 0 }],
    fileContents: {
      'fsi-app/src/foo.ts': `const HOME = '${UNIX_JASON}';\n`,
    },
  });
  assert.equal(rule.check(ctx).status, 'FAIL');
});

test('012 check: FAIL when operator macOS home pattern present', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: thing',
    files: [{ path: 'fsi-app/src/foo.ts', additions: 10, deletions: 0 }],
    fileContents: {
      'fsi-app/src/foo.ts': `const HOME = '${MAC_JASON}';\n`,
    },
  });
  assert.equal(rule.check(ctx).status, 'FAIL');
});

// ---------------------------------------------------------------------------
// Check: multi-violation aggregation
// ---------------------------------------------------------------------------

test('012 check: aggregates multiple violations across multiple files', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: multi',
    files: [
      { path: 'fsi-app/src/a.ts', additions: 5, deletions: 0 },
      { path: 'fsi-app/src/b.ts', additions: 5, deletions: 0 },
    ],
    fileContents: {
      'fsi-app/src/a.ts': `const A = '${WIN_USERS}';\nconst B = '${UNIX_JASON}';\n`,
      'fsi-app/src/b.ts': `const C = '${MAC_JASON}';\n`,
    },
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'FAIL');
  assert.ok(result.message.includes('3 location'));
  assert.ok(result.remediation.includes('fsi-app/src/a.ts:1'));
  assert.ok(result.remediation.includes('fsi-app/src/a.ts:2'));
  assert.ok(result.remediation.includes('fsi-app/src/b.ts:1'));
});

test('012 check: respects scripts/tmp/ skip path (PASS even with hardcoded content)', () => {
  const ctx = buildContextFromFixture({
    message: 'tmp: scratch',
    files: [{ path: 'fsi-app/scripts/tmp/throwaway.mjs', additions: 100, deletions: 0 }],
    fileContents: {
      'fsi-app/scripts/tmp/throwaway.mjs': `const REPO = '${WIN_USERS}';\n`,
    },
  });
  // trigger returns false for scripts/tmp/, but if forced to run check it should still pass
  // (relevantFiles filters before reading)
  assert.equal(rule.trigger(ctx), false);
  assert.equal(rule.check(ctx).status, 'PASS');
});

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

test('012: has required metadata fields', () => {
  assert.equal(rule.id, '012');
  assert.equal(typeof rule.name, 'string');
  assert.equal(typeof rule.description, 'string');
  assert.ok(rule.ruleSource.includes('OBS-59'));
});
