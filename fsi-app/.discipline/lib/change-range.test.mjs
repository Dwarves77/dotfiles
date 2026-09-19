// RED-then-green proof for change-range.mjs (lane N0, plan section 6.8 Rule C; Amendment 1 item 4).
// Builds throwaway git repos under os.tmpdir() per test so the suite is hermetic and cannot drift from
// this checkout's own history. Every commit in a fixture repo sets identity with `git -c` flags scoped
// to that one command, or via `--local` config written inside the fixture's own .git/config -- never
// this repo's own config (the 2026-09-11 fixture-identity leak this rule guards against).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  resolveRange,
  gitChangedFiles,
  gitAddedFiles,
  gitDiffLinesForPath,
  gitWorkingTreeFiles,
  gitFileAtBase,
} from './change-range.mjs';

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// Fixture helpers
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'change-range-'));
  const git = (args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  git(['init', '-q']);
  git(['config', '--local', 'user.name', 'change-range-test']);
  git(['config', '--local', 'user.email', 'change-range-test@example.com']);
  return { dir, git };
}

function commit(git, message) {
  git(['commit', '-q', '-m', message]);
  return git(['rev-parse', 'HEAD']).trim();
}

test.afterEach(() => {}); // no shared state; each test cleans up its own dir in a finally block

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// resolveRange
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

test('resolveRange: an explicit range wins over everything else, ".." form', () => {
  const r = resolveRange({ explicit: 'abc123..def456', env: { BASE_REF: 'master', PR_HEAD: 'zzz' } });
  assert.deepEqual(r, { range: 'abc123..def456', base: 'abc123', head: 'def456', source: 'explicit' });
});

test('resolveRange: an explicit range wins, "..." form', () => {
  const r = resolveRange({ explicit: 'origin/master...HEAD' });
  assert.deepEqual(r, { range: 'origin/master...HEAD', base: 'origin/master', head: 'HEAD', source: 'explicit' });
});

test('resolveRange: the CI env shape (BASE_REF + PR_HEAD) builds origin/${BASE_REF}...${PR_HEAD}, ' +
  'matching .github/workflows/discipline.yml\'s pull_request RANGE build', () => {
  const r = resolveRange({ env: { BASE_REF: 'master', PR_HEAD: 'abc123def' } });
  assert.deepEqual(r, { range: 'origin/master...abc123def', base: 'origin/master', head: 'abc123def', source: 'ci-pr' });
});

test('resolveRange: BASE_REF without PR_HEAD does not trigger the ci-pr shape', () => {
  const r = resolveRange({ env: { BASE_REF: 'master', PR_HEAD: '' } });
  assert.notEqual(r.source, 'ci-pr');
});

