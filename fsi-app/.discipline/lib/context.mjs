// CheckContext builder. Entry points:
//   buildContextForProposedCommit / buildContextForExistingCommit / buildContextForRange: read git state
//   buildContextFromFixture: constructs in-memory for tests
//
// ONE DIFF PER CONTEXT (lane GATE-1, 2026-10-08). Every context loads exactly one unified diff at
// construction (`git diff --cached -U0` for a proposed commit, `git show -U0 <sha>` for an existing
// commit, `git diff -U0 <range>` for a range) and derives everything from it: the staged-file list with
// per-file status (A/M/D/R), the added and removed lines, and the introduced-lines view the rules read.
// Before this lane the file list came from `git diff --numstat` and every content rule spawned one
// `git diff -- <path>` per staged file, twice (trigger and check), which measured 12.5 s at 77 staged files
// (docs/ops gate evaluation A, section 7). The cost is now one git process regardless of file count.
//
// THE BASELINE (lane GATE-5, 2026-10-08). The one diff is taken against the MERGE BASE with the integration
// branch, not against the previous commit, so "introduced" means "not present where this branch forked from
// master": a byte-identical restore of a master file, a revert of a deletion, and a block moved across two
// commits of one branch all introduce nothing. lib/baseline.mjs is the one function that decides it (with a
// named fallback to the previous commit when there is no merge base); every context carries the result as
// `ctx.baseline` ({ ref, source, label }), which the runner prints and writes to the firing log. A range
// context is already a merge-base diff (change-range.mjs's resolveRange) and reports its own range.
//
// INTRODUCED LINES, NOT PRESENT LINES. A rule that polices a text pattern must charge a commit only for
// what the commit introduces. `ctx.introducedLines(path)` returns { added, pairs }: `added` is every line
// the change adds to the path, and `pairs` has one entry per added line carrying the removed line it
// replaces in the same hunk (`removed`, or null), its line number in the new file (`line`), and `moved`
// (true when the identical text was removed somewhere else in the same diff, another hunk or another file,
// so the line was relocated rather than written). `introducedMatches(info, test)` keeps the pairs whose
// added line has the pattern and whose counterpart does not: an edited line that already carried the
// pattern passes, a moved line passes, a new line fails. Pairing inside a hunk is by exact text first
// (a reorder), then by token similarity, then by position, so a hunk that edits one glyph line and adds
// another charges exactly one line however git chose to align them.

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { resolveBaseline } from './baseline.mjs';

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

// ---------------------------------------------------------------------------
// The one diff
// ---------------------------------------------------------------------------

// Flags pinned so local, hook and CI produce the same text: no zero-context surprises from user config
// (diff.noprefix, diff.mnemonicPrefix, an external diff driver, a textconv filter, a non-default
// algorithm), rename detection on so a moved or renamed file is a rename and not a delete plus an add.
const DIFF_FLAGS = [
  '-U0', '-M', '--no-color', '--no-ext-diff', '--no-textconv',
  '--diff-algorithm=myers', '--src-prefix=a/', '--dst-prefix=b/',
];
// Node's default execFileSync buffer is 1 MiB; a large range diff exceeds it and the old per-file
// try/catch turned the overflow into an empty patch, which read as "nothing added". Raise the ceiling and
// let a real git failure surface as an engine error instead.
const DIFF_MAX_BUFFER = 512 * 1024 * 1024;

let diffLoads = 0;
/** Test-only: how many unified diffs this process has loaded from git. */
export function _diffLoadCount() { return diffLoads; }

