// Tests for context.mjs: the one-diff context and the introduced-lines view (lane GATE-1, 2026-10-08).
// Run: node --test fsi-app/.discipline/lib/context.test.mjs
//
// Fixture convention (same as the rule 022 test): every banned glyph is built at runtime with
// String.fromCharCode, never typed, so this file's own source never carries one.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  buildContextFromFixture,
  buildContextForProposedCommit,
  introducedMatches,
  parseUnifiedDiff,
  _clearRepoRootCache,
  _diffLoadCount,
} from './context.mjs';

const EM = String.fromCharCode(0x2014);
const hasGlyph = (line) => line.includes(EM);

// ---------------------------------------------------------------------------
// parseUnifiedDiff, pure
// ---------------------------------------------------------------------------

test('parseUnifiedDiff: status, paths, counts and hunks for add, modify, delete and rename', () => {
  const diff = [
    'diff --git a/new.txt b/new.txt',
    'new file mode 100644',
    '--- /dev/null',
    '+++ b/new.txt',
    '@@ -0,0 +1,2 @@',
    '+one',
    '+two',
    'diff --git a/mod.txt b/mod.txt',
    '--- a/mod.txt',
    '+++ b/mod.txt',
    '@@ -3 +3 @@',
    '-old',
    '+new',
    'diff --git a/gone.txt b/gone.txt',
    'deleted file mode 100644',
    '--- a/gone.txt',
    '+++ /dev/null',
    '@@ -1,2 +0,0 @@',
    '-x',
    '-y',
    'diff --git a/before.txt b/after.txt',
    'similarity index 100%',
    'rename from before.txt',
    'rename to after.txt',
  ].join('\n');
  const { files } = parseUnifiedDiff(diff);
  assert.deepEqual(files.map((f) => [f.path, f.status, f.additions, f.deletions]), [
    ['new.txt', 'A', 2, 0],
    ['mod.txt', 'M', 1, 1],
    ['gone.txt', 'D', 0, 2],
    ['after.txt', 'R', 0, 0],
  ]);
  assert.equal(files[3].oldPath, 'before.txt');
  assert.equal(files[1].hunks[0].newStart, 3);
  assert.deepEqual(files[1].hunks[0].removed, ['old']);
});

test('parseUnifiedDiff: a content line that looks like a file header inside a hunk is content', () => {
  const diff = ['diff --git a/x.md b/x.md', '--- a/x.md', '+++ b/x.md', '@@ -1 +1 @@', '----', '+++++'].join('\n');
  const { files } = parseUnifiedDiff(diff);
  assert.equal(files.length, 1);
  assert.deepEqual(files[0].hunks[0].removed, ['---']);
  assert.deepEqual(files[0].hunks[0].added, ['++++']);
});

test('parseUnifiedDiff: names with spaces, an empty new file, a no-newline marker and CRLF', () => {
  const diff = [
    'diff --git a/dir/a b.txt b/dir/a b.txt',
    'new file mode 100644',
    '--- /dev/null',
    '+++ b/dir/a b.txt\t',
    '@@ -0,0 +1 @@',
    '+line\r',
    '\\ No newline at end of file',
    'diff --git a/empty.txt b/empty.txt',
    'new file mode 100644',
  ].join('\n');
  const { files } = parseUnifiedDiff(diff);
  assert.deepEqual(files.map((f) => [f.path, f.status]), [['dir/a b.txt', 'A'], ['empty.txt', 'A']]);
  assert.deepEqual(files[0].hunks[0].added, ['line']);
});

test('parseUnifiedDiff: a combined merge diff is skipped, empty input yields no files', () => {
  assert.deepEqual(parseUnifiedDiff('diff --cc f.txt\n@@@ -1 -1 +1 @@@\n+x').files, []);
  assert.deepEqual(parseUnifiedDiff('').files, []);
  assert.deepEqual(parseUnifiedDiff(null).files, []);
});

// ---------------------------------------------------------------------------
// ctx.introducedLines on fixtures
// ---------------------------------------------------------------------------

