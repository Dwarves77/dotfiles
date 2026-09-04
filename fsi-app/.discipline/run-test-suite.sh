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
# NAMED EXCLUSIONS (2026-08-11) — every omission is named, never silent. These proofs reach an npm
# package (directly or TRANSITIVELY through a helper) and therefore cannot run in this no-npm job.
# They are NOT unwired: they run in the "App unit tests requiring npm deps" step of discipline.yml,
# after `npm ci`. The transitive part is the trap — batch-primitives.test.mjs imports only a relative
# module, which imports `pg`; a direct-import check would have called it portable, and running it
# locally passes because node_modules exists. CI is the only honest oracle for this, and it said no.
#   pg:                    scripts/lib/batch-primitives.test.mjs
#   typescript (via drift-check.mjs):
#                          scripts/lib/{decision-anchors,drift-check,exclusion-audit,
#                                       inconclusive-probe,surface-registry}.selftest.mjs
#   @supabase/supabase-js: src/lib/sources/reconcile.selftest.mjs
#   jiti:                  src/lib/sources/{institution,source-growth}.selftest.mjs — these two are
#                          additionally execution-wired as F10 fitness sentinels.
# Because of these, scripts/lib and src/lib/sources are NAMED LISTS rather than directory globs. That
# reintroduces a drift vector, so it is bounded: coverage-scan's ORPHANED-PROOF check (F23, ratcheted
# at 0) fails the build the moment any tracked proof stops being executed by a runner — the named list
# cannot silently fall behind the directory again.
# UNRUN-PROOF SWEEP (2026-08-11, operator wiring census): 24 green, portable proof files were tracked
# but matched NO glob here and NO other CI surface — run by nothing, the exact goldens-class gap the
# 2026-08-09 wiring-truth sweep closed one layer down. The scripts/lib entries are now DIRECTORY GLOBS
# (the hand list had drifted 5 listed vs 21 present), and the src globs cover sources/*.selftest.mjs,
# coverage/, d3/, and tier-labels. coverage-scan's ORPHANED-PROOF category now measures exactly this
# (execution-wiring), so a future proof dropped outside every glob is a RED F23 gap, not a silence.
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
  fsi-app/.discipline/assistant-spend-gate.test.mjs \
  fsi-app/.discipline/relationship-check-literals.test.mjs \
  fsi-app/.discipline/skill-drift-gate.test.mjs \
  fsi-app/.discipline/shared-writer-registry.test.mjs \
  fsi-app/.discipline/notification-preferences-save-path.test.mjs \
  fsi-app/.discipline/lib/*.test.mjs \
  fsi-app/.discipline/rules/*.test.mjs \
  fsi-app/.discipline/consistency/*.test.mjs \
  fsi-app/.discipline/governance/*.test.mjs \
  fsi-app/.discipline/rendering/*.test.mjs \
  fsi-app/.discipline/rendering/smoke/*.test.mjs \
  fsi-app/.discipline/runner.test.mjs \
  fsi-app/.discipline/install-hooks.test.mjs \
  fsi-app/.discipline/dispatch/*.test.mjs \
  fsi-app/.discipline/fitness/functions/*.test.mjs \
  fsi-app/.discipline/fitness/runner.test.mjs \
  fsi-app/scripts/lib/admin-phrase-scan.selftest.mjs \
  fsi-app/scripts/lib/canonical-key.selftest.mjs \
  fsi-app/scripts/lib/check-sources-decision.selftest.mjs \
  fsi-app/scripts/lib/db-register-source-role.test.mjs \
  fsi-app/scripts/lib/db.test.mjs \
  fsi-app/scripts/lib/deferral.selftest.mjs \
  fsi-app/scripts/lib/entity-gate.selftest.mjs \
  fsi-app/scripts/lib/fetch-now-decision.selftest.mjs \
  fsi-app/scripts/lib/flag-age.selftest.mjs \
  fsi-app/scripts/lib/free-pass.selftest.mjs \
  fsi-app/scripts/lib/funded-pass-core.test.mjs \
  fsi-app/scripts/lib/institution-key.test.mjs \
  fsi-app/scripts/lib/liveness.selftest.mjs \
  fsi-app/scripts/lib/reachability.selftest.mjs \
  fsi-app/scripts/lib/revalidate.test.mjs \
  fsi-app/scripts/lib/run-artifact.test.mjs \
  fsi-app/scripts/harness-runs/*.test.mjs \
  fsi-app/scripts/lib/verification-decision.selftest.mjs \
  fsi-app/scripts/lib/verify.selftest.mjs \
  fsi-app/scripts/verify/*.test.mjs \
  fsi-app/scripts/verify/lib/*.test.mjs \
  fsi-app/scripts/gen/*.test.mjs \
  fsi-app/scripts/maintenance/*.test.mjs \
  fsi-app/scripts/maintenance/lib/*.test.mjs \
  fsi-app/scripts/mint/*.test.mjs \
  fsi-app/scripts/mint/lib/*.test.mjs \
  fsi-app/scripts/review/*.test.mjs \
  fsi-app/scripts/review/lib/*.test.mjs \
  fsi-app/scripts/turns/*.test.mjs \
  fsi-app/scripts/forward-events/*.test.mjs \
  fsi-app/scripts/obligations/*.test.mjs \
  fsi-app/scripts/classification/*.test.mjs \
  fsi-app/scripts/connections/*.test.mjs \
  fsi-app/scripts/producers/*/*.test.mjs \
  fsi-app/scripts/entities/*.test.mjs \
  fsi-app/scripts/sources/*.test.mjs \
  fsi-app/src/__tests__/*.test.mjs \
  fsi-app/src/lib/credibility/*.test.mjs \
  fsi-app/src/lib/sources/*.test.mjs \
  fsi-app/src/lib/sources/classify-source-role.selftest.mjs \
  fsi-app/src/lib/sources/instrument-identity.selftest.mjs \
  fsi-app/src/lib/coverage/*.test.mjs \
  fsi-app/src/lib/d3/*.selftest.mjs \
  fsi-app/src/lib/tier-labels.test.mjs \
  fsi-app/src/lib/tier-badge-tone.test.mjs \
  fsi-app/src/lib/coverage-gaps-rollup.test.mjs \
  fsi-app/src/lib/list-pagination.test.mjs \
  fsi-app/src/lib/supabase-server-domain-scope.test.mjs \
  fsi-app/src/lib/bootstrap/*.test.mjs \
  fsi-app/src/lib/watchlist/*.test.mjs \
  fsi-app/src/lib/detail/*.test.mjs \
  fsi-app/src/components/community/*.test.mjs \
  fsi-app/src/components/shell/*.test.mjs \
  fsi-app/src/lib/workspace/*.test.mjs \
  fsi-app/src/lib/connections/*.test.mjs \
  fsi-app/src/lib/forward-events/*.test.mjs \
  fsi-app/src/lib/obligations/*.test.mjs \
  fsi-app/src/lib/classification/*.test.mjs \
  fsi-app/src/components/dashboard/*.test.mjs \
  fsi-app/src/components/research/*.test.mjs \
  fsi-app/src/lib/operations/*.test.mjs \
  fsi-app/src/lib/market/*.test.mjs \
  fsi-app/src/lib/figures/*.test.mjs \
  fsi-app/src/lib/entities/*.test.mjs \
  fsi-app/src/lib/intake/*.test.mjs \
  fsi-app/src/lib/agent/*.test.mjs \
  fsi-app/src/lib/auth/*.test.mjs \
  fsi-app/src/lib/llm/*.test.mjs \
  fsi-app/src/lib/text/*.test.mjs \
  fsi-app/src/lib/telemetry/*.test.mjs \
  fsi-app/src/lib/health/*.test.mjs \
  fsi-app/src/lib/propagation/*.test.mjs \
  fsi-app/src/lib/propagation/methods/*.test.mjs \
  fsi-app/src/lib/spec09/*.test.mjs \
  fsi-app/scripts/spec09/*.test.mjs \
  fsi-app/src/lib/community/*.test.mjs \
  fsi-app/scripts/community/*.test.mjs
