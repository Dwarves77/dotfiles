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
// normalized lines, the same shape as the operator-ruled coverage ratchet (F23): it may only fall.
//
// THE RATCHET BITES BOTH WAYS (F23's own rule): over the ceiling FAILS (new duplication landed); under
// the ceiling ALSO FAILS, naming the value to re-seed to, so an improvement forces the ceiling down and
// the number stays honest. Deleting duplication is the only way the ceiling moves, and it moves in the
// same commit.
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
import { execFileSync } from 'node:child_process';
import { violation } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { readFile } from '../lib/file-content.mjs';

export const SCOPE_GLOBS = ['fsi-app/src/**/*.{mjs,js,ts,tsx}', 'fsi-app/scripts/**/*.{mjs,js,ts,tsx}'];
export const WINDOW = 8;

/** Committed ceiling: total duplicated normalized lines measured by detectClones over the scope on the
 *  tree this file ships on. Re-seed DOWN in the same commit that removes duplication; never up. */
export const DUPLICATED_LINES_CEILING = 6227; // seeded 8061 on master ed2ee7c9 (lane L30); 7569 after L31 (route guard, 89 routes); re-seeded 6866 by lane L33 (community shell context, route skeleton frames); gitignored files excluded from the scan, CI parity, lane L33 second push (6866 to 6830); re-seeded by lane L34 after rebase onto master c5279274, detail and admin primitives (6830 to 6227); only re-seed DOWN

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
 *  most likely came from; the measurement itself never depends on git. Empty when git is unavailable. */
export function changedFiles() {
  const out = new Set();
  const run = (args) => { try { return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return ''; } };
  const base = run(['merge-base', 'origin/master', 'HEAD']).trim();
  if (base) for (const f of run(['diff', '--name-only', base, 'HEAD']).split(/\r?\n/)) if (f) out.add(f.trim());
  for (const line of run(['status', '--porcelain', '--untracked-files=all']).split(/\r?\n/)) if (line.length > 3) out.add(line.slice(3).trim().replace(/\\/g, '/'));
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

export const fitnessFunction = {
  id: 'F45',
  name: 'duplicate-code',
  description:
    'Total duplicated normalized lines across fsi-app/src and fsi-app/scripts (tests, fixtures, archive, ' +
    'run artifacts and snapshots excluded) must equal the committed ceiling: above it, new duplication ' +
    'landed (extract the shared home and import it); below it, re-seed the ceiling down in the same commit.',
  source: 'operator ruling 2026-09-17 ("recurring doubling of work and code"; "wire or remove"); the clone scan of the same day',

  enumerate() {
    // One anchor file: the scan is tree-wide, reported once (the F23 shape).
    return ['fsi-app/.discipline/fitness/functions/F45-duplicate-code.mjs'];
  },

  check() {
    const r = scanTree();
    const fmt = (c) => `${c.windows}w ${c.a} <-> ${c.b}`;
    const top = r.clones.slice(0, 12).map(fmt).join('; ');
    if (r.duplicatedLines > DUPLICATED_LINES_CEILING) {
      const changed = changedFiles();
      const mine = r.clones.filter((c) => changed.has(c.a) || changed.has(c.b)).slice(0, 20).map(fmt).join('; ');
      return [violation(1, `REGRESSION: ${r.duplicatedLines} duplicated lines across ${r.files} files, ceiling ${DUPLICATED_LINES_CEILING} (+${r.duplicatedLines - DUPLICATED_LINES_CEILING}). New duplication landed: extract the shared home and import it. Clone pairs touching files changed on this branch: ${mine || '(none attributed; see the largest pairs)'}. Largest clone pairs in the tree (shared ${WINDOW}-line windows): ${top}`)];
    }
    if (r.duplicatedLines < DUPLICATED_LINES_CEILING) {
      return [violation(1, `IMPROVEMENT: ${r.duplicatedLines} duplicated lines, ceiling ${DUPLICATED_LINES_CEILING}. Re-seed DUPLICATED_LINES_CEILING to ${r.duplicatedLines} in this same commit so the ratchet keeps the gain.`)];
    }
    return [];
  },
};
