// EXECUTION-WIRING resolver — answers "is this proof file actually RUN by CI?", not "does it exist?".
//
// WHY THIS EXISTS (2026-08-09, operator-directed; the wiring-truth sweep). The invariant-coverage
// meta-gate resolved `selftest:` tokens by git-tracked existence and `audit:` tokens by existence +
// a GOVERNING cite. Neither checked EXECUTION. Consequence, proven the same day: all 15 behavioral
// goldens were `selftest:`-cited as enforcement and run by NOTHING (two were silently red for weeks),
// and 13 `audit:`-cited verifiers were absent from the data-audit lane's run list. Every one of them
// satisfied the meta-gate. "Wired" was a lie the gate rubber-stamped. This module makes "wired" mean
// EXECUTED, by deriving the executed-file set from the actual runners (no hand-maintained duplicate).
//
// EXECUTION SURFACES (every way a proof file gets run in CI — derived by READING the runners, so this
// cannot drift from what CI actually does):
//   1. run-test-suite.sh          - the no-npm `node --test` suite. CI + pre-push. Lane T3, 2026-09-20:
//                                    run-test-suite.sh no longer carries a hand-kept glob list to
//                                    regex-parse; both it and this resolver import the SAME
//                                    `discoverTests()` from `.discipline/lib/test-discovery.mjs`, so the
//                                    executed set here is the exact set the suite runs, not an
//                                    approximation of it.
//   2. *.npmtest.mjs glob          — the npm-deps `node --test` step in discipline.yml (fitness-check job).
//   3. run-goldens.mjs             — every scripts/verify/*.golden.mjs / *-golden.mjs (behavioral goldens).
//   4. run-data-audit-lane.mjs     — the AUDITS list (live-data audits, secrets lane).
//   5. fitness sentinels           — a fitness function that SPAWNS a proof file (F10/F11 spawn their
//                                    SENTINEL selftest and pass iff exit 0). Any .mjs path referenced as
//                                    a string literal inside .discipline/fitness/functions/*.mjs.
//   6. rendering guard             — run-rendering-guard.mjs, invoked directly by the rendering-guard job.
//   7. discipline.yml NAMED paths — any proof path written LITERALLY into a workflow step. Added
//                                2026-08-11 (wiring census): seven proofs reach an npm package
//                                TRANSITIVELY (batch-primitives.npmtest.mjs imports a relative helper
//                                that imports `pg`), so they cannot join the no-npm suite and are
//                                named in the npm-deps step instead. Without this surface they would
//                                read as run-by-nothing while CI demonstrably runs them — the
//                                resolver must reflect what CI DOES, not one favoured spelling of it.
//
// A `selftest:`/`audit:` token is EXECUTION-WIRED iff its path matches at least one surface. Matching is
// by PATH-vs-PATTERN (the token gives a concrete repo-relative path; a suite glob like
// `fsi-app/src/lib/agent/*.test.mjs` becomes a regex the path is tested against) — no filesystem globbing,
// so it is deterministic on any checkout.
//
// FAIL-LOUD: if a runner file cannot be read, this throws (a silent "everything unwired" would red the
// whole gate; a silent "everything wired" would reopen the hole). CI has the files; a throw means a real
// structural problem to fix. FS-pure (reads repo files only; no DB, no network) — safe inside the meta-gate.

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverTests } from '../lib/test-discovery.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');               // dotfiles repo root
const FSI = 'fsi-app';

function readRepo(rel) {
  return readFileSync(join(REPO, rel), 'utf8');              // throws if missing — fail-loud by design
}

// Convert a shell/`node --test` path pattern (single-segment `*` only, as the suite uses) to an anchored
// regex over repo-relative POSIX paths. `**` is supported for the npmtest glob (any depth).
function patternToRegex(pat) {
  const esc = pat.replace(/[.+^${}()|[\]\\]/g, '\\$&');      // escape regex metachars (NOT * yet)
  const withGlobs = esc
    .replace(/\*\*/g, '\u0000')                             // placeholder for **
    .replace(/\*/g, '[^/]*')                                 // * = one path segment (no slash)
    .replace(/\u0000/g, '.*');                               // ** = any depth
  return new RegExp('^' + withGlobs + '$');
}

// Surface 1: run-test-suite.sh no longer holds a glob list to regex-parse (lane T3, 2026-09-20); it
// calls `discoverTests()` from `.discipline/lib/test-discovery.mjs` to build its `node --test` argument
// list by construction from `git ls-files`. This resolver imports the SAME function and matches by exact
// path membership in the discovered set, so it can never drift from what the suite actually runs (the
// prior approach regex-parsed literal glob tokens out of the shell script's text, which is now gone).
function testSuiteMatcher() {
  const discovered = new Set(discoverTests({ repoRoot: REPO }));
  return { test: (p) => discovered.has(p) };
}

