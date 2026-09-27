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
# Discovery and command are IDENTICAL to discipline.yml's own step (git ls-files, so a new
# *.npmtest.mjs anywhere under fsi-app/ joins both surfaces automatically, no edit needed here):
#   files=$(git ls-files 'fsi-app/**/*.npmtest.mjs' | tr -s ' \n' ' ')
#   if [ -n "$files" ]; then node --test $files; else echo "no npm-dep test files"; fi
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

files=$(git ls-files 'fsi-app/**/*.npmtest.mjs' | tr -s ' \n' ' ')
if [ -n "$files" ]; then
  node --test $files
else
  echo "[run-npmtest-suites] no npm-dep test files"
fi
