// change-range.mjs: ONE home for "what changed in this range" (lane N0, plan
// docs/plans/complete-system-build-plan-2026-09-04.md section 6.8, Rule C).
//
// THE PROBLEM [CONFIRMED, read from both files before this change]: memory-gate.mjs and
// F45-duplicate-code.mjs each derived a range and a changed-file list privately, with two separate
// git-plumbing copies (memory-gate.mjs's own `git()`/`gitChangedFiles()`/`gitDiffLinesForPath()`; F45's
// own `changedFiles()`). Section 6.8 names this a hotspot for merge-train stops and a duplication class
// F45 itself would otherwise flag. This module is the single derivation both callers move onto.
//
// AMENDMENT 1 ITEM 4 (operator, 2026-09-19): the memory gate's git calls must not depend on the caller's
// process working directory. Before this fix, running `node .discipline/governance/memory-gate.mjs
// --range=...` from inside fsi-app/ passed a repo-relative pathspec (e.g.
// `docs/ops/session-log.d/2026-09-19-n0.md`) to `git diff <range> -- <path>` with the git process's own
// cwd set to fsi-app/ -- git resolves a pathspec relative to the process cwd it was spawned with, so the
// path was looked up as `fsi-app/docs/ops/session-log.d/...`, which does not exist, and the UX-compliance
// diff came back empty (docs/ops/HANDOFF-2026-09-19-addendum.md section 2, the false refusal of lane
// W10-A). THE FIX here: every git call in this module resolves its own "repository top level" first (via
// `git rev-parse --show-toplevel` run from a start directory), then spawns the real git command with that
// resolved top level as its cwd -- never the raw start directory, and never `process.cwd()` read directly
// inside a git call. The start directory itself defaults to this module's own file location (a path that
// is always inside the repo, wherever the caller's process happened to be launched from), never to
// `process.cwd()`. A caller MAY still pass an explicit `cwd` (tests point it at a throwaway fixture
// repo); whatever is passed is itself resolved to ITS OWN top level the same way, so a subdirectory of a
// tree and that tree's root always resolve to the identical answer -- the same mechanism that fixes the
// production bug is what change-range.test.mjs exercises directly.
//
// node: builtins only (loaded by the no-npm discipline test glob, fsi-app/.discipline/lib/*.test.mjs).

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const MAX_BUFFER = 1 << 26; // 64 MiB, matches the other git callers in this tree (memory-gate.mjs, glob.mjs)

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// ONE private git helper. Every exported git* function and resolveRange's own merge-base probe go
// through this. Argument array only (never a shell string); cwd is always a resolved repository top
// level, never a raw directory and never process.cwd() read here.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

const topLevelCache = new Map();

/** Resolve the git repository top level reachable from `startDir` (defaults to this module's own
 *  directory, never process.cwd()). Memoized per start directory. Returns null when `startDir` is not
 *  inside a git working tree (never throws). */
function resolveTopLevel(startDir) {
  const anchor = startDir || MODULE_DIR;
  if (topLevelCache.has(anchor)) return topLevelCache.get(anchor);
  let root = null;
  try {
    const out = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: anchor,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (out) root = out;
  } catch {
    root = null;
  }
  topLevelCache.set(anchor, root);
  return root;
}

/** Run one git command. `cwd`, when given, is the anchor to resolve a top level from (a fixture repo's
 *  root or a subdirectory of it in tests); omitted, the anchor is this module's own directory. Either
 *  way the git process itself is spawned at the RESOLVED top level, never at the raw anchor. */
function runGit(args, { cwd } = {}) {
  const topLevel = resolveTopLevel(cwd);
  const spawnCwd = topLevel || cwd || MODULE_DIR;
  return execFileSync('git', args, { cwd: spawnCwd, encoding: 'utf8', maxBuffer: MAX_BUFFER });
}