test('introducedLines: an edited line pairs with the line it replaced, with its new-file number', () => {
  const ctx = buildContextFromFixture({
    message: 'x',
    files: [{ path: 'a.mjs' }],
    changes: [{ path: 'a.mjs', removed: [`// old ${EM} note`], added: [`// new ${EM} note`], oldStart: 7, newStart: 7 }],
  });
  const info = ctx.introducedLines('a.mjs');
  assert.deepEqual(info.added, [`// new ${EM} note`]);
  assert.equal(info.pairs[0].removed, `// old ${EM} note`);
  assert.equal(info.pairs[0].line, 7);
  assert.equal(introducedMatches(info, hasGlyph).length, 0);
});

test('introducedLines: a brand-new line has no counterpart and counts', () => {
  const ctx = buildContextFromFixture({
    message: 'x',
    files: [{ path: 'a.mjs' }],
    changes: [{ path: 'a.mjs', removed: ['const a = 1;'], added: [`const a = 1; // ${EM} new`] }],
  });
  assert.equal(introducedMatches(ctx.introducedLines('a.mjs'), hasGlyph).length, 1);
});

test('introducedLines: pairing charges exactly the surplus when one hunk edits one glyph line and adds another', () => {
  const ctx = buildContextFromFixture({
    message: 'x',
    files: [{ path: 'a.mjs' }],
    changes: [{
      path: 'a.mjs',
      removed: [`// see the loader ${EM} reads config`],
      added: [`// see the loader ${EM} reads the config file`, `completely unrelated ${EM} brand new line`],
    }],
  });
  const hit = introducedMatches(ctx.introducedLines('a.mjs'), hasGlyph);
  assert.equal(hit.length, 1);
  assert.match(hit[0].added, /brand new/);
});

test('introducedLines: a reorder inside a hunk is not an introduction', () => {
  const ctx = buildContextFromFixture({
    message: 'x',
    files: [{ path: 'a.mjs' }],
    changes: [{ path: 'a.mjs', removed: [`one ${EM} a`, 'two'], added: ['two', `one ${EM} a`] }],
  });
  assert.equal(introducedMatches(ctx.introducedLines('a.mjs'), hasGlyph).length, 0);
});

test('introducedLines: text moved to another file is not an introduction, a copy is', () => {
  const moved = buildContextFromFixture({
    message: 'x',
    files: [{ path: 'old.md' }, { path: 'new.md', status: 'A' }],
    changes: [
      { path: 'old.md', removed: [`kept ${EM} as written`, 'tail'] },
      { path: 'new.md', status: 'A', added: [`kept ${EM} as written`] },
    ],
  });
  assert.equal(introducedMatches(moved.introducedLines('new.md'), hasGlyph).length, 0);
  assert.equal(moved.introducedLines('new.md').pairs[0].moved, true);

  const copied = buildContextFromFixture({
    message: 'x',
    files: [{ path: 'old.md' }, { path: 'new.md', status: 'A' }],
    changes: [
      { path: 'old.md', removed: ['tail'] },
      { path: 'new.md', status: 'A', added: [`kept ${EM} as written`] },
    ],
  });
  assert.equal(introducedMatches(copied.introducedLines('new.md'), hasGlyph).length, 1);
});

test('introducedLines: one removed line credits one moved line, not two', () => {
  const ctx = buildContextFromFixture({
    message: 'x',
    files: [{ path: 'a.md' }, { path: 'b.md', status: 'A' }, { path: 'c.md', status: 'A' }],
    changes: [
      { path: 'a.md', removed: [`kept ${EM} as written`] },
      { path: 'b.md', status: 'A', added: [`kept ${EM} as written`] },
      { path: 'c.md', status: 'A', added: [`kept ${EM} as written`] },
    ],
  });
  const total = ['b.md', 'c.md'].reduce((n, p) => n + introducedMatches(ctx.introducedLines(p), hasGlyph).length, 0);
  assert.equal(total, 1);
});

