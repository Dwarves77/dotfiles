// F66: clock-fragility (lane R11, 2026-10-01). GOVERNING: docs/plans/remediation-plan-2026-09-30.md
// Lane 11 (CF-GATE-2: A6 C3's one-time manual grep, promoted to a standing gate).
//
// THE CLASS THIS CATCHES. PR #816 (commit a68111cf): timeline-math.test.mjs's nextMilestoneClause
// test built its EXPECTED string from a day-distance helper whose "now" argument was omitted, so the
// helper read the real wall clock, then compared that computed string to the actual output with a
// strict equality assertion. The gap between "now" (read once, inside the helper) and the fixture's
// fixed target date was exactly 1 day on 2026-09-28, the code correctly said "1 day" (daysPhrase's
// singular rule), and the test's own hardcoded "1 days" was wrong, a time bomb armed by the
// calendar, not by the diff. A68111cf's own commit message says the exact shape "isn't detectable by
// syntax alone" for a HIDDEN live read (behind a helper function); this gate catches the narrower,
// mechanically detectable instance of the same hazard: a test file that reads the live clock directly
// (`new Date()` with no arguments, or `Date.now()`) and then asserts strict string equality against a
// COMPUTED expected value (built with `+` concatenation or a `${...}` template interpolation) in the
// same test block. A test that compares to a plain string literal is not flagged, only a test that
// builds its own expectation at run time, which is what lets a real-clock read and a fixed fixture
// drift apart on exactly the calendar boundary #816 hit.
//
// WHY A TEXT SCAN. Same reasoning as F48/render-clock: there is no type that expresses "this value
// must not depend on when the test happens to run," and the hazard is a handful of grep-visible
// tokens occurring together. Deliberately dumb, therefore unambiguous.
//
// SCOPE. Every test file (F25's isTestFile() definition: *.test.mjs, *.selftest.mjs, *.npmtest.mjs,
// *.golden.mjs, __tests__/) under fsi-app/scripts/** and fsi-app/src/**.
//
// NEGATIVE CONTROL (non-overfit check, A6's own sampled cases, see F66-clock-fragility.test.mjs):
// relative-time.npmtest.mjs reads `new Date()` with no args (`const justNow = new Date();`) and then
// asserts `assert.equal(formatRelative(justNow), "just now")`, a live read, but the expected value is
// a plain literal, never built from a concatenation or interpolation, so it cannot drift with the
// calendar; not flagged. render-clock.npmtest.mjs's own red-control test holds the literal text
// "new Date()" only INSIDE a quoted string (test fixture data describing the hazard it scans other
// files for), never as a real call site in its own test logic; stripping string contents before the
// live-clock scan keeps that text from being mistaken for a call.

import { execFileSync } from 'node:child_process';
import { violation } from '../lib/result.mjs';
import { getRepoRoot } from '../../lib/context.mjs';
import { globFiles } from '../lib/glob.mjs';
import { isTestFile } from './F25-module-liveness.mjs';

const SCOPE_GLOBS = ['fsi-app/scripts/**/*.mjs', 'fsi-app/src/**/*.{mjs,ts,tsx}'];
const EXCLUDED_DIRS = ['fsi-app/scripts/_archive/', 'fsi-app/scripts/_reground/', 'fsi-app/scripts/tmp/', 'fsi-app/src/_archive/'];

