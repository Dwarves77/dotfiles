// F45: duplicate-code (lane L30, 2026-09-17). The operator found, by chance and not from any gate, that
// the same EUR-Lex route had been written three times (the census exporter on 2026-09-02, the D25 capture
// step on 2026-09-13, lane L28 on 2026-09-17). A dependency-free clone scan of the tree then measured
// the class: 381 exact clone blocks, 7,716 duplicated lines across 236 source files (tests, fixtures,
// archive, run artifacts and snapshots excluded), the same route-handler boilerplate hand-mirrored across
// 26 admin API routes, 22 community routes and 10 workspace routes, seven community page shells, eight
// identical loading pages, a five-file family of detail surfaces, a ten-file family of admin views, nine
// maintenance scripts sharing one scaffold, and 77 places where a comment admits a constant was copied
// rather than imported. No number had ever said so, which is why a human caught it (operator, 2026-09-17:
// "Why is a human the one that caught this?"). remediation-discipline's two-homes rule was prose; this
// gate is the mechanism.
//
// WHAT IT MEASURES. Every source file in scope is normalized line by line (whitespace collapsed, blank
// and comment-only lines dropped, import lines dropped since identical import blocks are structure, not
// copied logic). Every window of WINDOW consecutive normalized lines is hashed; a window seen in more than
// one file, or more than once in one file, is a clone. The metric is the total number of duplicated
// normalized lines.
//
// THE RATCHET IS AGAINST THE MERGE-BASE, NEVER A STORED NUMBER (plan 6.8, Rule B, lane N4). The prior
// design stored a DUPLICATED_LINES_CEILING constant that the tree had to equal exactly; two lanes that
// each removed duplication both wrote a correct value and collided on the same line every time (Cause B,
// plan 6.8 section 6.8). Now: HEAD's duplicatedLines must be no worse than the SAME measurement taken on
// the merge-base tree with origin/master (measureAtBase(), read through one `git cat-file --batch` call,
// cached by commit id under gitignored scratch so a repeat check skips git entirely). Nothing is stored on
// disk that a lane could collide on; the comparison is always to the tree, at check time.
//
// NAMING THE CULPRIT. A regression message lists the clone pairs that touch files changed on the branch
// (against origin/master, plus the working tree's modified and untracked files) before the largest pairs
// in the tree, so a small new copy is named and not buried under the 100-window families that predate it
// (lane L31's attack proof found the first message naming only the largest pairs).
//
// SCOPE. fsi-app/src/** and fsi-app/scripts/** (.mjs/.js/.ts/.tsx), minus tests and proofs (they may
// legitimately repeat fixtures), fixtures/, _archive/ (inert by construction), scripts/harness-runs/ and
// scripts/_snapshots/ (run records and data, similar by design), and generated .d.ts. Every exclusion is
// named here; nothing is excluded silently.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { violation } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { readFile } from '../lib/file-content.mjs';
import { getRepoRoot } from '../../lib/context.mjs';
import { resolveRange, gitChangedFiles, gitWorkingTreeFiles } from '../../lib/change-range.mjs';

export const SCOPE_GLOBS = ['fsi-app/src/**/*.{mjs,js,ts,tsx}', 'fsi-app/scripts/**/*.{mjs,js,ts,tsx}'];
export const WINDOW = 8;

