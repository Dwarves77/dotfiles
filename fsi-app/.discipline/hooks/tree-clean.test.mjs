// Proof for hooks/lib/tree-clean.sh (lane TESTFIX-1, 2026-10-08; CLAUDE.md rule 15: a guard is proven by
// attack, not by presence). The check is the tail of both test-suite runners: it fails the suite when a
// test leaves a file in, or modifies a tracked file of, the working tree. Every case builds a throwaway git
// repository under the OS temp directory; the real working tree is never written.
//
// Run: node --test fsi-app/.discipline/hooks/tree-clean.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, unlinkSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CHECK = resolve(HERE, 'lib', 'tree-clean.sh');
const NO_NPM_RUNNER = resolve(HERE, '..', 'run-test-suite.sh');
const NPM_RUNNER = resolve(HERE, 'lib', 'run-npmtest-suites.sh');

function git(dir, args) {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function put(dir, rel, content) {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), content);
}

// A repository with one tracked file and a .gitignore, committed.
function newRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'tree-clean-'));
  put(dir, 'tracked.txt', 'tracked\n');
  put(dir, '.gitignore', 'ignored/\n');
  git(dir, ['init', '-q']);
  git(dir, ['add', '-A']);
  // Identity and settings by -c, three process spawns for the whole repository instead of seven.
  git(dir, ['-c', 'user.email=t@example.com', '-c', 'user.name=T', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', 'commit', '-q', '-m', 'base']);
  return dir;
}

function check(dir, cmd, snap) {
  const r = spawnSync('sh', [CHECK, cmd, snap], { cwd: dir, encoding: 'utf-8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

// snapshot, run `leave(dir)` (the stand-in for a suite), verify.
function around(dir, leave) {
  const snapDir = mkdtempSync(join(tmpdir(), 'tree-clean-snap-'));
  const snap = join(snapDir, 'status.txt');
  try {
    assert.equal(check(dir, 'snapshot', snap).code, 0, 'snapshot succeeds');
    leave(dir);
    return check(dir, 'verify', snap);
  } finally {
    rmSync(snapDir, { recursive: true, force: true });
  }
}

test('a suite that leaves the tree as it found it passes', () => {
  const dir = newRepo();
  try {
    const r = around(dir, () => {});
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /tree-clean: OK/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('ATTACK: a suite that leaves an untracked file in the tree fails, naming the path', () => {
  const dir = newRepo();
  try {
    const r = around(dir, (d) => put(d, 'docs/stray-fixture.md', '# stray\n'));
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /tree-clean: FAIL/);
    assert.match(r.out, /docs\/stray-fixture\.md/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('ATTACK: a file left inside a new directory is named as a file, not as its directory', () => {
  const dir = newRepo();
  try {
    const r = around(dir, (d) => put(d, 'fsi-app/src/lib/agent/leftover.ts', 'export const a = 1;\n'));
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /fsi-app\/src\/lib\/agent\/leftover\.ts/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('ATTACK: a suite that modifies a tracked file fails, naming it', () => {
  const dir = newRepo();
  try {
    const r = around(dir, (d) => put(d, 'tracked.txt', 'edited by a test\n'));
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /tracked\.txt/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('ATTACK: a suite that deletes a tracked file fails, naming it', () => {
  const dir = newRepo();
  try {
    const r = around(dir, (d) => unlinkSync(join(d, 'tracked.txt')));
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /tracked\.txt/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('every leftover is named, not only the first', () => {
  const dir = newRepo();
  try {
    const r = around(dir, (d) => { put(d, 'a.txt', 'a\n'); put(d, 'b/c.txt', 'c\n'); put(d, 'tracked.txt', 'changed\n'); });
    assert.equal(r.code, 1, r.out);
    for (const p of ['a.txt', 'b/c.txt', 'tracked.txt']) assert.ok(r.out.includes(p), `${p} named in:\n${r.out}`);
    assert.match(r.out, /changed 3 path\(s\)/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a file the suite created and then removed leaves the tree clean', () => {
  const dir = newRepo();
  try {
    const r = around(dir, (d) => { put(d, 'scratch.txt', 'x\n'); unlinkSync(join(d, 'scratch.txt')); });
    assert.equal(r.code, 0, r.out);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a tracked file the suite edited and then restored byte for byte leaves the tree clean', () => {
  const dir = newRepo();
  try {
    const r = around(dir, (d) => { put(d, 'tracked.txt', 'temporarily different\n'); put(d, 'tracked.txt', 'tracked\n'); });
    assert.equal(r.code, 0, r.out);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('work in progress that was already in the tree when the suite started is tolerated (the comparison is relative)', () => {
  const dir = newRepo();
  try {
    put(dir, 'tracked.txt', 'a developer edit, before the suite\n');
    put(dir, 'notes/wip.md', 'half written\n');
    const r = around(dir, () => {});
    assert.equal(r.code, 0, r.out);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a NEW file is still caught when the tree was already dirty at the start', () => {
  const dir = newRepo();
  try {
    put(dir, 'notes/wip.md', 'half written\n');
    const r = around(dir, (d) => put(d, 'notes/leaked.md', 'leaked\n'));
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /notes\/leaked\.md/);
    assert.ok(!r.out.includes('wip.md'), 'the pre-existing file is not charged');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a gitignored path is out of scope (scratch and logs cannot reach a commit)', () => {
  const dir = newRepo();
  try {
    const r = around(dir, (d) => put(d, 'ignored/scratch.log', 'log\n'));
    assert.equal(r.code, 0, r.out);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('it works from a subdirectory of the repository (the runners cd to the top level, the check must not care)', () => {
  const dir = newRepo();
  const snapDir = mkdtempSync(join(tmpdir(), 'tree-clean-snap-'));
  const snap = join(snapDir, 'status.txt');
  try {
    put(dir, 'sub/deep/x.txt', 'x\n');
    git(dir, ['add', '-A']);
    git(dir, ['-c', 'user.email=t@example.com', '-c', 'user.name=T', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'sub']);
    const sub = join(dir, 'sub', 'deep');
    assert.equal(check(sub, 'snapshot', snap).code, 0);
    put(dir, 'top-level-leak.txt', 'leak\n');
    const r = check(sub, 'verify', snap);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /top-level-leak\.txt/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(snapDir, { recursive: true, force: true });
  }
});

test('usage errors exit 2: no command, an unknown command, a missing snapshot, outside a repository', () => {
  const dir = newRepo();
  const plain = mkdtempSync(join(tmpdir(), 'tree-clean-plain-'));
  try {
    const none = spawnSync('sh', [CHECK], { cwd: dir, encoding: 'utf-8' });
    assert.equal(none.status, 2);
    assert.equal(check(dir, 'bogus', join(dir, 'x')).code, 2);
    const missing = check(dir, 'verify', join(tmpdir(), 'tree-clean-no-such-snapshot.txt'));
    assert.equal(missing.code, 2, missing.out);
    assert.match(missing.out, /no snapshot/);
    const outside = check(plain, 'snapshot', join(plain, 'snap.txt'));
    assert.equal(outside.code, 2, outside.out);
    assert.match(outside.out, /not inside a git working tree/);
    assert.equal(existsSync(join(plain, 'snap.txt')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(plain, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// The wiring: both runners call the check, and neither lets a red suite or the check's own verdict vanish.
// Executing a runner end to end runs the whole suite (minutes), so the wiring is asserted on the source
// the CI job and the pre-push gate execute; the check itself is exercised for real above.
// ---------------------------------------------------------------------------

for (const [name, path] of [['run-test-suite.sh', NO_NPM_RUNNER], ['run-npmtest-suites.sh', NPM_RUNNER]]) {
  test(`${name} snapshots the tree before the tests and verifies it after, and a tree failure is the exit status`, () => {
    const src = readFileSync(path, 'utf-8');
    const lines = src.split('\n').filter((l) => !l.trimStart().startsWith('#'));
    const code = lines.join('\n');
    const snapAt = code.indexOf('snapshot "$TREE_SNAPSHOT"');
    const runAt = code.indexOf('run-explicit-tests.mjs');
    const verifyAt = code.indexOf('verify "$TREE_SNAPSHOT"');
    assert.ok(snapAt >= 0, 'the tree is snapshotted');
    assert.ok(runAt > snapAt, 'the snapshot is taken before the tests run');
    assert.ok(verifyAt > runAt, 'the verdict is taken after the tests run');
    assert.match(code, /exit "\$TREE_STATUS"/, 'a changed tree is the exit status of the runner');
    assert.match(code, /\|\| SUITE_STATUS=\$\?/, 'a red suite is carried to the end, not lost to set -e before the verdict');
    assert.match(code, /exit "\$SUITE_STATUS"/, 'a red suite is still the exit status');
  });
}