test('introducedLines: a removed line consumed by an in-place edit does not also credit a copy elsewhere', () => {
  const ctx = buildContextFromFixture({
    message: 'x',
    files: [{ path: 'a.md' }, { path: 'b.md', status: 'A' }],
    changes: [
      { path: 'a.md', removed: [`rule text ${EM} v1`], added: [`rule text ${EM} v2`] },
      { path: 'b.md', status: 'A', added: [`rule text ${EM} v1`] },
    ],
  });
  assert.equal(introducedMatches(ctx.introducedLines('b.md'), hasGlyph).length, 1);
});

test('introducedLines: a path with no diff yields nothing, and the legacy addedLines shorthand still works', () => {
  const ctx = buildContextFromFixture({ message: 'x', files: [{ path: 'a.mjs' }], addedLines: { 'b.mjs': ['const b = 2;'] } });
  assert.deepEqual(ctx.introducedLines('a.mjs'), { added: [], pairs: [] });
  assert.deepEqual(ctx.introducedLines('b.mjs').added, ['const b = 2;']);
});

test('fixture status flows from the change when the file entry gives none, and files may be omitted', () => {
  const ctx = buildContextFromFixture({
    message: 'x',
    changes: [{ path: 'p/page.tsx', status: 'A', added: ['x'] }, { path: 'q.ts', removed: ['y'] }],
  });
  assert.deepEqual(ctx.stagedFiles.map((f) => [f.path, f.status]), [['p/page.tsx', 'A'], ['q.ts', 'M']]);
});

// ---------------------------------------------------------------------------
// Real git: one diff, correct statuses, rename and move handling, CRLF
// ---------------------------------------------------------------------------

function sh(dir, args) {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf-8' });
}

function repo(files) {
  const dir = mkdtempSync(join(tmpdir(), 'discipline-ctx-'));
  sh(dir, ['init', '-q']);
  sh(dir, ['config', 'user.email', 't@example.com']);
  sh(dir, ['config', 'user.name', 'T']);
  sh(dir, ['config', 'commit.gpgsign', 'false']);
  sh(dir, ['config', 'core.autocrlf', 'false']);
  put(dir, files);
  sh(dir, ['add', '-A']);
  sh(dir, ['commit', '-q', '-m', 'base']);
  return dir;
}

function put(dir, files) {
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), content);
  }
}

function stagedContext(dir) {
  const msg = join(dir, '.git', 'MSG');
  writeFileSync(msg, 'chore: test');
  const saved = process.env.DISCIPLINE_REPO_ROOT;
  process.env.DISCIPLINE_REPO_ROOT = dir;
  _clearRepoRootCache();
  try {
    return buildContextForProposedCommit({ messageFile: msg });
  } finally {
    if (saved === undefined) delete process.env.DISCIPLINE_REPO_ROOT; else process.env.DISCIPLINE_REPO_ROOT = saved;
    _clearRepoRootCache();
  }
}

const body = (n, tag) => Array.from({ length: n }, (_, i) => `line ${tag} number ${i} with enough words to match`).join('\n') + '\n';

