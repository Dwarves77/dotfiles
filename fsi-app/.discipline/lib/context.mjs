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
  return assemble({ commitMessage, stagedFiles, branchName, isMergeCommit: false, commitSha: null, diffSource: { type: 'staged' } });
}

// Build CheckContext for an existing commit (CI mode).
export function buildContextForExistingCommit({ commit }) {
  const commitMessage = git(['log', '-1', '--format=%B', commit]).trimEnd();
  const parents = git(['log', '-1', '--format=%P', commit]).trim().split(/\s+/).filter(Boolean);
  const isMergeCommit = parents.length > 1;
  const stagedFiles = parseNumstat(git(['show', '--format=', '--numstat', commit]));
  const branchName = currentBranch();
  return assemble({ commitMessage, stagedFiles, branchName, isMergeCommit, commitSha: commit, diffSource: { type: 'commit', sha: commit } });
}

// Build CheckContext for an ENTIRE commit range as ONE cumulative diff (squash-merge parity).
//
// WHY THIS EXISTS (lane MASTER-022, 2026-09-26, [CONFIRMED] by direct reproduction). PR #800's
// pull_request check ran --range=origin/master..<head> through the ORIGINAL --range code path,
// which lists every commit in the range (`git log --format=%H`) and runs each commit through
// buildContextForExistingCommit ALONE, unioning the "added lines" each commit's own isolated diff
// reports. That check was green. The push-to-master check on the resulting squash commit ran
// buildContextForExistingCommit on the ONE squash commit (squash vs the real master parent) and
// failed rule 022 on the added em-dash glyph line in `fsi-app/src/components/ui/Absence.tsx`
// (spelled out in words here, never as the literal character, per the same rule this comment
// is about).
//
// Root cause is NOT a wrong range or a stale base ref: reproduced with `git diff --no-index` on
// the three real file snapshots (fork-point, an interior PARITY-PARTS commit, the branch tip) with
// NO commits and NO range mismatch involved. diff(base, c1) and diff(c1, c2) each report ZERO
// added lines containing the glyph; diff(base, c2) -- the SAME net change, computed as one pass --
// reports ONE. This is a general property of text diffing, not a bug specific to this file: when a
// literal value (here, the em-dash placeholder) occurs MORE THAN ONCE in a file, git's diff/Myers-
// LCS algorithm is free to pair a "kept" occurrence with a DIFFERENT surviving line depending on
// how much surrounding text the single diff invocation sees. A per-commit walk sees the small
// two-line neighbourhood of each individual change; the whole-range diff sees the full accumulated
// change at once and is free to choose a different, equally minimal pairing -- one that "spends"
// the first occurrence on an unrelated hunk and reports the second occurrence as newly added. Two
// isolated correct diffs do not compose into the one true diff of the net change; only computing
// that one diff directly does. A squash commit IS that one diff (squash tree vs the pre-merge
// master tip), so it will always agree with a whole-range diff computed the same way and can
// disagree with a per-commit union computed the other way.
//
// THE FIX: for CONTENT rules that read ctx.getAddedLines() (022 today; any future rule with the
// same shape), the range must ALSO be checked as one cumulative diff -- base..head as a single
// `git diff`, not `git log` + N invocations of `git show` -- so the PR path sees exactly the diff
// the squash merge will actually land. This context is ADDITIVE: the existing per-commit walk in
// runner.mjs is UNCHANGED (commit-message rules, revert/merge-commit trigger gates, and anything
// that legitimately wants per-commit granularity keep working exactly as before); this is a second,
// independent pass the range mode also runs.
//
// `range` is passed through verbatim to `git diff` (whatever two-dot or three-dot form the caller
// already resolved, e.g. `origin/master..HEAD`); `git diff A..B` is a direct two-tree comparison
// (not a merge-base-relative one), so this mirrors `git diff` semantics exactly, with no change to
// how the caller computes the range string.
export function buildContextForRange({ range }) {
  const headRef = range.includes('...') ? range.split('...').pop() : range.split('..').pop();
  const commitMessage = git(['log', '-1', '--format=%B', headRef]).trimEnd();
  const stagedFiles = parseNumstat(git(['diff', '--numstat', range]));
  const branchName = currentBranch();
  return assemble({
    commitMessage,
    stagedFiles,
    branchName,
    isMergeCommit: false, // a squash commit always has exactly one parent; mirror that here
    commitSha: null,
    diffSource: { type: 'range', range },
  });
}

// Build CheckContext from in-memory inputs (test fixtures).
// Optional `fileContents`: { path: contentString } map. Rules that call
// ctx.getFileContent(path) return injected content; absent paths return null.
// Optional `addedLines`: { path: [lineText, ...] } map, the lines a rule should treat as ADDED by
// this commit (as opposed to unchanged/context lines already present before it). Rules that call
// ctx.getAddedLines(path) return the injected array; absent paths return [] (fixture mode never
// falls back to a real git diff, same "no injection, no data" posture as getFileContent).
export function buildContextFromFixture({ message, files, branch = 'master', isMergeCommit = false, fileContents = null, addedLines = null }) {
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
    addedLines,
    diffSource: { type: 'fixture' },
  });
}

function assemble({ commitMessage, stagedFiles, branchName, isMergeCommit, commitSha, isFixture = false, fileContents = null, addedLines = null, diffSource = null }) {
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
    _addedLines: addedLines,
    _diffSource: diffSource,
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

  // Return the text of every line ADDED to `path` by this commit (or by the currently staged
  // change), as an array of strings (the `+` marker stripped, `+++`/`---` file headers excluded).
  // Deletions and unchanged/context lines are never included; a rule reading "added lines" must
  // not flag content that was already there before this commit. Resolution order mirrors
  // getFileContent: an injected fixture entry wins; fixture mode with no injection returns [];
  // real modes shell out to `git diff`/`git show` scoped to this ctx's own commit or staged state.
  ctx.getAddedLines = (path) => {
    if (ctx._addedLines && Object.prototype.hasOwnProperty.call(ctx._addedLines, path)) {
      return ctx._addedLines[path];
    }
    if (ctx.isFixture) return [];
    let patch = '';
    try {
      if (ctx._diffSource?.type === 'staged') {
        patch = git(['diff', '--cached', '-U0', '--', path]);
      } else if (ctx._diffSource?.type === 'commit') {
        patch = git(['show', '--format=', '-U0', ctx._diffSource.sha, '--', path]);
      } else if (ctx._diffSource?.type === 'range') {
        // ONE cumulative diff over the whole range, matching what a squash merge will actually
        // land -- see buildContextForRange's header for why this must be separate from a
        // per-commit union.
        patch = git(['diff', '-U0', ctx._diffSource.range, '--', path]);
      }
    } catch {
      patch = '';
    }
    return parseAddedLineTexts(patch);
  };

  return ctx;
}

// Parse a unified diff (as produced by `git diff -U0` / `git show -U0`, scoped to one path) into the
// text of every ADDED line, in order. `+++`/`---` file-header lines are excluded (they also start with
// the diff markers but name paths, not content); a genuine added-content line beginning with a literal
// '+++'/'---' is the one case this cannot distinguish from a header. Accepted, same class of edge case
// numstat-based rules already live with.
export function parseAddedLineTexts(diffText) {
  const out = [];
  for (const raw of String(diffText ?? '').split(/\r?\n/)) {
    if (raw.startsWith('+++') || raw.startsWith('---')) continue;
    if (raw.startsWith('+')) out.push(raw.slice(1));
  }
  return out;
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
