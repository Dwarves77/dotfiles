// TEST DISCOVERY - the single place that answers "which files does the no-npm discipline suite run?"
//
// WHY THIS EXISTS (lane T3, 2026-09-20, replacing the hand-kept directory-glob list run-test-suite.sh
// used to carry at its `node --test` invocation). Plan 6.8 retired every OTHER hand-kept registry in
// this codebase (fitness manifest, invariant list, harness families, skill category numbers) in favour
// of derivation from the tracked tree. The per-directory glob list in run-test-suite.sh was the one
// registry that survived that pass as a LIST: about sixty `dir/*.test.mjs` lines, one per covered
// directory, that a lane had to remember to extend when it added a test in a never-before-seen
// directory. Two lanes hit exactly that gap on 2026-09-20 (M7a's `src/app/api/admin/statutory-rows/`,
// M9d's `scripts/producers/*.test.mjs` one level above the covered `producers/*/` glob): F23
// (governed-surface-coverage, ORPHANED PROOF, ratcheted at 0) correctly failed the push gate because
// the new directory matched no glob. This module removes the class: discovery is now BY CONSTRUCTION
// from `git ls-files`, so a test in a brand-new directory is discovered the moment it is tracked, with
// nothing to remember to edit here.
//
// SCOPE. The no-npm discipline suite covers `fsi-app/` and `.claude/hooks/` only (the two roots
// run-test-suite.sh has always covered; `src/`, `scripts/`, `supabase/` are `fsi-app/` subtrees, and the
// repo also has other trees, e.g. `docs/`, that carry no discipline tests). Within that scope:
//   - every tracked `*.test.mjs` is discovered, full generality, any depth.
//   - `*.selftest.mjs` is discovered only under the two directories run-test-suite.sh's own header has
//     always scoped it to: `fsi-app/scripts/lib/` and `fsi-app/src/lib/d3/`.
//   - `fsi-app/src/lib/sources/classify-source-role.selftest.mjs` and
//     `fsi-app/src/lib/sources/instrument-identity.selftest.mjs` are discovered by NAME, the ONE
//     directory that stays a named pair (run-test-suite.sh's header explains why: the same directory
//     also holds `institution.selftest.mjs` and `source-growth.selftest.mjs`, which need jiti and are
//     execution-wired instead as F10/F11 fitness sentinels; a `*.selftest.mjs` glob over that directory
//     would silently pull those two into this no-npm job).
//   - `*.npmtest.mjs` is NEVER discovered here (different suffix; a suffix glob does not match a
//     different suffix, by construction; it runs instead in discipline.yml's npm-deps step via that
//     step's own `git ls-files 'fsi-app/**/*.npmtest.mjs'` glob).
//   - nothing else under `fsi-app/src/lib/sources/` is discovered (e.g. `fsi-app/src/lib/trust.selftest.mjs`
//     is outside every one of the rules above and is correctly never discovered here; it is
//     execution-wired via an F11 fitness-sentinel spawn instead, not this suite).
//
// CONSUMERS. `fsi-app/.discipline/run-test-suite.sh` calls this module's CLI to build the `node --test`
// argument list (NUL-safe via `--print0`, piped to `xargs -0`). `fsi-app/.discipline/governance/
// execution-wiring.mjs`'s Surface 1 imports `discoverTests()` directly to compute the exact executed-file
// set for `isExecutionWired()`, no more regex-parsing of run-test-suite.sh's shell text, so the two can
// never drift from each other or from what actually runs.
//
// PURE CORE. `discoverFromLsFilesOutput()` takes the raw output of `git ls-files -z -- fsi-app
// .claude/hooks` (a NUL-separated string) and returns the sorted discovered list, no filesystem or
// process access, so the attack tests in `test-discovery.test.mjs` can feed it constructed input.
// `discoverTests()` is the only function that actually invokes `git` (a local, network-free, DB-free
// index read, the same operation `governance/invariant-coverage.mjs`'s own `execSync('git ls-files', ...)`
// already performs in this same meta-gate).

import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = resolve(HERE, '..', '..', '..'); // .discipline/lib -> fsi-app -> repo root

// The ONE named pair (see header). Never a glob: a glob over this directory would also catch
// institution.selftest.mjs and source-growth.selftest.mjs, which must NOT run in this no-npm suite.
export const NAMED_SOURCES_SELFTESTS = Object.freeze([
  'fsi-app/src/lib/sources/classify-source-role.selftest.mjs',
  'fsi-app/src/lib/sources/instrument-identity.selftest.mjs',
]);

// The two directories where *.selftest.mjs is discovered by construction (mirrors run-test-suite.sh's
// pre-existing `scripts/lib/*.selftest.mjs` and `src/lib/d3/*.selftest.mjs` globs).
const GLOB_SELFTEST_DIRS = Object.freeze([
  'fsi-app/scripts/lib/',
  'fsi-app/src/lib/d3/',
]);

/**
 * Pure core. `raw` is the NUL-separated output of `git ls-files -z -- fsi-app .claude/hooks` (or an
 * equivalent already-NUL-joined string of repo-relative POSIX paths). Returns the sorted discovered
 * file list run-test-suite.sh feeds to `node --test`.
 */
export function discoverFromLsFilesOutput(raw) {
  const tracked = String(raw)
    .split('\0')
    .filter(Boolean)
    .map((p) => p.replace(/\\/g, '/'));
  const trackedSet = new Set(tracked);
  const out = new Set();

  for (const p of tracked) {
    if (p.endsWith('.npmtest.mjs')) continue; // different suffix: never this suite, by construction
    if (p.endsWith('.test.mjs')) {
      out.add(p);
      continue;
    }
    if (p.endsWith('.selftest.mjs') && GLOB_SELFTEST_DIRS.some((dir) => p.startsWith(dir))) {
      out.add(p);
    }
  }
  for (const p of NAMED_SOURCES_SELFTESTS) {
    if (trackedSet.has(p)) out.add(p);
  }
  return [...out].sort();
}

/**
 * Invokes `git ls-files -z` scoped to the two roots this suite covers (fsi-app/, .claude/hooks/) and
 * returns the discovered list. The only function in this module that touches the filesystem/a process.
 */
export function discoverTests({ repoRoot = DEFAULT_REPO_ROOT } = {}) {
  const raw = execFileSync(
    'git',
    ['ls-files', '-z', '--', 'fsi-app', '.claude/hooks'],
    { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  return discoverFromLsFilesOutput(raw);
}

// ---- CLI -------------------------------------------------------------------------------------------
// `node test-discovery.mjs`          -> one discovered path per line (for humans / a plain count).
// `node test-discovery.mjs --print0` -> NUL-separated (for `xargs -0`, so a path with a space cannot
//                                       split across two arguments).
function isMainModule() {
  const invoked = process.argv[1] ? resolve(process.argv[1]) : null;
  return invoked === resolve(fileURLToPath(import.meta.url));
}

if (isMainModule()) {
  const files = discoverTests();
  if (files.length === 0) {
    console.error('test-discovery: discovered ZERO test files (standing red; see this file\'s header)');
    process.exit(1);
  }
  if (process.argv.includes('--print0')) {
    process.stdout.write(files.join('\0') + '\0');
  } else {
    for (const f of files) process.stdout.write(f + '\n');
  }
}
