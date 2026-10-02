// F65: no-bracket-path-tests (lane R6-8, 2026-10-01, remediation plan 2026-09-30 item 8). Closes
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

import { execFileSync } from 'node:child_process';
import { violation } from '../lib/result.mjs';
import { getRepoRoot } from '../../lib/context.mjs';

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

export const fitnessFunction = {
  id: 'F65',
  name: 'no-bracket-path-tests',
  description:
    'A tracked *.test.mjs / *.npmtest.mjs / *.selftest.mjs / *.golden.mjs path must never contain a ' +
    '`[` or `]` character: Node\'s test runner parses even an explicit CLI file argument through its ' +
    'own glob matcher, so a bracket segment (an app-router [param]/ directory, most commonly) silently ' +
    'drops the file from every run with no error (CF-SEC-11, lane W2-A). The runner itself is fixed at ' +
    'the class via run-explicit-tests.mjs (see this file\'s header); this check is the belt that keeps ' +
    'holding even if a future caller reintroduces a CLI `node --test <path>` invocation.',
  source: 'fsi-app/.discipline/fitness/functions/F65-no-bracket-path-tests.mjs',

  // One anchor file (the F23/F45/F51 shape): this is a tree-wide git-ls-files scan, reported once, not
  // a per-file enumeration of every governed test path.
  enumerate() {
    return ['fsi-app/.discipline/fitness/functions/F65-no-bracket-path-tests.mjs'];
  },

  check() {
    const root = getRepoRoot();
    const paths = listTrackedPaths(root);
    const bad = findBracketPathTests(paths);
    return bad.map((p) => violation(1, `${p}: tracked test path contains a "[" or "]" character -- Node's test runner silently drops it from every CLI-glob-driven run (CF-SEC-11). Rename the path, or ensure every runner that executes it uses run-explicit-tests.mjs's programmatic run({ files }) API instead of a CLI "node --test <path>" invocation.`));
  },
};