export function inScope(f) {
  const p = String(f).replace(/\\/g, '/');
  if (/\.(test|npmtest|selftest|golden)\.(mjs|ts|tsx)$/.test(p)) return false;
  if (/\.d\.ts$/.test(p)) return false;
  if (/\/fixtures\//.test(p)) return false;
  if (/\/_archive\//.test(p)) return false;
  if (/\/scripts\/harness-runs\//.test(p)) return false;
  if (/\/scripts\/_snapshots\//.test(p)) return false;
  return true;
}

/** Normalize one file's text to the lines the scan compares. Pure. */
export function normalizeLines(content) {
  const out = [];
  let inBlock = false;
  for (const raw of String(content).split(/\r?\n/)) {
    let l = raw.trim();
    if (inBlock) {
      if (l.includes('*/')) { inBlock = false; l = l.slice(l.indexOf('*/') + 2).trim(); } else continue;
    }
    if (l.startsWith('/*')) { if (!l.includes('*/')) { inBlock = true; continue; } l = l.slice(l.indexOf('*/') + 2).trim(); }
    if (!l || l.startsWith('//') || l.startsWith('*')) continue;
    if (/^(import\s|export\s+\{|\} from\s)/.test(l)) continue;
    l = l.replace(/\s+/g, ' ');
    if (l.length < 4) continue; // lone braces and punctuation are structure, not copied logic
    out.push(l);
  }
  return out;
}

/** Pure clone scan over {path, content} entries. Returns {duplicatedLines, clones:[{a,b,windows}], byFile}. */
export function detectClones(entries, window = WINDOW) {
  const index = new Map(); // hash -> [{path, start}]
  const normalized = new Map();
  for (const { path, content } of entries) {
    const lines = normalizeLines(content);
    normalized.set(path, lines);
    for (let i = 0; i + window <= lines.length; i++) {
      const key = lines.slice(i, i + window).join('\n');
      const arr = index.get(key);
      if (arr) arr.push({ path, start: i }); else index.set(key, [{ path, start: i }]);
    }
  }
  // duplicated lines = union of line positions covered by any window seen more than once
  const covered = new Map(); // path -> Set(lineIndex)
  const pairs = new Map(); // "a|b" -> count of shared windows
  for (const [, occ] of index) {
    if (occ.length < 2) continue;
    for (const { path, start } of occ) {
      let set = covered.get(path);
      if (!set) { set = new Set(); covered.set(path, set); }
      for (let k = 0; k < window; k++) set.add(start + k);
    }
    const files = [...new Set(occ.map((o) => o.path))].sort();
    if (files.length === 1) { const k = files[0] + '|' + files[0]; pairs.set(k, (pairs.get(k) || 0) + 1); }
    for (let i = 0; i < files.length; i++) for (let j = i + 1; j < files.length; j++) { const k = files[i] + '|' + files[j]; pairs.set(k, (pairs.get(k) || 0) + 1); }
  }
  let duplicatedLines = 0;
  const byFile = {};
  for (const [path, set] of covered) { duplicatedLines += set.size; byFile[path] = set.size; }
  const clones = [...pairs].map(([k, windows]) => { const [a, b] = k.split('|'); return { a, b, windows }; }).sort((x, y) => y.windows - x.windows);
  return { duplicatedLines, clones, byFile };
}

/** Files changed on this branch (against origin/master when it resolves) plus the working tree's modified
 *  and untracked files, repo-relative with forward slashes. Used only to NAME the clone pairs a regression
 *  most likely came from; the measurement itself never depends on git. Empty when git is unavailable.
 *  Lane N0 (plan section 6.8 Rule C): derives the range and the changed-file list through
 *  fsi-app/.discipline/lib/change-range.mjs instead of a private git-plumbing copy, same result set as
 *  before -- local merge-base against origin/master, plus the working tree's own modified/untracked
 *  files, silently empty on either half's failure (matching the original's all-catching `run()`). */
export function changedFiles() {
  const out = new Set();
  const { range, source } = resolveRange({});
  if (source !== 'unavailable' && range) {
    try { for (const f of gitChangedFiles(range)) out.add(f); } catch { /* mirrors original's silent-empty-on-failure */ }
  }
  for (const f of gitWorkingTreeFiles()) out.add(f);
  return out;
}

// CI parity: gitignored paths never reach any fitness function; the exclusion lives in lib/glob.mjs
// (globFiles) since lane L33, 2026-09-17, when F45 measured 6866 locally and 6830 on CI over three
// generated src/app/.well-known/workflow route.js files. Re-exported here so this function's own test
// pins the property.
export { ignoredPaths as ignoredFiles, isIgnored, resetIgnoredCache } from '../lib/glob.mjs';

export function scanTree() {
  const files = globFiles(SCOPE_GLOBS).filter(inScope);
  const entries = files.map((path) => ({ path, content: readFile(path) }));
  return { files: files.length, ...detectClones(entries) };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// MEASURE AT BASE (plan 6.8, Rule B, lane N4). Derives the SCOPE_GLOBS matcher purely from the glob
// strings themselves (one shape only: 'dir/**/*.{ext1,ext2}') so a base-tree file list never needs a
// second, independently-written copy of the prefix/extension truth SCOPE_GLOBS already states -- the
// self-consistency this duplicate-code checker owes its own scoping logic.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

function globToScopeMatcher(glob) {
  const m = /^(.+?)\/\*\*\/\*\.\{([^}]+)\}$/.exec(glob);
  if (!m) throw new Error(`F45: matchesScopeGlobs cannot parse pattern: ${glob}`);
  const prefix = m[1] + '/';
  const exts = m[2].split(',').map((e) => '.' + e.trim());
  return (p) => p.startsWith(prefix) && exts.some((ext) => p.endsWith(ext));
}

const SCOPE_MATCHERS = SCOPE_GLOBS.map(globToScopeMatcher);

/** Pure equivalent of "does globFiles(SCOPE_GLOBS) reach this path", usable against a path list that
 *  never touched the filesystem (a base tree's `git ls-tree` output). */
export function matchesScopeGlobs(path) {
  const p = String(path).replace(/\\/g, '/');
  return SCOPE_MATCHERS.some((fn) => fn(p));
}

/** Cache key for a base ref: the ref itself when it is already a full 40-hex commit id (the shape
 *  resolveRange's local-merge-base source always returns, so the common path needs no extra git call
 *  to get one); otherwise a sha256 of the ref string (CI-PR mode's `origin/<branch>` shape), so the
 *  cache-hit path NEVER calls git, on any input. */
function cacheKeyFor(base) {
  return /^[0-9a-f]{40}$/i.test(String(base)) ? base : createHash('sha256').update(String(base)).digest('hex');
}

/** Parse `git cat-file --batch` output (a Buffer) into `{ path, content }` entries. Order-correlated
 *  with `paths` (cat-file emits results in the same order objects were requested on stdin), which is
 *  what lets this skip parsing the object hash out of each header -- a "<query> missing" header (should
 *  not happen for paths taken from `git ls-tree` at the same commit, but handled defensively) is skipped
 *  without an entry rather than thrown. */
export function parseCatFileBatch(buf, paths) {
  const entries = [];
  let offset = 0;
  let i = 0;
  while (offset < buf.length && i < paths.length) {
    const nl = buf.indexOf(0x0a, offset);
    if (nl === -1) break;
    const header = buf.slice(offset, nl).toString('utf8');
    offset = nl + 1;
    if (/ missing$/.test(header)) { i++; continue; }
    const m = /^(\S+) (\S+) (\d+)$/.exec(header);
    if (!m) throw new Error(`F45: unexpected git cat-file --batch header: ${JSON.stringify(header)}`);
    const size = Number(m[3]);
    const content = buf.slice(offset, offset + size).toString('utf8');
    offset += size + 1; // skip content + its trailing newline
    entries.push({ path: paths[i], content });
    i++;
  }
  return entries;
}

/** The same measurement scanTree() takes of the working tree, taken instead of the tree as committed at
 *  `base` (a ref or commit id) -- via ONE `git cat-file --batch` process, never one git call per file.
 *  Cached at `fsi-app/scripts/tmp/f45-base/<cache key>.json` (gitignored scratch, plan 6.8: "nothing is
 *  stored that a lane could collide on" -- this is a memoized recomputation, not a committed value); a
 *  cache hit returns without touching git at all. `cwd` lets tests point this at a throwaway fixture
 *  repo instead of this repo. */
export function measureAtBase(base, { cwd } = {}) {
  const root = cwd || getRepoRoot();
  const cacheDir = join(root, 'fsi-app', 'scripts', 'tmp', 'f45-base');
  const cachePath = join(cacheDir, `${cacheKeyFor(base)}.json`);
  if (existsSync(cachePath)) {
    try {
      return JSON.parse(readFileSync(cachePath, 'utf8'));
    } catch {
      // corrupt/partial cache file: fall through and recompute.
    }
  }

  let lsOut;
  try {
    lsOut = execFileSync('git', ['ls-tree', '-r', '--name-only', '-z', String(base)], { cwd: root, maxBuffer: 1 << 26 });
  } catch (e) {
    throw new Error(`F45: 'git ls-tree -r --name-only -z ${base}' failed: ${e.message}`);
  }
  const allPaths = lsOut.toString('utf8').split('\0').filter(Boolean).map((p) => p.replace(/\\/g, '/'));
  const paths = allPaths.filter((p) => matchesScopeGlobs(p) && inScope(p));

  let entries = [];
  if (paths.length > 0) {
    const input = paths.map((p) => `${base}:${p}`).join('\n') + '\n';
    let out;
    try {
      out = execFileSync('git', ['cat-file', '--batch'], { cwd: root, input, maxBuffer: 1 << 27 });
    } catch (e) {
      throw new Error(`F45: 'git cat-file --batch' failed for base '${base}': ${e.message}`);
    }
    entries = parseCatFileBatch(out, paths);
  }

  const { duplicatedLines, clones, byFile } = detectClones(entries);
  const result = { files: entries.length, duplicatedLines, clones, byFile };
  try {
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(cachePath, JSON.stringify(result));
  } catch {
    // best-effort scratch cache; a read-only fs must not fail the measurement.
  }
  return result;
}

/** Pure ratchet decision (plan 6.8, Rule B): HEAD's measurement must not exceed the base's. Injectable
 *  so the REGRESSION shape is unit-testable without git or the filesystem. `changed` is the Set of
 *  branch-changed paths used only to NAME the likely culprit; the decision itself never depends on it. */
export function evaluateRatchet(head, base, changed = new Set()) {
  if (head.duplicatedLines <= base.duplicatedLines) return [];
  const fmt = (c) => `${c.windows}w ${c.a} <-> ${c.b}`;
  const mine = head.clones.filter((c) => changed.has(c.a) || changed.has(c.b)).slice(0, 20).map(fmt).join('; ');
  const top = head.clones.slice(0, 12).map(fmt).join('; ');
  return [violation(1, `REGRESSION: ${head.duplicatedLines} duplicated lines vs base ${base.duplicatedLines} (+${head.duplicatedLines - base.duplicatedLines}). New duplication landed: extract the shared home and import it. Clone pairs touching files changed on this branch: ${mine || '(none attributed; see the largest pairs)'}. Largest clone pairs in the tree (shared ${WINDOW}-line windows): ${top}`)];
}

export const fitnessFunction = {
  id: 'F45',
  name: 'duplicate-code',
  description:
    'Total duplicated normalized lines across fsi-app/src and fsi-app/scripts (tests, fixtures, archive, ' +
    'run artifacts and snapshots excluded) must not exceed the same measurement taken on the merge-base ' +
    'tree with origin/master: above it, new duplication landed on this branch (extract the shared home ' +
    'and import it); the comparison is to the tree, never to a stored number (plan 6.8, Rule B).',
  source: 'operator ruling 2026-09-17 ("recurring doubling of work and code"; "wire or remove"); the clone scan of the same day; plan 6.8 Rule B (2026-09-18) for the merge-base comparison',

  enumerate() {
    // One anchor file: the scan is tree-wide, reported once (the F23 shape).
    return ['fsi-app/.discipline/fitness/functions/F45-duplicate-code.mjs'];
  },

  check() {
    const root = getRepoRoot();
    const r = scanTree();
    const { base, source, reason } = resolveRange({ cwd: root });
    if (source === 'unavailable') {
      console.log(`  [F45] F45 duplicated lines: ${r.duplicatedLines} (base: unavailable -- no baseline to compare: ${reason})`);
      return [];
    }
    const baseMeasure = measureAtBase(base, { cwd: root });
    console.log(`  [F45] F45 duplicated lines: ${r.duplicatedLines} (base: ${baseMeasure.duplicatedLines})`);
    return evaluateRatchet(r, baseMeasure, changedFiles());
  },
};
