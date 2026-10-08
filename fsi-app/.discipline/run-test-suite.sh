#!/bin/sh
# THE canonical discipline unit-test suite - the SINGLE entrypoint invoked by BOTH the CI "Discipline engine
# unit tests" job (.github/workflows/discipline.yml) AND the pre-push hook (step 3). Parity by construction:
# both call this ONE script, so pre-push and CI can never silently drift.
#
# Why this exists (operator ruling 2026-07-04): the pre-push list and the CI list had drifted - pre-push was
# MISSING glob-portability.test.mjs, so a non-portable `@/` import in a discipline-glob test passed locally
# and only reddened in CI. Two-homes class (4th instance: surface_of, authorityFloorFor, url-canon, the test
# list). One home now.
#
# NO fast/full tiers: the full suite measures well under the ~90s pre-push budget, so pre-push runs the
# SAME full suite CI runs, pure parity. (If it ever exceeds ~90s, a derived fast subset may be added with
# the omitted set NAMED here, per the operator's ruling, not silently.)
#
# Runs WITHOUT npm ci (mirrors the CI job): every discovered test MUST import only node: builtins + relative
# .mjs (Node 24 type-stripping makes relative .ts imports portable too). A test that reaches an npm package
# (directly or transitively through a helper) cannot run in this no-npm job, so it carries `.npmtest.mjs`
# instead of `.test.mjs`/`.selftest.mjs` and is therefore never discovered here, by construction: a suffix
# match does not match a different suffix. It runs instead in discipline.yml's "App unit tests requiring npm
# deps" step, AFTER `npm ci`, via that step's own `git ls-files 'fsi-app/**/*.npmtest.mjs'` glob.
#
# DISCOVERY BY CONSTRUCTION, NOT A HAND-KEPT LIST (lane T3, 2026-09-20, replacing the ~sixty-line
# directory-glob list this file carried from 2026-07-04 through 2026-09-20, itself a replacement for an
# earlier named-file list per the 2026-07-04 ruling above). That glob list was the one registry plan 6.8
# left as a LIST: a lane adding a test in a never-before-seen directory added no glob for it, and F23
# (governed-surface-coverage, ORPHANED PROOF, ratcheted at 0) correctly failed the push gate, twice in one
# day, 2026-09-20 (lane M7a's `src/app/api/admin/statutory-rows/`, lane M9d's `scripts/producers/*.test.mjs`
# one level above the covered `producers/*/` glob). The file list below is now COMPUTED, every run, by
# `fsi-app/.discipline/lib/test-discovery.mjs` from `git ls-files`, see that module's header for the exact
# scope (every tracked `*.test.mjs` under `fsi-app/` and `.claude/hooks/`, full generality, any depth; plus
# `*.selftest.mjs` under the two directories it has always covered, `scripts/lib/`, `src/lib/d3/`, plus
# the one directory that stays a NAMED PAIR by design, `src/lib/sources/{classify-source-role,
# instrument-identity}.selftest.mjs`, because that same directory also holds `institution.selftest.mjs` and
# `source-growth.selftest.mjs`, which need jiti and are execution-wired instead as F10/F11 fitness
# sentinels, never through this suite). `fsi-app/.discipline/governance/execution-wiring.mjs`'s Surface 1
# imports the SAME `discoverTests()` function to compute what CI actually runs, so this script and the
# execution-wiring resolver can never drift from each other either.
#
# KNOWN CONSEQUENCE, NOT THIS LANE'S TO FIX (lane T3 brief, 2026-09-20): `fsi-app/.discipline/
# glob-portability.test.mjs` reads its OWN source-of-truth by regex-parsing literal `dir/*.test.mjs`
# tokens out of this file's text. With the glob list replaced by a call to test-discovery.mjs below,
# there are no such literal tokens left, and glob-portability's `testGlobFromSuite()` now resolves to an
# empty list, see this lane's report for the exact failing assertions. glob-portability.test.mjs is
# outside this lane's write set; the coordinator's separate lane for it should point `testGlobFromSuite()`
# at `discoverTests()` from `fsi-app/.discipline/lib/test-discovery.mjs` instead of parsing this file's text.
#
# UNRUN-PROOF BACKSTOP (2026-08-11, operator wiring census, kept): coverage-scan's ORPHANED-PROOF check
# (F23, ratcheted at 0) still fails the build the moment any tracked proof stops being executed by a
# runner, so a proof a future discovery-scope change accidentally drops out of every surface is caught
# there, not by a human re-reading this file.
set -eu
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || (cd "$(dirname "$0")/../.." && pwd))"
cd "$ROOT"

# TREE-CLEAN (lane TESTFIX-1, 2026-10-08, CLAUDE.md rule 15): record the working-tree status now, compare at
# the end. No test may leave a file behind or modify a tracked one; hooks/lib/tree-clean.sh is the ONE home
# of the check (the npm-deps suite, run-npmtest-suites.sh, calls the same two lines). Relative to the start,
# so a developer's own uncommitted work never reddens a local run.
TREE_CLEAN="fsi-app/.discipline/hooks/lib/tree-clean.sh"
TREE_SNAPSHOT="$(mktemp)"
trap 'rm -f "$TREE_SNAPSHOT" "$TREE_SNAPSHOT.now"' EXIT
sh "$TREE_CLEAN" snapshot "$TREE_SNAPSHOT"

DISCOVERY="fsi-app/.discipline/lib/test-discovery.mjs"

# Fail loud on an empty discovery result (a broken `git ls-files` or a scope regression) instead of
# silently invoking `node --test` with zero arguments, which would fall back to node's own default test
# discovery convention rather than this suite's scope.
DISCOVERED_LIST="$(node "$DISCOVERY")"
if [ -z "$DISCOVERED_LIST" ]; then
  echo "run-test-suite: discovered ZERO test files (standing red), see $DISCOVERY" >&2
  exit 1