const LIVE_CLOCK_RE = /\bnew\s+Date\s*\(\s*\)|\bDate\s*\.\s*now\s*\(\s*\)/;
// equal/strictEqual only, deliberately excluding deepEqual/deepStrictEqual: those compare arrays and
// objects, never "a date-shaped STRING," so a Date.now() used elsewhere on the same line to build an
// unrelated argument (e.g. a unique scratch-dir name: `join(tmpdir(), "does-not-exist-" + Date.now())`
// as the SUBJECT, asserted deepEqual to a literal `[]`) is not a string-equality date assertion at
// all, population-report.test.mjs:744 and emit-producers-artifact.test.mjs:40 are exactly this shape
// and would false-positive under a broader assert-method list; both are confirmed clean by the
// negative-control tests below.
const ASSERT_RE = /\bassert(?:\.\w+)?\s*\.\s*(?:equal|strictEqual)\s*\(/;
const COMPUTED_RE = /`[^`]*\$\{[^}]*\}[^`]*`|(?:"[^"\n]*"|'[^'\n]*')\s*\+|\+\s*(?:"[^"\n]*"|'[^'\n]*')/;

/** Blank out `//` and `/* *\/` comment text so a hazard token merely NAMED in prose (this repo's
 *  headers quote `Date.now()` constantly when explaining defects) is never mistaken for a live call.
 *  PURE. */
export function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));
}

/** Blank out the characters inside single/double/backtick-quoted string bodies (keeping the quote
 *  characters and line length) so hazard text quoted as DATA (render-clock.npmtest.mjs's own
 *  red-control fixture string, which spells "new Date()" as a sample of the defect it scans for)
 *  is never mistaken for a live call site. Single-line only: a quote that never closes on the same
 *  line is left alone, which only widens the net, never narrows it past a real hit. PURE. */
