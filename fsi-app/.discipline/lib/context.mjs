// CheckContext builder. Two main entry points:
//   buildContextFromGit({ mode, commitOrRange, messageFile }) — reads git state
//   buildContextFromFixture({ message, files }) — constructs in-memory for tests

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { filesMatching as filesMatchingHelper, hasFileMatching as hasFileMatchingHelper } from './predicates.mjs';

// Resolve repo root lazily and cache. Uses git rev-parse --show-toplevel so
// the engine works wherever the repo lives (operator's Windows tree, CI's
// Linux checkout, a worktree). Falls back to cwd if git is unavailable.
let _repoRootCache = null;
export function getRepoRoot() {
  if (_repoRootCache !== null) return _repoRootCache;
  try {
    _repoRootCache = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf-8' }).trim();
  } catch {
    _repoRootCache = process.cwd();
  }
  return _repoRootCache;
}

function git(args, options = {}) {
  return execFileSync('git', ['-C', getRepoRoot(), ...args], {
    encoding: 'utf-8',
    ...options,
  });
}

// Build CheckContext for a proposed commit (commit-msg hook).
// At commit-msg time, staged files reflect what's about to be committed,
// and the commit message is in the file at messageFile.
export function buildContextForProposedCommit({ messageFile }) {
  const commitMessage = readFileSync(messageFile, 'utf-8').replace(/^#.*$/gm, '').trim();
  const stagedFiles = parseNumstat(git(['diff', '--cached', '--numstat']));
  const branchName = currentBranch();
  return assemble({ commitMessage, stagedFiles, branchName, isMergeCommit: false });
}

// Build CheckContext for an existing commit (CI mode).
export function buildContextForExistingCommit({ commit }) {
  const commitMessage = git(['log', '-1', '--format=%B', commit]).trimEnd();
  const parents = git(['log', '-1', '--format=%P', commit]).trim().split(/\s+/).filter(Boolean);
  const isMergeCommit = parents.length > 1;
  const stagedFiles = parseNumstat(git(['show', '--format=', '--numstat', commit]));
  const branchName = currentBranch();
  return assemble({ commitMessage, stagedFiles, branchName, isMergeCommit });
}

// Build CheckContext from in-memory inputs (test fixtures).
export function buildContextFromFixture({ message, files, branch = 'master', isMergeCommit = false }) {
  const stagedFiles = files.map((f) => ({
    path: f.path,
    status: f.status || 'M',
    additions: f.additions ?? 0,
    deletions: f.deletions ?? 0,
  }));
  return assemble({
    commitMessage: message,
    stagedFiles,
    branchName: branch,
    isMergeCommit,
  });
}

function assemble({ commitMessage, stagedFiles, branchName, isMergeCommit }) {
  const lines = commitMessage.split(/\r?\n/);
  const commitSubject = lines[0] || '';
  const blankIdx = lines.findIndex((line, i) => i > 0 && line.trim() === '');
  const commitBody = blankIdx === -1 ? '' : lines.slice(blankIdx + 1).join('\n');
  const isRevertCommit = /^Revert /.test(commitSubject);
  const totalFilesChanged = stagedFiles.length;
  const totalAdditions = stagedFiles.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = stagedFiles.reduce((sum, f) => sum + f.deletions, 0);
  const isOnMaster = branchName === 'master' || branchName === 'main';

  const ctx = {
    commitMessage,
    commitSubject,
    commitBody,
    isMergeCommit,
    isRevertCommit,
    stagedFiles,
    totalFilesChanged,
    totalAdditions,
    totalDeletions,
    branchName,
    isOnMaster,
  };

  // Helpers bound to this context
  ctx.filesMatching = (pattern) => filesMatchingHelper(ctx, pattern);
  ctx.hasFileMatching = (pattern) => hasFileMatchingHelper(ctx, pattern);

  return ctx;
}

function parseNumstat(output) {
  if (!output.trim()) return [];
  return output.trim().split(/\r?\n/).map((line) => {
    const parts = line.split('\t');
    if (parts.length < 3) return null;
    const [addsRaw, delsRaw, ...pathParts] = parts;
    const path = pathParts.join('\t');
    const additions = addsRaw === '-' ? 0 : Number.parseInt(addsRaw, 10) || 0;
    const deletions = delsRaw === '-' ? 0 : Number.parseInt(delsRaw, 10) || 0;
    return { path, status: 'M', additions, deletions };
  }).filter(Boolean);
}

function currentBranch() {
  try {
    const name = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
    if (name === 'HEAD') return null;
    return name;
  } catch {
    return null;
  }
}