fi
DISCOVERED_COUNT="$(printf '%s\n' "$DISCOVERED_LIST" | wc -l | tr -d ' ')"
echo "run-test-suite: discovered $DISCOVERED_COUNT test files"

# NOTE for a local run before `git add`: discovery reads the COMMITTED tree (`git ls-files`), so a
# brand-new test file you have not yet staged will not appear here even though it exists on disk. The
# pre-push gate runs on committed trees, so this is correct for the gate; it just means a local
# `bash run-test-suite.sh` run before staging a new test will not include it.
#
# CI-PARITY SANDBOX (lane CI-PARITY, 2026-09-28, [CONFIRMED] replaying CI runs 36450339377 /
# 36452918342 / 36457254250 / 36459142897 / 36461566541 / 36463279310 on branch
# lane/quarantine-disposition): CI's "Discipline engine unit tests" job never runs `npm ci`, so
# fsi-app/node_modules genuinely does not exist there. Locally, node_modules ALWAYS resolves (the main
# checkout's own install, or a linked worktree's shared link -- worktree-node-modules.sh, RD-85), so a
# `.test.mjs`/`.selftest.mjs` file wrongly carrying an npm import (should have been `.npmtest.mjs` --
# see test-discovery.mjs's header) passed here every time and only reddened on GitHub. `--import
# fsi-app/.discipline/lib/no-npm-sandbox.mjs` makes THIS invocation of `node --test` structurally unable
# to resolve an npm package (CJS require and ESM import both blocked), regardless of what node_modules
# happens to exist, so the two surfaces cannot silently disagree again -- see that file's header for the
# full mechanism and the replay evidence.
# CI-PARITY ENVIRONMENT (same lane): CI's job sets no database credential and has no fsi-app/.env.local.
# Locally the main checkout HAS one, and a developer shell may export credentials, so a test could see
# credentials here that it never sees in CI. Unset scripts/lib/env-file.mjs's CREDENTIAL_VARS (the ONE
# list, read from that module, never copied here) and set its ONE switch, FSI_NO_ENV_FILE=1, for this
# suite only. In CI both are no-ops, so this changes nothing there and removes the difference here.
CREDENTIAL_VARS="$(node --input-type=module -e "const m = await import('./fsi-app/scripts/lib/env-file.mjs'); console.log(m.CREDENTIAL_VARS.join(' '))")"
if [ -z "$CREDENTIAL_VARS" ]; then
  echo "run-test-suite: could not read CREDENTIAL_VARS from fsi-app/scripts/lib/env-file.mjs" >&2
  exit 1
fi
for v in $CREDENTIAL_VARS; do unset "$v"; done
export FSI_NO_ENV_FILE=1

# `./`-prefixed relative path (not "$ROOT/..."): Node's --import resolves its argument through the same
# ESM resolver as an import statement, which treats a bare (no "./"/"/" prefix) specifier as a package
# name, and an absolute Windows path (C:\...) as an unsupported URL scheme rather than a file path.
# run-test-suite.sh has already `cd`ed to $ROOT above, so a `./`-relative path is unambiguous and
# portable across POSIX and Windows (Git Bash / MSYS) alike.
#
# RUNNER (lane R6-8, 2026-10-01, CF-SEC-11's runner half -- see F65-no-bracket-path-tests.mjs's header
# for the full defect and reproduction): a bare `xargs -0 node --test` invocation re-parses every
# already-resolved file path through Node's own CLI glob matcher, which silently drops any path
# carrying a literal "["/"]" segment (an app-router [param]/ directory, most commonly) -- "tests 0", no
# error. `run-explicit-tests.mjs` uses node:test's PROGRAMMATIC `run({ files })` API instead, whose
# `files` option is a literal array, never re-parsed as a glob; the same `--import` sandbox flag is
# passed through via `execArgv` (after the `--` separator), same per-file process isolation as before.
# A red suite still gets the tree-clean verdict below (a failing test is the likeliest one to leave a file
# behind), so the exit status is carried to the end instead of ending the script here under `set -e`.
SUITE_STATUS=0
node "$DISCOVERY" --print0 | node "./fsi-app/.discipline/lib/run-explicit-tests.mjs" -- --import "./fsi-app/.discipline/lib/no-npm-sandbox.mjs" || SUITE_STATUS=$?

# Standing rule 14 (docs/CLAUDE.md): every finding in docs/audits/ carries an explicit verification-status
# token. Report-only here (the script's own designed default - a historical backlog of unlabeled findings
# predates the rule and relabeling it is a distinct workstream, not a "small follow-up" to this wiring
# lane's own diff) so this stays a visible signal rather than blocking every push on old debt; pass
# --strict once the backlog is labeled, per the script's own header. Never previously run by anything,
# lane W71-A, 2026-09-05, docs/plans/complete-system-build-plan-2026-09-04.md section W7.
AUDIT_STATUS=0
node fsi-app/scripts/verify/audit-finding-status.mjs --strict || AUDIT_STATUS=$?

# The suite is not green if it left the working tree different from how it found it (lane TESTFIX-1).
TREE_STATUS=0
sh "$TREE_CLEAN" verify "$TREE_SNAPSHOT" || TREE_STATUS=$?

if [ "$SUITE_STATUS" -ne 0 ]; then exit "$SUITE_STATUS"; fi
if [ "$AUDIT_STATUS" -ne 0 ]; then exit "$AUDIT_STATUS"; fi
exit "$TREE_STATUS"
