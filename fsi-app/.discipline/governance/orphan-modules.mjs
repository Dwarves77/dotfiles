/**
 * ORPHAN-MODULE + DEAD-EXPORT SCAN (pure core + CLI). Mechanizes docs/audits/wiring-audit-2026-09-04/
 * B1-modules.md's own two named methods — Appendix A ("every module whose ONLY import-graph importer is
 * a test") and Appendix B ("dead exports in otherwise-wired modules") — as a repeatable check, reusing
 * F25's real import graph (buildImportGraph/resolveSpecifier/isTestFile) and dispatch-root resolver
 * rather than a second hand-rolled copy (docs/plans/complete-system-build-plan-2026-09-04.md §W7.1/W7.3:
 * "the audit's import-graph + workflow-grep becomes a governance check").
 *
 * WHY THIS EXISTS (2026-09-04, lane F25-WIDE). B1's own Method section named the exact gap: F25
 * (module-liveness) covered only fsi-app/src/** and fsi-app/scripts/lib/**, so the census/ratification
 * half of the loop (four scripts/review/apply-*.mjs, wired to nothing, sitting on 1,837 untouched
 * portal_link_candidates rows) was invisible to every fitness gate. F25 itself is now widened (W7.1) to
 * scripts/** + .discipline/** and GATES on it (fails CI). This module is the separate, standing CENSUS
 * B1's Method section is: it lists modules in the SAME shape B1 found them (Appendix A: only-test-import
 * orphans; Appendix B: dead exports on wired modules), independent of F25's allowlist, so a reader can
 * always answer "what does the audit's own method find on this tree right now" without cross-referencing
 * F25's exemption list. Two modes:
 *
 *   ORPHAN MODULES (default) — Appendix A's exact shape: a non-test module under fsi-app/src/**,
 *   fsi-app/scripts/**, or fsi-app/.discipline/** that has at least one import-graph importer and EVERY
 *   one of them is a test, AND that no workflow/package.json/esbuild-alias/AUDITS-table/goldens dispatch
 *   root reaches (F25's findDispatchRoots — screen-worklist.mjs's manual-artifact-proven class is the one
 *   shape dispatch-roots cannot see; it is carried on F25's own allowlist instead, same as B1 treats it).
 *   A module with a passing test and no real caller is indistinguishable from a live one until this scan
 *   or F25's gate names it. This is a REPORT, not a gate: F25 (widened) is the CI-failing enforcement for
 *   this exact class (with a reasoned, expiring allowlist); this module is the standing, allowlist-
 *   independent count the audit's own method would produce today.
 *
 *   DEAD EXPORTS (--dead-exports) — Appendix B's exact method: every module that IS wired (a real
 *   non-test importer, OR a dispatch root) has its top-level `export function`/`export const`/
 *   `export class` names extracted, then every tracked file under fsi-app/ is checked once for each
 *   name's occurrence OUTSIDE its own defining file. A name occurring only inside its own file is dead.
 *   REPORTED, NOT FAILING (per the build plan: "reported (not failing) this train, with the 19 named as
 *   its first output") — a mechanical whole-word scan can false-positive on a dynamic access pattern
 *   (`obj[name]`), so this is a census for the operator/coordinator to act on, not a red build.
 *
 * COST: filesystem only. No network, no database, no model call, no schedule.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { globFiles } from '../fitness/lib/glob.mjs';
import {
  buildImportGraph,
  isTestFile,
  inWidenedScope,
  findDispatchRoots,
} from '../fitness/functions/F25-module-liveness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..'); // dotfiles repo root (same pattern as execution-wiring.mjs / coverage-scan.mjs)
const FSI = 'fsi-app';
const MANIFEST = 'docs/audits/dead-code-manifest-2026-08-11.txt';
const SCOPE_GLOBS = [
  `${FSI}/src/**/*.{ts,tsx,mjs,cjs,js,jsx}`,
  `${FSI}/scripts/**/*.{mjs,js}`,
  `${FSI}/.discipline/**/*.mjs`,
];

function readManifest(root, readFileFn) {
  try {
    return new Set(readFileFn(MANIFEST).trim().split('\n').filter(Boolean));
  } catch {
    return new Set();
  }
}

/**
 * Pure core, mode 1 — ORPHAN MODULES (B1 Appendix A's exact shape). Every non-test module in the widened
 * scope with >=1 importer, ALL of them tests, and no dispatch root. Injectable root/readFileFn/listFilesFn
 * for fixture-driven tests, same discipline F25's own test file uses.
 */
export function findOrphanModules(
  root = REPO,
  readFileFn = (f) => readFileSync(join(root, f), 'utf8'),
  listFilesFn = globFiles,
) {
  const files = listFilesFn(SCOPE_GLOBS);
  const manifest = readManifest(root, readFileFn);
  const importers = buildImportGraph(files, readFileFn);
  const dispatchRoots = findDispatchRoots(root, readFileFn, listFilesFn);
  const scope = files.filter((f) => inWidenedScope(f, manifest));

  const orphans = [];
  for (const f of scope) {
    if (dispatchRoots.has(f)) continue;
    const imp = importers.get(f);
    if (!imp || imp.size === 0) continue; // zero-importer is a DIFFERENT B1 class (DEAD-OR-MANUAL-ONLY); F25's gate covers both, this report is Appendix A's own shape only
    const nonTestImporters = [...imp].filter((i) => !isTestFile(i) && !manifest.has(i));
    if (nonTestImporters.length > 0) continue; // has a real importer — not an orphan
    orphans.push({ file: f, testOnlyImporters: [...imp].sort() });
  }
  return orphans.sort((a, b) => a.file.localeCompare(b.file));
}

const EXPORT_NAME_RE = /export\s+(?:async\s+)?function\s+(\w+)|export\s+const\s+(\w+)|export\s+class\s+(\w+)/g;

/**
 * Pure core, mode 2 — DEAD EXPORTS (B1 Appendix B's exact method). Every WIRED module's top-level export
 * names checked for zero whole-word occurrence outside their own defining file. Reads every tracked
 * fsi-app/ file's content ONCE (cached) rather than per export-name, matching the audit's own "tokenized
 * once" method while staying tractable over ~2500 files.
 */
export function findDeadExports(
  root = REPO,
  readFileFn = (f) => readFileSync(join(root, f), 'utf8'),
  listFilesFn = globFiles,
) {
  const scopeFiles = listFilesFn(SCOPE_GLOBS);
  const manifest = readManifest(root, readFileFn);
  const importers = buildImportGraph(scopeFiles, readFileFn);
  const dispatchRoots = findDispatchRoots(root, readFileFn, listFilesFn);
  const scope = scopeFiles.filter((f) => inWidenedScope(f, manifest));

  // "Wired" per B1 Appendix B: a real (non-test) importer, OR a dispatch root.
  const wired = scope.filter((f) => {
    if (dispatchRoots.has(f)) return true;
    const imp = importers.get(f);
    if (!imp) return false;
    return [...imp].some((i) => !isTestFile(i) && !manifest.has(i));
  });

  // Whole repo, TOKENIZED ONCE (per file) — the occurrence-scan universe, matching B1 Appendix B's own
  // method ("every tracked file... was tokenized once and checked for each name's occurrence"). Building
  // a per-file identifier-token Set up front turns an O(exports x files x file-length) regex re-scan into
  // O(files x file-length) tokenization + O(exports x files) O(1) Set lookups — the naive per-name regex
  // sweep took ~25s on this repo; this is the same method, just not re-reading every file per export name.
  // globFiles already excludes node_modules/.next/dist/build/.vercel; _archive/ is excluded here too
  // (sunset code is not a live "occurrence" of anything).
  const allFiles = listFilesFn([`${FSI}/**/*.{ts,tsx,mjs,cjs,js,jsx}`]).filter((f) => !f.includes('/_archive/'));
  const IDENT_RE = /\b[A-Za-z_$][\w$]*\b/g;
  const tokenSets = new Map();
  const tokensFor = (f) => {
    if (tokenSets.has(f)) return tokenSets.get(f);
    let text = '';
    try { text = readFileFn(f); } catch { /* vanished between list and read */ }
    const set = new Set(text.match(IDENT_RE) ?? []);
    tokenSets.set(f, set);
    return set;
  };

  const results = [];
  for (const f of wired) {
    let src = '';
    try { src = readFileFn(f); } catch { continue; }
    const names = [];
    for (const m of src.matchAll(EXPORT_NAME_RE)) {
      const name = m[1] || m[2] || m[3];
      if (name) names.push(name);
    }
    if (names.length === 0) continue;
    const dead = names.filter(
      (name) => !allFiles.some((other) => other !== f && tokensFor(other).has(name)),
    );
    if (dead.length > 0) results.push({ file: f, deadExports: dead.sort(), totalExports: names.length });
  }
  return results.sort((a, b) => a.file.localeCompare(b.file));
}

// ---- CLI (read-only: reports both modes, never fails the build — see header) ----
const INVOKED_DIRECTLY = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (INVOKED_DIRECTLY) {
  const wantDeadExports = process.argv.includes('--dead-exports');
  const wantAll = process.argv.includes('--all');

  const report = { generated: 'see git/stamp', mode: wantDeadExports ? 'dead-exports' : wantAll ? 'all' : 'orphan-modules' };

  if (!wantDeadExports || wantAll) {
    const orphans = findOrphanModules();
    report.orphanModules = orphans;
    console.log(`\n===== ORPHAN-MODULE SCAN (B1 Appendix A method) =====`);
    console.log(`${orphans.length} module(s) with only-test importers and no dispatch root:\n`);
    for (const o of orphans) console.log(`  ${o.file}\n    test-only importer(s): ${o.testOnlyImporters.join(', ')}`);
    console.log('');
  }

  if (wantDeadExports || wantAll) {
    const dead = findDeadExports();
    report.deadExports = dead;
    const totalDead = dead.reduce((n, d) => n + d.deadExports.length, 0);
    console.log(`\n===== DEAD-EXPORT SCAN (B1 Appendix B method — REPORTED, NOT FAILING) =====`);
    console.log(`${dead.length} wired module(s) carrying ${totalDead} dead export(s):\n`);
    for (const d of dead) console.log(`  ${d.file} — ${d.deadExports.join(', ')} (${d.deadExports.length}/${d.totalExports})`);
    console.log('');
  }

  writeFileSync(join(HERE, 'orphan-modules-report.json'), JSON.stringify(report, null, 2));
  console.log(`full report: fsi-app/.discipline/governance/orphan-modules-report.json`);
  console.log(`=== scan complete (read-only, never fails the build) ===`);
}