// The baseline for a diff source (see the header). A range is already a merge-base diff.
function baselineFor(source, env) {
  const quietGit = (args, opts = {}) => git(args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  if (source.type === 'staged') return resolveBaseline({ kind: 'staged', env, cwd: getRepoRoot(), git: quietGit });
  if (source.type === 'commit') return resolveBaseline({ kind: 'commit', head: source.sha, env, cwd: getRepoRoot(), git: quietGit });
  return { ref: null, source: 'range', label: `range ${source.range}` };
}

function loadDiff(source, baseline) {
  diffLoads += 1;
  const head = ['-c', 'core.quotepath=false'];
  let args;
  if (source.type === 'staged') args = [...head, 'diff', '--cached', ...DIFF_FLAGS, ...(baseline.ref ? [baseline.ref] : [])];
  else if (source.type === 'commit') args = baseline.ref ? [...head, 'diff', ...DIFF_FLAGS, baseline.ref, source.sha] : [...head, 'show', '--format=', ...DIFF_FLAGS, source.sha];
  else args = [...head, 'diff', ...DIFF_FLAGS, source.range];
  return git(args, { maxBuffer: DIFF_MAX_BUFFER, stdio: ['ignore', 'pipe', 'pipe'] });
}

// Build CheckContext for a proposed commit (commit-msg hook).
// At commit-msg time, staged files reflect what's about to be committed,
// and the commit message is in the file at messageFile.
export function buildContextForProposedCommit({ messageFile, env = process.env }) {
  const commitMessage = readFileSync(messageFile, 'utf-8').replace(/^#.*$/gm, '').trim();
  const diffSource = { type: 'staged' };
  const baseline = baselineFor(diffSource, env);
  return assemble({ commitMessage, diffText: loadDiff(diffSource, baseline), isMergeCommit: false, commitSha: null, diffSource, baseline });
}

// Build CheckContext for an existing commit (CI mode).
export function buildContextForExistingCommit({ commit, env = process.env }) {
  const commitMessage = git(['log', '-1', '--format=%B', commit]).trimEnd();
  const parents = git(['log', '-1', '--format=%P', commit]).trim().split(/\s+/).filter(Boolean);
  const isMergeCommit = parents.length > 1;
  const diffSource = { type: 'commit', sha: commit };
  const baseline = baselineFor(diffSource, env);
  return assemble({ commitMessage, diffText: loadDiff(diffSource, baseline), isMergeCommit, commitSha: commit, diffSource, baseline });
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
// added lines containing the glyph; diff(base, c2), the SAME net change computed as one pass,
// reports ONE. This is a general property of text diffing, not a bug specific to this file: when a
// literal value (here, the em-dash placeholder) occurs MORE THAN ONCE in a file, git's diff/Myers-
// LCS algorithm is free to pair a "kept" occurrence with a DIFFERENT surviving line depending on
// how much surrounding text the single diff invocation sees. A per-commit walk sees the small
// two-line neighbourhood of each individual change; the whole-range diff sees the full accumulated
// change at once and is free to choose a different, equally minimal pairing. Two isolated correct
// diffs do not compose into the one true diff of the net change; only computing that one diff
// directly does. A squash commit IS that one diff (squash tree vs the pre-merge master tip), so it
// will always agree with a whole-range diff computed the same way and can disagree with a
// per-commit union computed the other way.
//
// THE FIX: for CONTENT rules the range must ALSO be checked as one cumulative diff, base..head as a
// single `git diff`, so the PR path sees exactly the diff the squash merge will actually land. This
// context is ADDITIVE: the per-commit walk in runner.mjs is unchanged; this is a second, independent
// pass the range mode also runs.
//
// `range` is passed through verbatim to `git diff` (whatever two-dot or three-dot form the caller
// already resolved, e.g. `origin/master..HEAD`).
export function buildContextForRange({ range }) {
  const headRef = range.includes('...') ? range.split('...').pop() : range.split('..').pop();
  const commitMessage = git(['log', '-1', '--format=%B', headRef]).trimEnd();
  const diffSource = { type: 'range', range };
  const baseline = baselineFor(diffSource);
  return assemble({
    commitMessage,
    diffText: loadDiff(diffSource, baseline),
    isMergeCommit: false, // a squash commit always has exactly one parent; mirror that here
    commitSha: null,
    diffSource,
    baseline,
  });
}

// Build CheckContext from in-memory inputs (test fixtures).
//   files:        [{ path, status?, additions?, deletions? }]  the staged-file list; may be omitted when
//                 `changes` is given, in which case it is derived from the changes
//   changes:      [{ path, status?, oldPath?, removed?, added?, oldStart?, newStart?, hunks? }]  the change
//                 as the unified diff would report it; `hunks` is [{ removed, added, oldStart, newStart }]
//                 for a multi-hunk file. Converted to unified-diff text and parsed by the SAME parser the
//                 real modes use, so a fixture exercises the production path.
//   diffText:     a raw unified diff, used instead of `changes`
//   addedLines:   { path: [line, ...] }  shorthand for a change that only adds lines
//   fileContents: { path: content }  what ctx.getFileContent(path) returns; absent paths return null
// With none of changes / diffText / addedLines, the context has no diff: introducedLines is empty for every
// path (fixture mode never falls back to real git, the same "no injection, no data" posture as
// getFileContent).
export function buildContextFromFixture({ message, files, isMergeCommit = false, fileContents = null, addedLines = null, changes = null, diffText = null }) {
  let text = diffText;
  if (text === null) {
    const list = [...(changes || [])];
    for (const [path, lines] of Object.entries(addedLines || {})) list.push({ path, added: lines });
    text = fixtureDiff(list);
  }
  const stagedFiles = files
    ? files.map((f) => ({ path: f.path, status: f.status || 'M', additions: f.additions ?? 0, deletions: f.deletions ?? 0 }))
    : null;
  return assemble({
    commitMessage: message,
    diffText: text,
    stagedFilesOverride: stagedFiles,
    isMergeCommit,
    commitSha: null,
    isFixture: true,
    fileContents,
    diffSource: { type: 'fixture' },
    baseline: { ref: null, source: 'fixture', label: 'fixture (in-memory diff)' },
  });
}

function assemble({ commitMessage, diffText, stagedFilesOverride = null, isMergeCommit, commitSha, isFixture = false, fileContents = null, diffSource = null, baseline }) {
  const lines = commitMessage.split(/\r?\n/);
  const commitSubject = lines[0] || '';
  const blankIdx = lines.findIndex((line, i) => i > 0 && line.trim() === '');
  const commitBody = blankIdx === -1 ? '' : lines.slice(blankIdx + 1).join('\n');
  const isRevertCommit = /^Revert /.test(commitSubject);

  const parsed = parseUnifiedDiff(diffText);
  const diffFiles = new Map(parsed.files.map((f) => [f.path, f]));
  const stagedFiles = stagedFilesOverride
    ? stagedFilesOverride.map((f) => ({ ...f, status: f.status !== 'M' ? f.status : (diffFiles.get(f.path)?.status ?? 'M'), oldPath: diffFiles.get(f.path)?.oldPath ?? null }))
    : parsed.files.map((f) => ({ path: f.path, oldPath: f.oldPath, status: f.status, additions: f.additions, deletions: f.deletions }));
  const totalFilesChanged = stagedFiles.length;
  const totalAdditions = stagedFiles.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = stagedFiles.reduce((sum, f) => sum + f.deletions, 0);

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
    commitSha,
    isFixture,
    baseline,
    _fileContents: fileContents,
    _diffSource: diffSource,
  };

  // Read file content for a staged path. Resolution order:
  //   1. injected fileContents map (test fixtures)
  //   2. fixture mode without injection -> null
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

  // The introduced-lines view (see the header). Computed once for the whole diff on first use.
  let introduced = null;
  ctx.introducedLines = (path) => {
    if (introduced === null) introduced = buildIntroduced(parsed);
    return introduced.get(path) || { added: [], pairs: [] };
  };

  return ctx;
}

// ---------------------------------------------------------------------------
// Unified diff parsing
// ---------------------------------------------------------------------------

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

function unquotePath(p) {
  let s = p.replace(/\t.*$/, ''); // git appends a TAB after a name that contains a space
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    s = s.slice(1, -1).replace(/\\(["\\tn])/g, (_, c) => (c === 't' ? '\t' : c === 'n' ? '\n' : c));
  }
  return s;
}

function stripPrefix(p) {
  if (p === '/dev/null') return p;
  return p.startsWith('a/') || p.startsWith('b/') ? p.slice(2) : p;
}

// `diff --git a/P b/P` for a path that did not change name: P recovered by length when it appears twice.
function headerPath(rest) {
  if (!rest.startsWith('a/')) return null;
  const n = (rest.length - 5) / 2;
  if (!Number.isInteger(n) || n < 1) return null;
  const left = rest.slice(2, 2 + n);
  const right = rest.slice(2 + n + 3);
  return rest.slice(2 + n, 2 + n + 3) === ' b/' && left === right ? left : null;
}

/** Parse a unified diff (git's `-U0` shape) into files: { path, oldPath, status, additions, deletions,
 *  hunks: [{ oldStart, newStart, removed: string[], added: string[] }] }. Status is A (new file), D
 *  (deleted), R (renamed, with or without edits) or M. A combined merge diff (`diff --cc`) is skipped. */
export function parseUnifiedDiff(diffText) {
  const files = [];
  let cur = null;
  let hunk = null;
  for (let raw of String(diffText ?? '').split('\n')) {
    if (raw.endsWith('\r')) raw = raw.slice(0, -1);
    if (raw.startsWith('diff --git ')) {
      cur = { path: null, oldPath: null, status: 'M', additions: 0, deletions: 0, hunks: [], _from: headerPath(raw.slice(11)), _minus: null, _plus: null };
      files.push(cur);
      hunk = null;
      continue;
    }
    if (raw.startsWith('diff --cc ') || raw.startsWith('diff --combined ')) { cur = null; hunk = null; continue; }
    if (!cur) continue;
    if (raw.startsWith('@@ ')) {
      const m = HUNK_RE.exec(raw);
      hunk = m ? { oldStart: Number(m[1]), newStart: Number(m[3]), removed: [], added: [] } : null;
      if (hunk) cur.hunks.push(hunk);
      continue;
    }
    if (hunk) {
      if (raw[0] === '+') { hunk.added.push(raw.slice(1)); cur.additions += 1; }
      else if (raw[0] === '-') { hunk.removed.push(raw.slice(1)); cur.deletions += 1; }
      continue; // a "\ No newline at end of file" marker or anything else inside a hunk is not content
    }
    if (raw.startsWith('new file mode')) cur.status = 'A';
    else if (raw.startsWith('deleted file mode')) cur.status = 'D';
    else if (raw.startsWith('rename from ')) { cur.status = 'R'; cur.oldPath = unquotePath(raw.slice(12)); }
    else if (raw.startsWith('rename to ')) cur.path = unquotePath(raw.slice(10));
    else if (raw.startsWith('--- ')) cur._minus = stripPrefix(unquotePath(raw.slice(4)));
    else if (raw.startsWith('+++ ')) cur._plus = stripPrefix(unquotePath(raw.slice(4)));
  }
  for (const f of files) {
    if (f.path === null) {
      if (f._plus && f._plus !== '/dev/null') f.path = f._plus;
      else if (f._minus && f._minus !== '/dev/null') f.path = f._minus;
      else f.path = f._from;
    }
    delete f._from; delete f._minus; delete f._plus;
  }
  return { files: files.filter((f) => f.path) };
}

// ---------------------------------------------------------------------------
// Introduced lines
// ---------------------------------------------------------------------------

const lineKey = (s) => s.trim().replace(/\s+/g, ' ');
const WORD_RE = /[A-Za-z0-9_]+/g;
// A hunk this large is paired by position after the exact-text pass; the similarity matrix would be
// quadratic and no human-edited hunk is that wide.
const SIMILARITY_CELL_LIMIT = 40000;

function similarity(a, b) {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  let total = 0;
  for (const [tok, n] of a) { const m = b.get(tok) || 0; inter += Math.min(n, m); total += Math.max(n, m); }
  for (const [tok, m] of b) if (!a.has(tok)) total += m;
  return total === 0 ? 0 : inter / total;
}

function tokenBag(line) {
  const bag = new Map();
  for (const t of line.match(WORD_RE) || []) bag.set(t, (bag.get(t) || 0) + 1);
  return bag;
}

// For each added line of a hunk, the index of the removed line it replaces, or null.
function pairHunk(hunk) {
  const R = hunk.removed;
  const A = hunk.added;
  const out = new Array(A.length).fill(null);
  if (R.length === 0 || A.length === 0) return out;
  const usedR = new Set();

  // 1. identical text (a reorder inside the hunk)
  const byKey = new Map();
  R.forEach((r, j) => { const k = lineKey(r); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(j); });
  A.forEach((a, i) => {
    const list = byKey.get(lineKey(a));
    if (list && list.length) { const j = list.shift(); out[i] = j; usedR.add(j); }
  });

  const restA = A.map((_, i) => i).filter((i) => out[i] === null);
  const restR = R.map((_, j) => j).filter((j) => !usedR.has(j));
  if (restA.length === 0 || restR.length === 0) return out;

  // 2. token similarity, best score first, ties broken by relative position
  if (restA.length * restR.length <= SIMILARITY_CELL_LIMIT) {
    const bagsA = restA.map((i) => tokenBag(A[i]));
    const bagsR = restR.map((j) => tokenBag(R[j]));
    const cells = [];
    restA.forEach((i, ai) => restR.forEach((j, rj) => {
      const s = similarity(bagsA[ai], bagsR[rj]);
      if (s > 0) cells.push({ i, j, s, d: Math.abs(ai / restA.length - rj / restR.length) });
    }));
    cells.sort((x, y) => y.s - x.s || x.d - y.d);
    for (const c of cells) {
      if (out[c.i] !== null || usedR.has(c.j)) continue;
      out[c.i] = c.j;
      usedR.add(c.j);
    }
  }

  // 3. whatever is left pairs by position: a rewritten line is still the line that replaced the old one
  const leftA = restA.filter((i) => out[i] === null);
  const leftR = restR.filter((j) => !usedR.has(j));
  for (let k = 0; k < Math.min(leftA.length, leftR.length); k++) out[leftA[k]] = leftR[k];
  return out;
}

function buildIntroduced(parsed) {
  const result = new Map();
  const pool = new Map(); // removed lines no hunk pairing consumed, by text: the source of "moved"
  for (const file of parsed.files) {
    const pairs = [];
    for (const hunk of file.hunks) {
      const idx = pairHunk(hunk);
      const consumed = new Set(idx.filter((j) => j !== null));
      hunk.removed.forEach((r, j) => {
        if (consumed.has(j)) return;
        const k = lineKey(r);
        if (k) pool.set(k, (pool.get(k) || 0) + 1);
      });
      hunk.added.forEach((a, i) => {
        pairs.push({ added: a, removed: idx[i] === null ? null : hunk.removed[idx[i]], line: hunk.newStart + i, moved: false });
      });
    }
    result.set(file.path, { added: pairs.map((p) => p.added), pairs });
  }
  // A line whose identical text was removed elsewhere in this diff was moved, not written.
  for (const info of result.values()) {
    for (const p of info.pairs) {
      const k = lineKey(p.added);
      if (!k || (p.removed !== null && lineKey(p.removed) === k)) continue;
      const n = pool.get(k) || 0;
      if (n > 0) { pool.set(k, n - 1); p.moved = true; }
    }
  }
  return result;
}

/** The pairs of `info` (from ctx.introducedLines) that INTRODUCE the pattern: the added line matches
 *  `test`, it was not relocated from elsewhere in the diff, and the removed line it replaces does not
 *  already match. `test` must be stateless (no global-flag regexes). */
export function introducedMatches(info, test) {
  return info.pairs.filter((p) => test(p.added) && !p.moved && !(p.removed !== null && test(p.removed)));
}

// ---------------------------------------------------------------------------
// Fixture diffs
// ---------------------------------------------------------------------------

function fixtureDiff(changes) {
  let text = '';
  for (const c of changes) {
    const status = c.status || 'M';
    const hunks = c.hunks || [{ removed: c.removed || [], added: c.added || [], oldStart: c.oldStart ?? 1, newStart: c.newStart ?? 1 }];
    text += `diff --git a/${c.oldPath || c.path} b/${c.path}\n`;
    if (status === 'A') text += 'new file mode 100644\n';
    if (status === 'D') text += 'deleted file mode 100644\n';
    if (status === 'R') text += `rename from ${c.oldPath}\nrename to ${c.path}\n`;
    if (hunks.some((h) => (h.removed || []).length + (h.added || []).length > 0) || status === 'A' || status === 'D') {
      text += `--- ${status === 'A' ? '/dev/null' : `a/${c.oldPath || c.path}`}\n+++ ${status === 'D' ? '/dev/null' : `b/${c.path}`}\n`;
    }
    for (const h of hunks) {
      const removed = h.removed || [];
      const added = h.added || [];
      if (removed.length + added.length === 0) continue;
      text += `@@ -${h.oldStart ?? 1},${removed.length} +${h.newStart ?? 1},${added.length} @@\n`;
      for (const r of removed) text += `-${r}\n`;
      for (const a of added) text += `+${a}\n`;
    }
  }
  return text;
}
