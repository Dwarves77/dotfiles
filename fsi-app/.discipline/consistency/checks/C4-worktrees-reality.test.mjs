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
