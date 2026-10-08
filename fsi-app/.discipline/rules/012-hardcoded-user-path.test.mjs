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

test('012 trigger: skips captured-content snapshots under scripts/_snapshots/', () => {
  const ctx = buildContextFromFixture({
    message: 'population-turn apply: run 33825867992',
    files: [{ path: 'fsi-app/scripts/_snapshots/population-33825867992/census-rows.json', additions: 3000, deletions: 0 }],
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
// Check (lane GATE-1, 2026-10-08): INTRODUCED lines only. A path string that was already on a line the
// commit edits, or that the commit moves, is not this commit's defect; a path string it writes is.
// ---------------------------------------------------------------------------

// fileContents carries the post-image too, so a rule that (wrongly) scans the whole file sees the same
// path string the diff view does and the test separates "present" from "introduced".
function change(path, c) {
  return buildContextFromFixture({
    message: 'feat: thing',
    files: [{ path, status: c.status }],
    changes: [{ path, ...c }],
    fileContents: { [path]: `${(c.added || []).join('\n')}\n` },
  });
}

test('012 check: PASS for clean code', () => {
  const ctx = change('fsi-app/src/foo.ts', { added: ['import { getRepoRoot } from "./lib/context.mjs";', 'const x = getRepoRoot();'] });
  assert.equal(rule.check(ctx).status, 'PASS');
});

test('012 check: PASS when there is no diff for the file (nothing introduced)', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: thing',
    files: [{ path: 'fsi-app/src/foo.ts', additions: 10, deletions: 0 }],
    fileContents: { 'fsi-app/src/foo.ts': `const REPO = '${WIN_USERS}';
` },
  });
  assert.equal(rule.check(ctx).status, 'PASS', 'a pre-existing path elsewhere in the file is not read');
});

test('012 check: PASS when a pre-existing path sits on a line the commit EDITS', () => {
  const ctx = change('fsi-app/src/foo.ts', {
    removed: [`const REPO = '${WIN_USERS}'; // old`],
    added: [`const REPO = '${WIN_USERS}'; // tidied comment`],
  });
  assert.equal(rule.check(ctx).status, 'PASS');
});

test('012 check: PASS when a path line is MOVED to another file', () => {
  const ctx = buildContextFromFixture({
    message: 'refactor: split',
    files: [{ path: 'fsi-app/src/a.ts' }, { path: 'fsi-app/src/b.ts', status: 'A' }],
    changes: [
      { path: 'fsi-app/src/a.ts', removed: [`const REPO = '${WIN_USERS}';`] },
      { path: 'fsi-app/src/b.ts', status: 'A', added: [`const REPO = '${WIN_USERS}';`] },
    ],
    fileContents: { 'fsi-app/src/b.ts': `const REPO = '${WIN_USERS}';
` },
  });
  assert.equal(rule.check(ctx).status, 'PASS');
});

// ---------------------------------------------------------------------------
// Check: fail cases (each pattern variant)
// ---------------------------------------------------------------------------

test('012 check: FAIL when Windows user-home forward-slash pattern is introduced', () => {
  const ctx = change('fsi-app/src/foo.ts', { added: [`const REPO = '${WIN_USERS}';`], newStart: 1 });
  const result = rule.check(ctx);
  assert.equal(result.status, 'FAIL');
  assert.ok(result.message.includes('1 location'));
  assert.ok(result.remediation.includes('getRepoRoot'));
  assert.ok(result.remediation.includes('fsi-app/src/foo.ts:1'));
  assert.deepEqual(result.locations, [{ path: 'fsi-app/src/foo.ts', line: 1 }]);
});

test('012 check: FAIL when Windows user-home backslash pattern is introduced', () => {
  assert.equal(rule.check(change('fsi-app/src/foo.ts', { added: [`const REPO = "${WIN_BACKSLASH}";`] })).status, 'FAIL');
});

test('012 check: FAIL when operator Unix home pattern is introduced', () => {
  assert.equal(rule.check(change('fsi-app/src/foo.ts', { added: [`const HOME = '${UNIX_JASON}';`] })).status, 'FAIL');
});

test('012 check: FAIL when operator macOS home pattern is introduced', () => {
  assert.equal(rule.check(change('fsi-app/src/foo.ts', { added: [`const HOME = '${MAC_JASON}';`] })).status, 'FAIL');
});

test('012 check: FAIL when an edit INTRODUCES the pattern on a line that lacked it', () => {
  const ctx = change('fsi-app/src/foo.ts', { removed: ['const REPO = getRepoRoot();'], added: [`const REPO = '${WIN_USERS}';`], newStart: 4 });
  const r = rule.check(ctx);
  assert.equal(r.status, 'FAIL');
  assert.ok(r.remediation.includes('fsi-app/src/foo.ts:4'));
});

// ---------------------------------------------------------------------------
// Check: multi-violation aggregation
// ---------------------------------------------------------------------------

test('012 check: aggregates multiple violations across multiple files', () => {
  const ctx = buildContextFromFixture({
    message: 'feat: multi',
    files: [{ path: 'fsi-app/src/a.ts' }, { path: 'fsi-app/src/b.ts' }],
    changes: [
      { path: 'fsi-app/src/a.ts', added: [`const A = '${WIN_USERS}';`, `const B = '${UNIX_JASON}';`] },
      { path: 'fsi-app/src/b.ts', added: [`const C = '${MAC_JASON}';`] },
    ],
  });
  const result = rule.check(ctx);
  assert.equal(result.status, 'FAIL');
  assert.ok(result.message.includes('3 location'));
  assert.ok(result.remediation.includes('fsi-app/src/a.ts:1'));
  assert.ok(result.remediation.includes('fsi-app/src/a.ts:2'));
  assert.ok(result.remediation.includes('fsi-app/src/b.ts:1'));
});

test('012 check: respects scripts/tmp/ skip path (PASS even with introduced content)', () => {
  const ctx = change('fsi-app/scripts/tmp/throwaway.mjs', { status: 'A', added: [`const REPO = '${WIN_USERS}';`] });
  assert.equal(rule.trigger(ctx), false);
  assert.equal(rule.check(ctx).status, 'PASS');
});

test('012 check: captured third-party content under scripts/_snapshots/ is data, not code', () => {
  const path = 'fsi-app/scripts/_snapshots/population-33825867992/census-rows.apply-ready.json';
  const ctx = change(path, { status: 'A', added: [`{"result_content": "L_202302463EN.000101.fmx.xml Official Journal ${WIN_USERS} ..."}`] });
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
