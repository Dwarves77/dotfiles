#!/bin/sh
# run-npmtest-suites.sh, the ONE home for the npm-dependent test suite's discovery + command
# (invariant RD-79, lane G2, 2026-09-21). BOTH fsi-app/.discipline/hooks/pre-push (step 3e) AND the
# "App unit tests requiring npm deps (*.npmtest.mjs)" step in .github/workflows/discipline.yml call
# THIS script, so the two surfaces cannot drift the way they did on PR #769: CI's Fitness functions
# job failed on three *.npmtest.mjs tests that the local push gate never ran at all, because
# fsi-app/.discipline/hooks/pre-push had no npm-test step, "sTOP pushing when it will fail
# Discipline engine / Fitness functions" (operator ruling, 2026-09-21) requires the two surfaces to
# agree about what "green" means.
#
# Discovery is git ls-files with NO pathspec glob argument (a plain full listing, filtered by a literal
# JS suffix match below), so a new *.npmtest.mjs anywhere under fsi-app/ joins both surfaces
# automatically, no edit needed here. CORRECTED (lane R6-8, 2026-10-01, closes CF-SEC-11): this used to
# discover via `git ls-files 'fsi-app/**/*.npmtest.mjs'` -- a PATHSPEC GLOB passed to git, which treats
# a literal `[`/`]` in a path as a bracket-expression glob token, same class of bug as Node's own CLI
# test-file matching. It then invoked `node --test $files` on the CLI, which has its OWN, separate
# instance of the bug: Node's test runner re-parses every explicit file argument through its own glob
# matcher, so a bracket-path file silently drops out even when discovery DID find it. Both are gone now:
# discovery is a plain `git ls-files -z` (no pattern argument, so nothing is re-interpreted as a glob)
# filtered by a literal `*.npmtest.mjs` string-suffix test, same shape test-discovery.mjs already uses
# for the no-npm suite; execution goes through `run-explicit-tests.mjs`'s programmatic `run({ files })`
# API (see that file's header and F65-no-bracket-path-tests.mjs for the full defect + reproduction),
# whose `files` option is a literal array, never re-parsed as a glob.
#
# Requires: fsi-app's npm deps RESOLVABLE from fsi-app/ (npm ci in CI; in a linked worktree, the
# shared install reached through the link beside the worktrees, RD-85). The check asks Node, never
# the literal fsi-app/node_modules path. This script does NOT install deps itself and does NOT skip
# silently when they're missing, brief-g2.md item 1: "it never skips silently and never installs by
# itself", it fails loud, naming the fix.
#
# Usage: run from the repo root (both callers already cd there before invoking this):
#   sh fsi-app/.discipline/hooks/lib/run-npmtest-suites.sh

set -u

if ! node -e "require.resolve('next/package.json', { paths: [process.argv[1]] })" "$(pwd)/fsi-app" >/dev/null 2>&1; then
  echo "[run-npmtest-suites] fsi-app's npm dependencies do not resolve from fsi-app/ in this checkout." >&2
  echo "[run-npmtest-suites] fix: in a linked worktree run 'sh fsi-app/.discipline/hooks/lib/worktree-node-modules.sh --link'; in CI or the main checkout run 'npm ci' inside fsi-app." >&2
  exit 1
fi

# TREE-CLEAN (lane TESTFIX-1, 2026-10-08, CLAUDE.md rule 15): the same check run-test-suite.sh makes. The
# working-tree status is recorded here and compared after the tests; a test that leaves a file or modifies a
# tracked one fails this step, naming the paths. tree-clean.sh is the ONE home of the check.
SUITE_STATUS=0
TREE_CLEAN="$(dirname "$0")/tree-clean.sh"
TREE_SNAPSHOT="$(mktemp)"
trap 'rm -f "$TREE_SNAPSHOT" "$TREE_SNAPSHOT.now"' EXIT
sh "$TREE_CLEAN" snapshot "$TREE_SNAPSHOT" || exit 2

# NOTE: the NUL-separated list is piped directly into run-explicit-tests.mjs, never staged through a
# shell variable via $(...) -- command substitution cannot hold a NUL byte (it silently truncates/
# mangles there), so the list has to stay in the pipe the whole way.
have_files=$(git ls-files -- fsi-app | grep -c -E '\.npmtest\.mjs$' || true)
if [ "${have_files:-0}" -gt 0 ]; then
  git ls-files -z -- fsi-app | tr '\0' '\n' | grep -E '\.npmtest\.mjs$' | tr '\n' '\0' | node "$(dirname "$0")/../../lib/run-explicit-tests.mjs" || SUITE_STATUS=$?
else
  echo "[run-npmtest-suites] no npm-dep test files"
fi

# A red suite still gets the tree-clean verdict (a failing test is the likeliest one to leave a file behind).
TREE_STATUS=0
sh "$TREE_CLEAN" verify "$TREE_SNAPSHOT" || TREE_STATUS=$?
if [ "$SUITE_STATUS" -ne 0 ]; then exit "$SUITE_STATUS"; fi
exit "$TREE_STATUS"