test('resolveRange: local merge-base against origin/master when neither explicit nor CI env is given', () => {
  const { dir, git } = makeRepo();
  try {
    writeFileSync(join(dir, 'a.txt'), 'base\n');
    git(['add', 'a.txt']);
    const baseSha = commit(git, 'base');
    git(['update-ref', 'refs/remotes/origin/master', baseSha]);
    writeFileSync(join(dir, 'b.txt'), 'second\n');
    git(['add', 'b.txt']);
    const headSha = commit(git, 'second');

    const r = resolveRange({ env: {}, cwd: dir });
    assert.equal(r.source, 'local-merge-base');
    assert.equal(r.base, baseSha);
    assert.equal(r.head, 'HEAD');
    assert.equal(r.range, `${baseSha}..HEAD`);
    assert.equal(headSha.length, 40); // sanity: a real sha was produced
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('resolveRange: unavailable (no origin/master reachable) returns source "unavailable" and never throws', () => {
  const { dir, git } = makeRepo();
  try {
    writeFileSync(join(dir, 'a.txt'), 'only commit, no origin/master ref\n');
    git(['add', 'a.txt']);
    commit(git, 'solo');

    let r;
    assert.doesNotThrow(() => { r = resolveRange({ env: {}, cwd: dir }); });
    assert.equal(r.source, 'unavailable');
    assert.equal(r.range, null);
    assert.ok(typeof r.reason === 'string' && r.reason.length > 0, 'reason must be a non-empty string');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// gitAddedFiles / gitChangedFiles
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

test('gitAddedFiles: --diff-filter=A excludes a file that was only modified in the range', () => {
  const { dir, git } = makeRepo();
  try {
    writeFileSync(join(dir, 'modified.txt'), 'v1\n');
    writeFileSync(join(dir, 'untouched.txt'), 'stays\n');
    git(['add', 'modified.txt', 'untouched.txt']);
    const baseSha = commit(git, 'base');

    writeFileSync(join(dir, 'modified.txt'), 'v2\n');
    writeFileSync(join(dir, 'added.txt'), 'new\n');
    git(['add', 'modified.txt', 'added.txt']);
    commit(git, 'second');

    const range = `${baseSha}..HEAD`;
    const added = gitAddedFiles(range, { cwd: dir });
    const changed = gitChangedFiles(range, { cwd: dir });

    assert.deepEqual(added, ['added.txt']);
    assert.deepEqual(changed.sort(), ['added.txt', 'modified.txt']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('gitChangedFiles / gitAddedFiles: a path containing a space survives intact', () => {
  const { dir, git } = makeRepo();
  try {
    writeFileSync(join(dir, 'a.txt'), 'base\n');
    git(['add', 'a.txt']);
    const baseSha = commit(git, 'base');

    mkdirSync(join(dir, 'a dir with spaces'), { recursive: true });
    writeFileSync(join(dir, 'a dir with spaces', 'file name.txt'), 'content\n');
    git(['add', 'a dir with spaces/file name.txt']);
    commit(git, 'space path');

    const range = `${baseSha}..HEAD`;
    assert.deepEqual(gitAddedFiles(range, { cwd: dir }), ['a dir with spaces/file name.txt']);
    assert.deepEqual(gitChangedFiles(range, { cwd: dir }), ['a dir with spaces/file name.txt']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// gitFileAtBase
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

test('gitFileAtBase: returns the file content at base, and null for a file added later in the range', () => {
  const { dir, git } = makeRepo();
  try {
    writeFileSync(join(dir, 'existing.txt'), 'at base\n');
    git(['add', 'existing.txt']);
    const baseSha = commit(git, 'base');

    writeFileSync(join(dir, 'new.txt'), 'only in head\n');
    git(['add', 'new.txt']);
    commit(git, 'second');

    assert.equal(gitFileAtBase(baseSha, 'existing.txt', { cwd: dir }), 'at base\n');
    assert.equal(gitFileAtBase(baseSha, 'new.txt', { cwd: dir }), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// gitWorkingTreeFiles
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

test('gitWorkingTreeFiles: reports untracked and modified files from git status --porcelain', () => {
  const { dir, git } = makeRepo();
  try {
    writeFileSync(join(dir, 'tracked.txt'), 'v1\n');
    git(['add', 'tracked.txt']);
    commit(git, 'base');
    writeFileSync(join(dir, 'tracked.txt'), 'v2\n');
    writeFileSync(join(dir, 'scratch.txt'), 'untracked\n');

    const files = gitWorkingTreeFiles({ cwd: dir }).sort();
    assert.deepEqual(files, ['scratch.txt', 'tracked.txt']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// Amendment 1 item 4: git calls must not depend on the caller's process working directory. The real
// defect this guards [CONFIRMED, reproduced directly with git before this module existed]: from a
// subdirectory, `git diff <range> -- <path>` resolves the pathspec relative to that subdirectory, so a
// repo-relative path silently returns an EMPTY diff. Every function here takes an explicit `cwd`
// precisely so this property is testable without relying on this checkout's own live history.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

test('gitChangedFiles and gitDiffLinesForPath give the SAME result from a subdirectory as from the root ' +
  '(the real defect: a raw pathspec resolves relative to the spawn cwd, so a subdirectory used to see ' +
  'an empty diff for a repo-relative path)', () => {
  const { dir, git } = makeRepo();
  try {
    mkdirSync(join(dir, 'sub'), { recursive: true });
    mkdirSync(join(dir, 'docs', 'ops', 'session-log.d'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'ops', 'session-log.d', 'README.md'), 'base\n');
    git(['add', 'docs/ops/session-log.d/README.md']);
    const baseSha = commit(git, 'base');

    writeFileSync(join(dir, 'sub', 'x.txt'), 'some content\n');
    writeFileSync(
      join(dir, 'docs', 'ops', 'session-log.d', '2026-09-19-n0.md'),
      '## 2026-09-19, lane N0: demo\n### UX compliance (N0)\nNot a UI change; no customer surface touched by this branch.\n'
    );
    git(['add', 'sub/x.txt', 'docs/ops/session-log.d/2026-09-19-n0.md']);
    commit(git, 'add lane file');

    const range = `${baseSha}..HEAD`;
    const path = 'docs/ops/session-log.d/2026-09-19-n0.md';
    const subDir = join(dir, 'sub');

    const changedFromRoot = gitChangedFiles(range, { cwd: dir }).sort();
    const changedFromSub = gitChangedFiles(range, { cwd: subDir }).sort();
    assert.deepEqual(changedFromRoot, changedFromSub);
    assert.deepEqual(changedFromRoot, ['docs/ops/session-log.d/2026-09-19-n0.md', 'sub/x.txt']);

    const diffFromRoot = gitDiffLinesForPath(range, path, { cwd: dir });
    const diffFromSub = gitDiffLinesForPath(range, path, { cwd: subDir });
    assert.deepEqual(diffFromRoot, diffFromSub);
    assert.ok(
      diffFromSub.some((l) => l.startsWith('+') && l.includes('UX compliance')),
      'the diff from the subdirectory must contain the real UX compliance line, not come back empty'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
