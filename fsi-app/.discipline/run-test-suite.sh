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
# RENAME CONVENTION, NOT A NAMED LIST (plan 6.8, Rule A, lane N1, replacing the 2026-08-11 named-file
# exclusions this comment used to carry). Every entry below is now a DIRECTORY GLOB (dir/*.test.mjs,
# dir/*.selftest.mjs); nothing is hand-listed by filename any more, so two lanes adding a test in the
# same directory add two files, never two edits to the same shared line.
#
# A test that reaches an npm package (directly or TRANSITIVELY through a helper) still cannot run in
# this no-npm job, so it carries `.npmtest.mjs` instead of `.test.mjs`/`.selftest.mjs` and is therefore
# NOT matched by any glob here, by construction: a glob for a suffix simply does not match a different
# suffix. It runs instead in discipline.yml's "App unit tests requiring npm deps" step, AFTER `npm ci`,
# via that step's own `git ls-files 'fsi-app/**/*.npmtest.mjs'` glob. Nine files moved onto this suffix
# in the same lane that introduced it here (batch-primitives, pg-conn, decision-anchors, drift-check,
# exclusion-audit, inconclusive-probe, surface-registry under scripts/lib/, reconcile under
# src/lib/sources/, layout-guard under .discipline/rendering/layout-guard/) so that renaming, not a
# second named list, is what keeps an npm-dependent test out of this job.
#
# ONE DIRECTORY STAYS A NAMED LIST: src/lib/sources/{classify-source-role,instrument-identity}.selftest.mjs.
# That same directory also holds institution.selftest.mjs and source-growth.selftest.mjs, which need
# jiti (an npm package) and are execution-wired instead as F10 fitness sentinels, never through this
# suite; they are outside this lane's nine-file rename list, so a `src/lib/sources/*.selftest.mjs` glob
# here would silently pull them into this no-npm job and fail glob-portability's transitive check. This
# is the one glob-portability/no-npm-ci class this lane could not convert; see its report for detail.
#
# UNRUN-PROOF BACKSTOP (2026-08-11, operator wiring census, kept): coverage-scan's ORPHANED-PROOF check
# (F23, ratcheted at 0) still fails the build the moment any tracked proof stops being executed by a
# runner, so a proof this lane's rename or glob change accidentally drops out of every surface is caught
# there, not by a human re-reading this file.
#
# APP TESTS JOIN BY CONSTRUCTION (red-merge-class fix, dispatch 2026-07-08, kept): the src/** entries are
# directory globs, so dropping a *.test.mjs into a covered directory runs it in pre-push AND CI without
# an edit here.
set -eu
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || (cd "$(dirname "$0")/../.." && pwd))"
cd "$ROOT"

# shellcheck disable=SC2046  # intentional glob/word-split of the test list
node --test \
  fsi-app/.discipline/*.test.mjs \
  fsi-app/.discipline/hooks/*.test.mjs \
  .claude/hooks/*.test.mjs \
  fsi-app/.discipline/lib/*.test.mjs \
  fsi-app/.discipline/rules/*.test.mjs \
  fsi-app/.discipline/consistency/*.test.mjs \
  fsi-app/.discipline/consistency/checks/*.test.mjs \
  fsi-app/.discipline/governance/*.test.mjs \
  fsi-app/.discipline/rendering/*.test.mjs \
  fsi-app/.discipline/rendering/audit/*.test.mjs \
  fsi-app/.discipline/rendering/smoke/*.test.mjs \
  fsi-app/.discipline/dispatch/*.test.mjs \
  fsi-app/.discipline/fitness/*.test.mjs \
  fsi-app/.discipline/fitness/functions/*.test.mjs \
  fsi-app/scripts/lib/*.test.mjs \
  fsi-app/scripts/lib/*.selftest.mjs \
  fsi-app/scripts/harness-runs/*.test.mjs \
  fsi-app/scripts/verify/*.test.mjs \
  fsi-app/scripts/verify/lib/*.test.mjs \
  fsi-app/scripts/gen/*.test.mjs \
  fsi-app/scripts/inventories/*.test.mjs \
  fsi-app/scripts/maintenance/*.test.mjs \
  fsi-app/scripts/maintenance/lib/*.test.mjs \
  fsi-app/scripts/mint/*.test.mjs \
  fsi-app/scripts/mint/lib/*.test.mjs \
  fsi-app/scripts/review/*.test.mjs \
  fsi-app/scripts/review/lib/*.test.mjs \
  fsi-app/scripts/turns/*.test.mjs \
  fsi-app/scripts/turns/record-briefs/*.test.mjs \
  fsi-app/scripts/forward-events/*.test.mjs \
  fsi-app/scripts/obligations/*.test.mjs \
  fsi-app/scripts/classification/*.test.mjs \
  fsi-app/scripts/connections/*.test.mjs \
  fsi-app/scripts/producers/*/*.test.mjs \
  fsi-app/scripts/entities/*.test.mjs \
  fsi-app/scripts/sources/*.test.mjs \
  fsi-app/scripts/propagation/*.test.mjs \
  fsi-app/scripts/_worklists/*.test.mjs \
  fsi-app/src/__tests__/*.test.mjs \
  fsi-app/src/lib/*.test.mjs \
  fsi-app/src/lib/credibility/*.test.mjs \
  fsi-app/src/lib/sources/*.test.mjs \
  fsi-app/src/lib/sources/classify-source-role.selftest.mjs \
  fsi-app/src/lib/sources/instrument-identity.selftest.mjs \
  fsi-app/src/lib/coverage/*.test.mjs \
  fsi-app/src/lib/d3/*.selftest.mjs \
  fsi-app/src/lib/db/*.test.mjs \
  fsi-app/src/lib/perf/*.test.mjs \
  fsi-app/src/lib/bootstrap/*.test.mjs \
  fsi-app/src/lib/watchlist/*.test.mjs \
  fsi-app/src/lib/detail/*.test.mjs \
  fsi-app/src/lib/dashboard/*.test.mjs \
  fsi-app/src/lib/url-params/*.test.mjs \
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
  fsi-app/src/lib/agent/formats/*.test.mjs \
  fsi-app/src/lib/auth/*.test.mjs \
  fsi-app/src/app/api/auth/linkedin/start/*.test.mjs \
  fsi-app/src/lib/llm/*.test.mjs \
  fsi-app/src/lib/text/*.test.mjs \
  fsi-app/src/lib/telemetry/*.test.mjs \
  fsi-app/src/lib/health/*.test.mjs \
  fsi-app/src/lib/propagation/*.test.mjs \
  fsi-app/src/lib/propagation/methods/*.test.mjs \
  fsi-app/src/lib/spec09/*.test.mjs \
  fsi-app/scripts/spec09/*.test.mjs \
  fsi-app/scripts/spec09/lib/*.test.mjs \
  fsi-app/src/lib/community/*.test.mjs \
  fsi-app/scripts/community/*.test.mjs

# Standing rule 14 (docs/CLAUDE.md): every finding in docs/audits/ carries an explicit verification-status
# token. Report-only here (the script's own designed default — a historical backlog of unlabeled findings
# predates the rule and relabeling it is a distinct workstream, not a "small follow-up" to this wiring
# lane's own diff) so this stays a visible signal rather than blocking every push on old debt; pass
# --strict once the backlog is labeled, per the script's own header. Never previously run by anything —
# lane W71-A, 2026-09-05, docs/plans/complete-system-build-plan-2026-09-04.md §W7.
node fsi-app/scripts/verify/audit-finding-status.mjs || true
