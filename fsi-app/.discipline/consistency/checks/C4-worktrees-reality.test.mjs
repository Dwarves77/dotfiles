// C4's ephemeral-worktree exemption, proved by ATTACK rather than by asserting the list exists
// (CLAUDE.md rule 15). Every case below is a path C4 must or must not skip; a future edit that
// narrows the predicate turns one of these red.
//
// Written at train 59's fold (2026-09-08), when C4 failed on `origin/master` inside the
// train-assembly container: eleven live lane worktrees under `/root/work/lanes/` — the very
// convention TRAIN-ASSEMBLY-RUNBOOK.md prescribes — were each reported as an untracked worktree.
// The predicate had no test at all, which is why the omission survived the convention's arrival.
//
// Run: node --test fsi-app/.discipline/consistency/checks/C4-worktrees-reality.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isEphemeralWorktreePath } from './C4-worktrees-reality.mjs';

// A synthetic root, never a real user's home: rule 012 (hardcoded-user-home-path) fails any literal
// `/home/<name>/` in the tree, and these paths are pure fixtures — the predicate only inspects path
// SEGMENTS, so the prefix carries no meaning to it.
const HOME = '/fixture-home/user';

test('the three ephemeral conventions are exempt, on POSIX and Windows separators alike', () => {
  for (const p of [
    `${HOME}/dotfiles/.worktrees/wt-build-7`,
    `${HOME}/dotfiles/.claude/worktrees/agent-abc123`,
    '/root/work/lanes/train59',
    '/root/work/lanes/comp-06',
    'C:\\fixture\\dotfiles\\.worktrees\\wt-linkedin',
  ]) {
    assert.equal(isEphemeralWorktreePath(p), true, `should be exempt: ${p}`);
  }
});

test('a tracked worktree is NOT exempted — the check still has teeth', () => {
  for (const p of [
    `${HOME}/dotfiles`,
    `${HOME}/dotfiles-wt-audit`,
    '/root/work/dotfiles',
    // near-misses: the segment must be a real path segment, not a substring of a name
    `${HOME}/my-worktrees-backup/thing`,
    `${HOME}/lanes/not-under-work`,
  ]) {
    assert.equal(isEphemeralWorktreePath(p), false, `should be tracked: ${p}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// GATE-2 (2026-10-08): a worktree OUTSIDE the repository path is a note, never drift. The worktree list is
// machine-global, so one scratch worktree anywhere on the machine used to fail pre-push step 2 for every
// lane (gate-evaluation-A section 4, H6). Proven against real `git worktree add` output, not only fixtures.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────
import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classifyLiveWorktrees, gitWorktreeList, isInsideRepoPath } from './C4-worktrees-reality.mjs';

test('isInsideRepoPath: the root and anything under it, case-insensitive, either separator; siblings and near-misses are outside', () => {
  const root = '/fixture-home/user/dotfiles';
  assert.equal(isInsideRepoPath(root, root), true);
  assert.equal(isInsideRepoPath(`${root}/scratch-wt`, root), true);
  assert.equal(isInsideRepoPath('C:\\Fixture\\Dotfiles\\scratch','c:/fixture/dotfiles'), true);
  assert.equal(isInsideRepoPath('/fixture-home/user/dotfiles-wt-audit', root), false);
  assert.equal(isInsideRepoPath('/fixture-home/user/dotfiles-other/x', root), false);
  assert.equal(isInsideRepoPath('/tmp/scratch', root), false);
});

test('classifyLiveWorktrees: outside the repo path is a note, inside and unlisted is drift, listed and ephemeral are silent', () => {
  const root = '/fixture-home/user/dotfiles';
  const r = classifyLiveWorktrees(
    [
      root, // the main checkout, listed as "dotfiles"
      `${root}/.claude/worktrees/lane-x`, // ephemeral convention
      '/fixture-home/user/scratch/check-wt', // outside the repo, unlisted
      `${root}/unlisted-inside`, // inside the repo, unlisted
      `${root}/listed-inside`, // inside the repo, listed
    ],
    root,
    new Set(['dotfiles', 'listed-inside']),
  );
  assert.equal(r.drifts.length, 1);
  assert.match(r.drifts[0].detail, /unlisted-inside/);
  assert.equal(r.notes.length, 1);
  assert.match(r.notes[0], /check-wt/);
  assert.match(r.notes[0], /not drift/);
});

test('a REAL git worktree at a temp path outside the repo yields no drift (a note only); one inside the repo is still drift', () => {
  const base = realpathSync.native(mkdtempSync(join(tmpdir(), 'c4-gate2-')));
  const repo = join(base, 'repo');
  const outside = join(base, 'scratch-outside');
  const inside = join(repo, 'scratch-inside');
  const git = (args, cwd = repo) => execFileSync('git', args, { cwd, encoding: 'utf8' });
  try {
    execFileSync('git', ['init', '-q', repo], { encoding: 'utf8' });
    git(['config', '--local', 'user.name', 'c4-test']);
    git(['config', '--local', 'user.email', 'c4-test@example.com']);
    writeFileSync(join(repo, 'f.txt'), 'x\n');
    git(['add', 'f.txt']);
    git(['commit', '-q', '-m', 'init']);
    git(['worktree', 'add', '-q', '-b', 'c4-outside', outside]);
    const root = git(['rev-parse', '--show-toplevel']).trim();

    const listed = new Set(['repo']);
    const first = classifyLiveWorktrees(gitWorktreeList(repo), root, listed);
    assert.deepEqual(first.drifts, [], 'the outside worktree must not be drift');
    assert.equal(first.notes.length, 1, 'the outside worktree is reported as a note');
    assert.match(first.notes[0], /scratch-outside/);

    git(['worktree', 'add', '-q', '-b', 'c4-inside', inside]);
    const second = classifyLiveWorktrees(gitWorktreeList(repo), root, listed);
    assert.equal(second.drifts.length, 1, 'an unlisted worktree inside the repo path is still drift');
    assert.match(second.drifts[0].detail, /scratch-inside/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

// ---- lane GATE-8 (2026-10-08): AUD-AT-4 B7-35, red then green ----
import { consistencyCheck } from './C4-worktrees-reality.mjs';

test('C4 B7-35: under CI the disk-to-inventory direction still runs, so an unlisted worktree inside the repository path is drift', () => {
  const root = '/fixture-home/user/dotfiles';
  const live = [root, `${root}/unlisted-inside`];
  const ci = consistencyCheck.run({ ci: true, liveWorktrees: live, repoRoot: root });
  assert.ok(Array.isArray(ci) && ci.length === 1, `CI mode must see the unlisted worktree: ${JSON.stringify(ci)}`);
  assert.match(ci[0].detail, /unlisted-inside/);
  const local = consistencyCheck.run({ ci: false, liveWorktrees: live, repoRoot: root });
  assert.ok(local.some((d) => /unlisted-inside/.test(d.detail)), 'locally it is drift too');
});

test('C4 B7-35: under CI the inventory-to-disk direction is skipped (a runner has none of the developer worktree directories)', () => {
  const root = '/fixture-home/user/dotfiles';
  const drifts = consistencyCheck.run({ ci: true, liveWorktrees: [root], repoRoot: root });
  assert.ok(!drifts.some((d) => /no matching directory exists/.test(d.detail)), JSON.stringify(drifts));
});