function splitLines(text) {
  return String(text ?? '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

/** Split an explicit `a..b` / `a...b` range string into its endpoints. Pure. Returns null when the
 *  string carries neither delimiter (the caller still gets the raw string back as the range; base/head
 *  are simply unavailable). */
function parseRangeString(range) {
  const m = /^(.+?)(\.\.\.|\.\.)(.+)$/.exec(String(range || ''));
  if (!m) return null;
  return { base: m[1], head: m[3] };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// resolveRange
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Decide which range this gate run should use. Order: (a) an explicit range wins; (b) the CI PR shape
 * (`BASE_REF` + `PR_HEAD` both set) reproduces exactly what .github/workflows/discipline.yml's
 * pull_request branch builds today (`origin/${BASE_REF}...${PR_HEAD}`); (c) otherwise the local
 * merge-base against origin/master. Never throws: when the merge-base cannot be computed (no
 * origin/master reachable from the resolved top level), returns `source: 'unavailable'` with a `reason`.
 * @param {{ explicit?: string, env?: NodeJS.ProcessEnv, cwd?: string }} [opts]
 * @returns {{ range: string|null, base: string|null, head: string|null, source: string, reason?: string }}
 */
export function resolveRange({ explicit, env = process.env, cwd } = {}) {
  if (explicit) {
    const parsed = parseRangeString(explicit);
    return {
      range: explicit,
      base: parsed ? parsed.base : null,
      head: parsed ? parsed.head : null,
      source: 'explicit',
    };
  }

  const baseRef = String(env.BASE_REF || '').trim();
  const prHead = String(env.PR_HEAD || '').trim();
  if (baseRef && prHead) {
    const base = `origin/${baseRef}`;
    return { range: `${base}...${prHead}`, base, head: prHead, source: 'ci-pr' };
  }

  let mergeBase;
  try {
    mergeBase = runGit(['merge-base', 'origin/master', 'HEAD'], { cwd }).trim();
  } catch (e) {
    return { range: null, base: null, head: null, source: 'unavailable', reason: String(e.message || e) };
  }
  if (!mergeBase) {
    return {
      range: null,
      base: null,
      head: null,
      source: 'unavailable',
      reason: "git merge-base origin/master HEAD returned no output",
    };
  }
  return { range: `${mergeBase}..HEAD`, base: mergeBase, head: 'HEAD', source: 'local-merge-base' };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// git* : the git-backed readers every caller needs. Each accepts an optional `{ cwd }`.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

/** `git diff --name-only <range>`, repo-relative forward-slash paths. */
export function gitChangedFiles(range, { cwd } = {}) {
  let out;
  try {
    out = runGit(['diff', '--name-only', range], { cwd });
  } catch (e) {
    throw new Error(`change-range: 'git diff --name-only ${range}' failed: ${e.message}`);
  }
  return splitLines(out).map((f) => f.replace(/\\/g, '/'));
}

/** Only the paths ADDED in the range (`--diff-filter=A`). */
export function gitAddedFiles(range, { cwd } = {}) {
  let out;
  try {
    out = runGit(['diff', '--name-only', '--diff-filter=A', range], { cwd });
  } catch (e) {
    throw new Error(`change-range: 'git diff --name-only --diff-filter=A ${range}' failed: ${e.message}`);
  }
  return splitLines(out).map((f) => f.replace(/\\/g, '/'));
}

/** The diff text for ONE path over the range, as an array of lines. Never throws (a missing or
 *  unchanged path just yields no lines), matching the original single-path helper's behaviour. */
export function gitDiffLinesForPath(range, path, { cwd } = {}) {
  let out = '';
  try {
    out = runGit(['diff', range, '--', path], { cwd });
  } catch {
    out = '';
  }
  return String(out ?? '').split(/\r?\n/);
}

/** Paths from `git status --porcelain --untracked-files=all` (a lane's own uncommitted work), so a
 *  committed range can be widened to what is actually on disk right now. Never throws. */
export function gitWorkingTreeFiles({ cwd } = {}) {
  const out = new Set();
  let text = '';
  try {
    text = runGit(['status', '--porcelain', '--untracked-files=all'], { cwd });
  } catch {
    text = '';
  }
  for (const line of String(text ?? '').split(/\r?\n/)) {
    if (line.length > 3) out.add(line.slice(3).trim().replace(/\\/g, '/'));
  }
  return [...out];
}

/** The file's content at `base` (`git show <base>:<path>`), or null when the file does not exist there
 *  (including "added later in the range", the case N3/N4/N6 use this for). Never throws. */
export function gitFileAtBase(base, path, { cwd } = {}) {
  try {
    return runGit(['show', `${base}:${path}`], { cwd });
  } catch {
    return null;
  }
}