test('real git: ONE unified diff is loaded per context, however many files and lookups', () => {
  const dir = repo({ 'a.txt': body(5, 'a'), 'b.txt': body(5, 'b'), 'c.txt': body(5, 'c') });
  try {
    put(dir, { 'a.txt': body(5, 'a') + 'extra\n', 'b.txt': body(5, 'b') + 'extra\n', 'c.txt': body(5, 'c') + 'extra\n' });
    sh(dir, ['add', '-A']);
    const before = _diffLoadCount();
    const ctx = stagedContext(dir);
    for (const p of ['a.txt', 'b.txt', 'c.txt', 'a.txt']) ctx.introducedLines(p);
    assert.equal(_diffLoadCount() - before, 1);
    assert.equal(ctx.stagedFiles.length, 3);
    assert.strictEqual(ctx.introducedLines('a.txt'), ctx.introducedLines('a.txt'), 'the view is cached, not recomputed');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('real git: statuses A, M, D and R, a pure rename adds no lines, a rename with an edit adds only the edit', () => {
  const dir = repo({
    'keep.txt': body(6, 'k'), 'gone.txt': body(6, 'g'), 'src/old name.txt': body(10, 'r'), 'src/old2.txt': body(10, 's'),
  });
  try {
    put(dir, { 'keep.txt': body(6, 'k') + `added ${EM} here\n`, 'fresh.txt': `fresh ${EM} file\n` });
    sh(dir, ['rm', '-q', 'gone.txt']);
    sh(dir, ['mv', 'src/old name.txt', 'src/new name.txt']);
    mkdirSync(join(dir, 'lib'));
    sh(dir, ['mv', 'src/old2.txt', 'lib/new2.txt']);
    put(dir, { 'lib/new2.txt': body(10, 's') + `edit ${EM} on a renamed file\n` });
    sh(dir, ['add', '-A']);
    const ctx = stagedContext(dir);
    const status = Object.fromEntries(ctx.stagedFiles.map((f) => [f.path, f.status]));
    assert.equal(status['keep.txt'], 'M');
    assert.equal(status['fresh.txt'], 'A');
    assert.equal(status['gone.txt'], 'D');
    assert.equal(status['src/new name.txt'], 'R');
    assert.equal(status['lib/new2.txt'], 'R');
    assert.equal(ctx.stagedFiles.find((f) => f.path === 'src/new name.txt').oldPath, 'src/old name.txt');
    assert.deepEqual(ctx.introducedLines('src/new name.txt').added, []);
    assert.deepEqual(ctx.introducedLines('lib/new2.txt').added, [`edit ${EM} on a renamed file`]);
    assert.equal(introducedMatches(ctx.introducedLines('keep.txt'), hasGlyph).length, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('real git: text moved into a new file and a pre-existing glyph line edited in place both pass, a new glyph line fails', () => {
  const dir = repo({
    'doc.md': `intro\nkept ${EM} as written\nold ${EM} wording\nend\n`,
  });
  try {
    put(dir, { 'doc.md': 'intro\nold ' + EM + ' wording, amended\nend\n', 'split/part.md': `kept ${EM} as written\nbrand new ${EM} line\n` });
    sh(dir, ['add', '-A']);
    const ctx = stagedContext(dir);
    assert.equal(introducedMatches(ctx.introducedLines('doc.md'), hasGlyph).length, 0, 'edited line already carried the glyph');
    const part = introducedMatches(ctx.introducedLines('split/part.md'), hasGlyph);
    assert.equal(part.length, 1);
    assert.match(part[0].added, /brand new/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('baseline: a fixture context says so, and a staged context with origin/master is diffed against the merge base in ONE diff', () => {
  assert.equal(buildContextFromFixture({ message: 'x' }).baseline.source, 'fixture');

  const dir = repo({ 'keep.txt': `kept ${EM} line\n` });
  try {
    sh(dir, ['update-ref', 'refs/remotes/origin/master', 'HEAD']);
    sh(dir, ['rm', '-q', 'keep.txt']);
    sh(dir, ['commit', '-q', '-m', 'delete']);
    put(dir, { 'keep.txt': `kept ${EM} line\n` });
    sh(dir, ['add', '-A']);
    const before = _diffLoadCount();
    const ctx = stagedContext(dir);
    assert.equal(_diffLoadCount() - before, 1);
    assert.equal(ctx.baseline.source, 'merge-base');
    assert.deepEqual(ctx.introducedLines('keep.txt').added, [], 'identical to master, so nothing is introduced');
    assert.equal(ctx.stagedFiles.length, 0, 'the restore is no change against the merge base');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('real git: CRLF content is stripped of the carriage return', () => {
  const dir = repo({ 'win.txt': 'one\r\ntwo\r\n' });
  try {
    put(dir, { 'win.txt': 'one\r\ntwo changed\r\n' });
    sh(dir, ['add', '-A']);
    const ctx = stagedContext(dir);
    assert.deepEqual(ctx.introducedLines('win.txt').added, ['two changed']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
