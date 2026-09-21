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
# Requires: fsi-app/node_modules present (npm ci already run in THIS worktree's fsi-app). This
# script does NOT install deps itself and does NOT skip silently when they're missing, brief-g2.md
# item 1: "it never skips silently and never installs by itself", it fails loud, naming the fix.
#
# Usage: run from the repo root (both callers already cd there before invoking this):
#   sh fsi-app/.discipline/hooks/lib/run-npmtest-suites.sh

set -u

if [ ! -d fsi-app/node_modules ] || [ -z "$(ls -A fsi-app/node_modules 2>/dev/null)" ]; then
  echo "[run-npmtest-suites] fsi-app/node_modules is absent or empty in this worktree." >&2
  echo "[run-npmtest-suites] fix: run 'npm ci' inside fsi-app in THIS worktree, then re-push." >&2
  exit 1
fi

files=$(git ls-files 'fsi-app/**/*.npmtest.mjs' | tr -s ' \n' ' ')
if [ -n "$files" ]; then
  node --test $files
else
  echo "[run-npmtest-suites] no npm-dep test files"
fi
