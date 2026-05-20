// CheckContext builder. Two main entry points:
//   buildContextFromGit({ mode, commitOrRange, messageFile }) — reads git state
//   buildContextFromFixture({ message, files }) — constructs in-memory for tests

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { filesMatching as filesMatchingHelper, hasFileMatching as hasFileMatchingHelper } from './predicates.mjs';

// Resolve repo root lazily and cache. Resolution order:
//   1. DISCIPLINE_REPO_ROOT environment variable (explicit operator override)
//   2. git rev-parse --show-toplevel (normal case: hook, CI, worktree)
//   3. Throw with a clear error message instructing the operator on the two fixes
//
// The engine is only meant to run inside a git context (commit-msg hook + CI).
// If invoked outside one (Docker without git, deployment artifact, manual test),
// failing loud is safer than silently falling back to process.cwd() which would
// cause confusing downstream errors when git operations resolve against the wrong root.
let _repoRootCache = null;

export function getRepoRoot() {
  if (_repoRootCache !== null) return _repoRootCache;

  const envOverride = process.env.DISCIPLINE_REPO_ROOT;
  if (envOverride && envOverride.trim()) {
    _repoRootCache = envOverride.trim();
    return _repoRootCache;
  }

  try {
    _repoRootCache = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    if (!_repoRootCache) throw new Error('git rev-parse --show-toplevel returned empty');
    return _repoRootCache;
  } catch (err) {
    _repoRootCache = null;
    throw new Error(
      'discipline engine: could not determine repo root. ' +
        'Run inside a git working tree, OR set DISCIPLINE_REPO_ROOT to an absolute path. ' +
        `Underlying cause: ${err.message || err}`
    );
  }
}

// Test-only: reset the memoized value so successive tests can exercise different code paths.
export function _clearRepoRootCache() {
  _repoRootCache = null;
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
  return assemble({ commitMessage, stagedFiles, branchName, isMergeCommit: false, commitSha: null });
}

// Build CheckContext for an existing commit (CI mode).
export function buildContextForExistingCommit({ commit }) {
  const commitMessage = git(['log', '-1', '--format=%B', commit]).trimEnd();
  const parents = git(['log', '-1', '--format=%P', commit]).trim().split(/\s+/).filter(Boolean);
  const isMergeCommit = parents.length > 1;
  const stagedFiles = parseNumstat(git(['show', '--format=', '--numstat', commit]));
  const branchName = currentBranch();
  return assemble({ commitMessage, stagedFiles, branchName, isMergeCommit, commitSha: commit });
}

// Build CheckContext from in-memory inputs (test fixtures).
// Optional `fileContents`: { path: contentString } map. Rules that call
// ctx.getFileContent(path) return injected content; absent paths return null.
export function buildContextFromFixture({ message, files, branch = 'master', isMergeCommit = false, fileContents = null }) {
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
    commitSha: null,
    isFixture: true,
    fileContents,
  });
}

function assemble({ commitMessage, stagedFiles, branchName, isMergeCommit, commitSha, isFixture = false, fileContents = null }) {
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
    commitSha,
    isFixture,
    _fileContents: fileContents,
  };

  // Helpers bound to this context
  ctx.filesMatching = (pattern) => filesMatchingHelper(ctx, pattern);
  ctx.hasFileMatching = (pattern) => hasFileMatchingHelper(ctx, pattern);

  // Read file content for a staged path. Resolution order:
  //   1. injected fileContents map (test fixtures)
  //   2. fixture mode without injection → null
  //   3. disk read (works for commit-msg pre-commit AND ci modes, since
  //      both reflect the file state on disk in the working tree)
  // Returns null on any failure or missing file.
  ctx.getFileContent = (path) => {
    if (ctx._fileContents && Object.prototype.hasOwnProperty.call(ctx._fileContents, path)) {
      return ctx._fileContents[path];
    }
    if (ctx.isFixture) return null;
    try {
      const abs = resolvePath(getRepoRoot(), path);
      if (existsSync(abs)) return readFileSync(abs, 'utf-8');
    } catch {
      // ignore
    }
    return null;
  };

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