// Surface 2: the *.npmtest.mjs glob wired in discipline.yml. WIDENED (plan 6.8, lane N1, out-of-write-set
// necessary fix, disclosed in that lane's report) from 'fsi-app/src/**/*.npmtest.mjs' to
// 'fsi-app/**/*.npmtest.mjs' to match discipline.yml's own widened `git ls-files` glob, which now also
// covers fsi-app/scripts/** and fsi-app/.discipline/** npmtest files (the nine files that lane renamed
// out of run-test-suite.sh's no-npm suite, plus the five pre-existing scripts/**/*.npmtest.mjs files
// discipline.yml previously had to name literally because this surface did not see them).
function npmtestMatcher() {
  return patternToRegex(`${FSI}/**/*.npmtest.mjs`);
}

// Surface 3: run-goldens.mjs discovers scripts/verify/ files matching /(\.golden|-golden)\.mjs$/.
function goldensMatcher() {
  // Mirror run-goldens.mjs's own discovery regex, scoped to its directory.
  return {
    test: (p) => p.startsWith(`${FSI}/scripts/verify/`) && /(\.golden|-golden)\.mjs$/.test(p),
  };
}

// Surface 4: run-data-audit-lane.mjs's DERIVED AUDITS (plan 6.8, lane N1: a registry is a directory,
// never a list). run-data-audit-lane.mjs no longer holds a hand-written AUDITS array; each audit script
// under fsi-app/scripts/verify/ or fsi-app/scripts/ (top level) declares itself with a
// `// data-audit: label=<label> hard=<true|false>` marker, and its own deriveAudits() scans for that
// marker. This surface reads the same two directories for the same marker, text-only (no import, no
// spawn), so the module stays FS-pure like every surface here.
const AUDIT_MARKER_RE = /^\/\/ data-audit: label=(\S+) hard=(true|false)$/;
function auditLaneSet() {
  const set = new Set();
  for (const dir of [`${FSI}/scripts/verify`, `${FSI}/scripts`]) {
    let names;
    try { names = readdirSync(join(REPO, dir)); } catch { continue; }
    for (const name of names) {
      if (!name.endsWith('.mjs') || name.endsWith('.test.mjs')) continue;
      const rel = `${dir}/${name}`;
      let text;
      try { text = readFileSync(join(REPO, rel), 'utf8'); } catch { continue; }
      const markerLine = text.split('\n').find((l) => l.startsWith('// data-audit:'));
      if (markerLine && AUDIT_MARKER_RE.test(markerLine)) set.add(rel);
    }
  }
  return set;
}

// Surface 5: fitness sentinels — any .mjs path literal inside a fitness function (F10/F11 spawn theirs).
function fitnessSentinelSet() {
  const dir = join(REPO, FSI, '.discipline', 'fitness', 'functions');
  const set = new Set();
  for (const f of readdirSync(dir)) {
    if (!/\.mjs$/.test(f) || /\.test\.mjs$/.test(f)) continue;
    const src = readFileSync(join(dir, f), 'utf8');
    for (const m of src.matchAll(/['"]([^'"]+\.mjs)['"]/g)) {
      const p = m[1];
      if (p.includes('/')) set.add(p.replace(/^\.?\//, ''));
    }
  }
  return set;
}

// Surface 6: the rendering-guard entrypoint, invoked directly by the rendering-guard job in discipline.yml.
// Surface 7: proof paths written LITERALLY into a discipline.yml step. Derived by READING the workflow
// (same principle as every other surface here — never a hand-maintained duplicate), so adding a path to
// the npm-deps step is by itself sufficient to make it execution-wired, with nothing else to remember.
function workflowNamedSet() {
  const yml = readRepo('.github/workflows/discipline.yml');
  const set = new Set();
  for (const m of yml.matchAll(/fsi-app\/[\w./-]+\.(?:test|selftest|npmtest)\.mjs/g)) set.add(m[0]);
  return set;
}
const RENDERING_GUARD = `${FSI}/.discipline/rendering/run-rendering-guard.mjs`;

let CACHE = null;
function build() {
  if (CACHE) return CACHE;
  const regexes = [testSuiteMatcher(), npmtestMatcher()];
  const golden = goldensMatcher();
  const auditSet = auditLaneSet();
  const sentinelSet = fitnessSentinelSet();
  const workflowSet = workflowNamedSet();
  CACHE = { regexes, golden, auditSet, sentinelSet, workflowSet };
  return CACHE;
}

/** True iff `relPath` (repo-relative, POSIX) is executed by at least one CI surface. */
export function isExecutionWired(relPath) {
  const p = String(relPath).replace(/\\/g, '/').replace(/^\.?\//, '');
  const { regexes, golden, auditSet, sentinelSet, workflowSet } = build();
  if (p === RENDERING_GUARD) return true;
  if (auditSet.has(p)) return true;
  if (sentinelSet.has(p)) return true;
  if (workflowSet.has(p)) return true;
  if (golden.test(p)) return true;
  for (const re of regexes) if (re.test(p)) return true;
  return false;
}

/** Test seam: force a rebuild (used by the negative test to inject fixtures is unnecessary — this reads
 *  the real runners; the test asserts real wired/unwired paths). Exposed for completeness. */
export function _resetCacheForTest() { CACHE = null; }
