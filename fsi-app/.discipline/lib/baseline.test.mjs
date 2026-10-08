// Tests for lib/baseline.mjs (lane GATE-5, 2026-10-08): the one function that decides what "introduced" is
// measured against. Real throwaway git repositories; origin/master is a remote-tracking ref made with
// `git update-ref`, so no remote and no network are involved.
// Run: node --test fsi-app/.discipline/lib/baseline.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { resolveBaseline } from './baseline.mjs';

function sh(dir, args) {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function newRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'discipline-baseline-'));
  sh(dir, ['init', '-q']);
  sh(dir, ['config', 'user.email', 't@example.com']);
  sh(dir, ['config', 'user.name', 'T']);
  sh(dir, ['config', 'commit.gpgsign', 'false']);
  sh(dir, ['config', 'core.autocrlf', 'false']);
  return dir;
}

function commit(dir, files, message) {
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), content);
  }
  sh(dir, ['add', '-A']);
  sh(dir, ['commit', '-q', '-m', message]);
  return sh(dir, ['rev-parse', 'HEAD']).trim();
}

const setOrigin = (dir, sha, name = 'master') => sh(dir, ['update-ref', `refs/remotes/origin/${name}`, sha]);
const gitAt = (dir) => (args, opts = {}) => execFileSync('git', args, { cwd: dir, encoding: 'utf-8', ...opts });
const baselineOf = (dir, opts) => resolveBaseline({ cwd: dir, git: gitAt(dir), env: {}, ...opts });