export function stripStrings(source) {
  return source.replace(/`(?:\\.|[^`\\])*`|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g, (m) => {
    if (m.length <= 2) return m;
    return m[0] + ' '.repeat(m.length - 2) + m[m.length - 1];
  });
}

/** Split a test file into its top-level `test(...)` blocks: from each line beginning with `test(`
 *  (no leading whitespace, the convention every test file in this repo already uses, see
 *  relative-time.npmtest.mjs / render-clock.npmtest.mjs / F48's own test file) to the line before the
 *  next one, or EOF. A file with no top-level `test(` call (none found) is treated as one block
 *  starting at line 1, so a file using a different harness shape still gets scanned, just without
 *  per-test isolation. PURE. @returns {{text: string, startLine: number}[]} */
export function splitIntoTestBlocks(content) {
  const lines = content.split(/\r?\n/);
  const startIdxs = [];
  lines.forEach((line, i) => {
    if (/^test\s*\(/.test(line)) startIdxs.push(i);
  });
  if (startIdxs.length === 0) return [{ text: content, startLine: 1 }];
  return startIdxs.map((idx, k) => {
    const endIdx = k + 1 < startIdxs.length ? startIdxs[k + 1] : lines.length;
    return { text: lines.slice(idx, endIdx).join('\n'), startLine: idx + 1 };
  });
}

/** Live-clock read line numbers (1-based, absolute within `content`) for a single block of source,
 *  given the block's own 1-based start line. Comments and string bodies are blanked first so neither
 *  prose mentioning the hazard nor a fixture string spelling it out can match. PURE. */
function findLiveClockLines(blockText, startLine) {
  const codeOnly = stripStrings(stripComments(blockText));
  const out = [];
  codeOnly.split('\n').forEach((line, i) => {
    if (LIVE_CLOCK_RE.test(line)) out.push(startLine + i);
  });
  return out;
}

/** Lines (1-based, absolute) carrying a strict-equality assertion whose argument list contains a
 *  COMPUTED string: `+` concatenation with a string literal, or a template literal with `${...}`
 *  interpolation. Comments are blanked (not strings, the concatenation/template shape IS the
 *  string-literal syntax this check is looking for). PURE. */
function findComputedAssertLines(blockText, startLine) {
  const codeOnly = stripComments(blockText);
  const out = [];
  codeOnly.split('\n').forEach((line, i) => {
    if (ASSERT_RE.test(line) && COMPUTED_RE.test(line)) out.push(startLine + i);
  });
  return out;
}

const excluded = (f) => EXCLUDED_DIRS.some((d) => f.startsWith(d));
export function inScope(f) {
  return !excluded(f) && isTestFile(f);
}

/** The full check, pure: given a test file's content, return the line numbers of every computed
 *  strict-equality assertion that shares a top-level test() block with a live clock read. A block
 *  with a live read but only literal-string assertions (relative-time.npmtest.mjs's "just now" case)
 *  produces nothing; a block with a computed assertion but no live read in the same block produces
 *  nothing either, the hazard is the COMBINATION, not either half alone. PURE. */
export function findClockFragileAssertions(content) {
  const out = [];
  for (const block of splitIntoTestBlocks(content)) {
    const liveLines = findLiveClockLines(block.text, block.startLine);
    if (liveLines.length === 0) continue;
    const assertLines = findComputedAssertLines(block.text, block.startLine);
    out.push(...assertLines);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

// Facet B, formerly F65 (absorbed by REG-1, 2026-10-11): no-bracket-path-tests (lane R6-8, 2026-10-01, remediation plan 2026-09-30 item 8). Closes
// CF-SEC-11.
//
// THE DEFECT, [CONFIRMED] by direct reproduction (this lane, 2026-10-01): Node's test runner treats
// even an EXPLICIT file path argument through its own glob-pattern matcher, so a path with a literal
// `[`/`]` SEGMENT is parsed as a bracket expression and silently matches nothing -- no error, "tests 0":
//
//   $ node --test "fsi-app/scripts/__fixture__/[param]/probe.npmtest.mjs"
//   ℹ tests 0
//   ℹ suites 0
//   ...
//
// This reproduces exactly what lane W2-A found: relocating a file changed the npmtest count by +15
// with zero errors either way, a false-green, not a crash. 5 sibling `[id]`/`[param]`-style route
// directories have zero colocated test coverage today, indistinguishable from "chose not to test" vs
// "silently dropped" without this guard.
//
// TWO-PART FIX (brief item 2, 2026-10-01):
//   (a) THIS FILE is the belt: it fails the build the moment any tracked `*.test.mjs` / `*.npmtest.mjs`
//       / `*.selftest.mjs` / `*.golden.mjs` path contains a `[` or `]` character anywhere in the path,
//       so a bracket-path test is caught by name even before anyone tries to run it.
//   (b) THE RUNNER ITSELF is fixed at the class, not just guarded: `fsi-app/.discipline/hooks/lib/
//       run-npmtest-suites.sh` used to invoke `node --test $files` with an explicit (already-expanded)
//       file list built by `git ls-files 'fsi-app/**/*.npmtest.mjs'` -- the CLI `--test $files` call is
//       exactly the shape proven broken above, regardless of how the file list itself was discovered.
//       It now pipes its NUL-separated discovery list through
//       `fsi-app/.discipline/lib/run-explicit-tests.mjs`, which uses `node:test`'s PROGRAMMATIC
//       `run({ files })` API (proven, same reproduction script, to execute a `[param]/`-path file
//       correctly: `run()`'s `files` option is consumed as a literal array, never re-parsed as a glob
//       pattern the way CLI positional arguments are). `fsi-app/.discipline/run-test-suite.sh` already
//       used `test-discovery.mjs`'s `git ls-files` + JS-suffix-match discovery (never a pathspec glob,
//       so discovery itself was never the bug there) but still piped the result into
//       `xargs -0 node --test`, the same broken CLI invocation shape -- it is switched to the same
//       `run-explicit-tests.mjs` runner, with its existing `--import` sandbox flag passed through via
//       `execArgv` (the `run()` API's own option for it; process-isolated per file by default, same
//       isolation semantics the CLI already had).
//
// node: builtins plus the repo's own fitness lib helpers only (loaded by the no-npm discipline test
// glob via run-test-suite.sh's existing `fitness/functions/*.test.mjs` line).

const TEST_SUFFIX_RE = /\.(?:test|npmtest|selftest|golden)\.mjs$/;

/** Does `path` (a repo-relative POSIX path) end in one of the four governed test suffixes? PURE. */
export function isGovernedTestPath(path) {
  return TEST_SUFFIX_RE.test(String(path).replace(/\\/g, '/'));
}

/** Does `path` contain a literal `[` or `]` anywhere? PURE. Node's test runner (see header) parses an
 *  explicit CLI file argument through its own glob matcher, so a bracket ANYWHERE in the path -- not
 *  only inside a directory segment -- can make the match silently fail; checking the whole path, not
 *  only path segments, is the stricter and correct scope. */
export function hasBracketChar(path) {
  return /[[\]]/.test(String(path));
}

/** Pure core: given a list of tracked repo-relative paths, return the governed-test paths that carry a
 *  bracket character. @param {string[]} paths @returns {string[]} */
export function findBracketPathTests(paths) {
  return paths.filter((p) => isGovernedTestPath(p) && hasBracketChar(p)).sort();
}

function listTrackedPaths(root) {
  const raw = execFileSync('git', ['ls-files', '-z'], {
    cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  return raw.split('\0').filter(Boolean).map((p) => p.replace(/\\/g, '/'));
}

/** Facet B (formerly F65): the tree-wide scan, reported once against the anchor entry. */
export function checkBracketPathTests() {
    const root = getRepoRoot();
    const paths = listTrackedPaths(root);
    const bad = findBracketPathTests(paths);
    return bad.map((p) => violation(1, `${p}: tracked test path contains a "[" or "]" character -- Node's test runner silently drops it from every CLI-glob-driven run (CF-SEC-11). Rename the path, or ensure every runner that executes it uses run-explicit-tests.mjs's programmatic run({ files }) API instead of a CLI "node --test <path>" invocation.`));
}


const BRACKET_ANCHOR = 'fsi-app/.discipline/fitness/functions/F66-clock-fragility.mjs';

export const fitnessFunction = {
  id: 'F66',
  name: 'test-file-hygiene',
  description:
    'Test-file hygiene. Facet A: A test file may not combine a live clock read (new Date() with no arguments, or Date.now()) with ' +
    'a strict-equality assertion against a COMPUTED string (built with + concatenation or a ${...} ' +
    'template) in the same test() block: the computed expectation and the real output can be built ' +
    'from two different instants, so the assertion is only true on whichever side of a day/hour ' +
    'boundary the run happens to land on (PR #816, a68111cf: nextMilestoneClause\'s test asserted ' +
    '"...in 1 days" against code that correctly said "1 day", the moment the live-to-fixture gap hit ' +
    'exactly one day). Pin "now" and assert exact literal strings instead. ' +
    'Facet B (formerly F65): a tracked *.test.mjs / *.npmtest.mjs / *.selftest.mjs / *.golden.mjs path must never contain a [ or ] character (Node test runner drops it silently, CF-SEC-11).',
  source: 'docs/plans/remediation-plan-2026-09-30.md Lane 11 (CF-GATE-2, A6 C3); PR #816 / commit ' +
    'a68111cf ("Fix lane CLOCK-TEST: pin the clock in nextMilestoneClause\'s test, class check across ' +
    'fsi-app"), master CI run 36366954373',

  enumerate() {
    // Facet B is a tree-wide git-ls-files scan reported once: one anchor entry (the F23/F45/F51 shape).
    return [...globFiles(SCOPE_GLOBS).filter(inScope), BRACKET_ANCHOR];
  },

  check(filepath, content) {
    if (filepath === BRACKET_ANCHOR) return checkBracketPathTests();
    return findClockFragileAssertions(content).map((line) =>
      violation(line,
        'this assertion is in the same test() block as a live clock read (new Date()/Date.now() with ' +
        'no pinned instant) and compares to a COMPUTED string (concatenation or template ' +
        'interpolation): the expected and actual values can be built from different instants and the ' +
        'assertion is only true on one side of a day/hour boundary (the #816 class, a68111cf). Pin ' +
        '"now" (pass it as an explicit argument, the way nextMilestoneClause\'s nowIso parameter does) ' +
        'and assert an exact literal string.'));
  },
};
