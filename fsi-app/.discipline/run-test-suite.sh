#!/bin/sh
# THE canonical discipline unit-test suite — the SINGLE entrypoint invoked by BOTH the CI "Discipline engine
# unit tests" job (.github/workflows/discipline.yml) AND the pre-push hook (step 3). Parity by construction:
# the test list lives in ONE place, so pre-push and CI can never silently drift. Adding a test = editing this
# ONE list. glob-portability.test.mjs reads its source-of-truth from HERE.
#
# Why this exists (operator ruling 2026-07-04): the pre-push list and the CI list had drifted — pre-push was
# MISSING glob-portability.test.mjs, so a non-portable `@/` import in a discipline-glob test passed locally
# and only reddened in CI. Two-homes class (4th instance: surface_of, authorityFloorFor, url-canon, the test
# list). One home now.
#
# NO fast/full tiers: the full suite measures ~22s locally (well under the ~90s pre-push budget), so pre-push
# runs the SAME full suite CI runs — pure parity. (If it ever exceeds ~90s, a derived fast subset may be
# added with the omitted set NAMED here, per the operator's ruling — not silently.)
#
# Runs WITHOUT npm ci (mirrors the CI job): every listed test MUST import only node: builtins + relative .mjs
# (glob-portability.test.mjs enforces this). Node 24 type-stripping makes relative .ts imports portable too.
#
# APP TESTS JOIN BY CONSTRUCTION (red-merge-class fix, dispatch 2026-07-08): the src/** entries are
# DIRECTORY GLOBS, not a hand list — the hand list silently omitted 6+ app test files (prompt-cache,
# timeline-harvest, cited-host-gate, content-change, portal-links, parse-output-blocklist,
# host-authority), so their red-then-green coverage ran only on the author's machine and a
# deliberately-failing src test sailed through CI green. Dropping a *.test.mjs into a covered
# directory now runs it in pre-push AND CI by construction. NAMED EXCLUSION (per the header rule —
# omissions are named, never silent): *.npmtest.mjs — tests that import npm deps (jiti) and cannot
# run in this no-npm-ci job; they run in the CI fitness-check job AFTER `npm ci`
# (.github/workflows/discipline.yml "App unit tests requiring npm deps").
set -eu
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || (cd "$(dirname "$0")/../.." && pwd))"
cd "$ROOT"

# shellcheck disable=SC2046  # intentional glob/word-split of the test list
node --test \
  fsi-app/.discipline/glob-portability.test.mjs \
  fsi-app/.discipline/vocab-drift-guard.test.mjs \
  fsi-app/.discipline/lib/*.test.mjs \
  fsi-app/.discipline/rules/*.test.mjs \
  fsi-app/.discipline/consistency/*.test.mjs \
  fsi-app/.discipline/governance/*.test.mjs \
  fsi-app/.discipline/runner.test.mjs \
  fsi-app/.discipline/install-hooks.test.mjs \
  fsi-app/.discipline/dispatch/*.test.mjs \
  fsi-app/.discipline/fitness/functions/*.test.mjs \
  fsi-app/.discipline/fitness/runner.test.mjs \
  fsi-app/scripts/lib/db.test.mjs \
  fsi-app/scripts/lib/funded-release-plan.test.mjs \
  fsi-app/scripts/lib/batch1-orchestrate.test.mjs \
  fsi-app/src/__tests__/*.test.mjs \
  fsi-app/src/lib/credibility/*.test.mjs \
  fsi-app/src/lib/sources/*.test.mjs \
  fsi-app/src/lib/entities/*.test.mjs \
  fsi-app/src/lib/agent/*.test.mjs \
  fsi-app/src/lib/llm/*.test.mjs