test('staged: the baseline is the merge base with origin/master, not the previous commit', () => {
  const dir = newRepo();
  try {
    const fork = commit(dir, { 'a.txt': 'a\n' }, 'fork point');
    setOrigin(dir, fork);
    commit(dir, { 'b.txt': 'b\n' }, 'branch one');
    commit(dir, { 'c.txt': 'c\n' }, 'branch two');
    const b = baselineOf(dir, { kind: 'staged' });
    assert.equal(b.source, 'merge-base');
    assert.equal(b.ref, fork, 'the fork point, two commits back');
    assert.match(b.label, /^merge base with origin\/master \([0-9a-f]{8}\)$/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('staged: when origin/master has moved on, the baseline is still where the branch forked', () => {
  const dir = newRepo();
  try {
    const fork = commit(dir, { 'a.txt': 'a\n' }, 'fork point');
    sh(dir, ['branch', 'lane']);
    const tip = commit(dir, { 'm.txt': 'master moved\n' }, 'master moves on');
    setOrigin(dir, tip);
    sh(dir, ['checkout', '-q', 'lane']);
    commit(dir, { 'b.txt': 'b\n' }, 'branch work');
    assert.equal(baselineOf(dir, { kind: 'staged' }).ref, fork);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('staged: BASE_REF names the integration branch the workflow resolved', () => {
  const dir = newRepo();
  try {
    const fork = commit(dir, { 'a.txt': 'a\n' }, 'fork point');
    setOrigin(dir, fork, 'release');
    commit(dir, { 'b.txt': 'b\n' }, 'branch work');
    const viaEnv = baselineOf(dir, { kind: 'staged', env: { BASE_REF: 'release' } });
    assert.equal(viaEnv.ref, fork);
    assert.match(viaEnv.label, /origin\/release/);
    const noMaster = baselineOf(dir, { kind: 'staged' });
    assert.equal(noMaster.source, 'fallback', 'no origin/master in this repo');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('FALLBACK staged: no origin/master names the previous-commit fallback and its reason', () => {
  const dir = newRepo();
  try {
    commit(dir, { 'a.txt': 'a\n' }, 'only commit');
    const b = baselineOf(dir, { kind: 'staged' });
    assert.deepEqual({ ref: b.ref, source: b.source }, { ref: null, source: 'fallback' });
    assert.equal(b.label, 'fallback previous commit (HEAD): origin/master does not resolve (no remote-tracking ref)');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('FALLBACK staged: an initial commit (HEAD does not resolve) falls back without throwing', () => {
  const dir = newRepo();
  try {
    const b = baselineOf(dir, { kind: 'staged' });
    assert.equal(b.source, 'fallback');
    assert.match(b.label, /HEAD does not resolve to a commit/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('FALLBACK staged: unrelated histories (no common ancestor) fall back with the reason', () => {
  const dir = newRepo();
  try {
    const other = commit(dir, { 'a.txt': 'a\n' }, 'other root');
    setOrigin(dir, other);
    sh(dir, ['checkout', '-q', '--orphan', 'unrelated']);
    sh(dir, ['rm', '-rfq', '.']);
    commit(dir, { 'z.txt': 'z\n' }, 'unrelated root');
    const b = baselineOf(dir, { kind: 'staged' });
    assert.equal(b.source, 'fallback');
    assert.match(b.label, /no merge base with origin\/master/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('commit: a branch commit is measured against the merge base, whichever commit of the branch it is', () => {
  const dir = newRepo();
  try {
    const fork = commit(dir, { 'a.txt': 'a\n' }, 'fork point');
    setOrigin(dir, fork);
    const one = commit(dir, { 'b.txt': 'b\n' }, 'branch one');
    const two = commit(dir, { 'c.txt': 'c\n' }, 'branch two');
    for (const sha of [one, two]) {
      const b = baselineOf(dir, { kind: 'commit', head: sha });
      assert.equal(b.source, 'merge-base');
      assert.equal(b.ref, fork);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('commit: BASE_REF drives the CI pull-request shape', () => {
  const dir = newRepo();
  try {
    const fork = commit(dir, { 'a.txt': 'a\n' }, 'fork point');
    setOrigin(dir, fork, 'develop');
    const head = commit(dir, { 'b.txt': 'b\n' }, 'pr head');
    const b = baselineOf(dir, { kind: 'commit', head, env: { BASE_REF: 'develop' } });
    assert.equal(b.ref, fork);
    assert.match(b.label, /origin\/develop/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('FALLBACK commit: a commit already on origin/master falls back to its parent (a merge base would be empty)', () => {
  const dir = newRepo();
  try {
    commit(dir, { 'a.txt': 'a\n' }, 'older');
    const tip = commit(dir, { 'b.txt': 'b\n' }, 'the squash commit');
    setOrigin(dir, tip);
    const b = baselineOf(dir, { kind: 'commit', head: tip });
    assert.deepEqual({ ref: b.ref, source: b.source }, { ref: null, source: 'fallback' });
    assert.equal(b.label, 'fallback parent commit: the commit is already on origin/master');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('FALLBACK commit: no origin/master (a push build with no remote-tracking ref) names the reason', () => {
  const dir = newRepo();
  try {
    const sha = commit(dir, { 'a.txt': 'a\n' }, 'only');
    const b = baselineOf(dir, { kind: 'commit', head: sha });
    assert.equal(b.source, 'fallback');
    assert.match(b.label, /^fallback parent commit: origin\/master does not resolve/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('FALLBACK commit: a sha that does not exist falls back without throwing', () => {
  const dir = newRepo();
  try {
    commit(dir, { 'a.txt': 'a\n' }, 'only');
    const b = baselineOf(dir, { kind: 'commit', head: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef' });
    assert.equal(b.source, 'fallback');
    assert.match(b.label, /does not resolve to a commit/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('RULE-MERGE-1 staged: a merge in progress (MERGE_HEAD) is measured against both parents, not the merge base', () => {
  const dir = newRepo();
  try {
    commit(dir, { 'a.txt': 'a\n' }, 'fork point');
    sh(dir, ['branch', '-M', 'master']);
    sh(dir, ['branch', 'lane']);
    const tip = commit(dir, { 'm.txt': 'master moved\n' }, 'master moves on');
    setOrigin(dir, tip);
    sh(dir, ['checkout', '-q', 'lane']);
    commit(dir, { 'b.txt': 'b\n' }, 'branch work');
    assert.equal(baselineOf(dir, { kind: 'staged' }).source, 'merge-base', 'no merge in progress yet');
    sh(dir, ['merge', '--no-commit', '--no-ff', 'master']);
    const b = baselineOf(dir, { kind: 'staged' });
    assert.deepEqual(b, { ref: 'HEAD+MERGE_HEAD', source: 'merge-parents', label: 'merge commit: lines in neither parent' });
    assert.equal(baselineOf(dir, { kind: 'commit', head: sh(dir, ['rev-parse', 'HEAD']).trim() }).source, 'merge-base', 'a commit context is untouched');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('RULE-MERGE-1 staged: a merge in progress is decided without origin/master (the merge case never needs a merge base)', () => {
  const dir = newRepo();
  try {
    commit(dir, { 'a.txt': 'a\n' }, 'fork point');
    sh(dir, ['branch', '-M', 'master']);
    sh(dir, ['branch', 'other']);
    commit(dir, { 'm.txt': 'm\n' }, 'master work');
    sh(dir, ['checkout', '-q', 'other']);
    commit(dir, { 'o.txt': 'o\n' }, 'other work');
    sh(dir, ['merge', '--no-commit', '--no-ff', 'master']);
    assert.equal(baselineOf(dir, { kind: 'staged' }).source, 'merge-parents');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
