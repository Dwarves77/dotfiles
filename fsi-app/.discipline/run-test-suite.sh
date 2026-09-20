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
node "$DISCOVERY" --print0 | xargs -0 node --test

# Standing rule 14 (docs/CLAUDE.md): every finding in docs/audits/ carries an explicit verification-status
# token. Report-only here (the script's own designed default - a historical backlog of unlabeled findings
# predates the rule and relabeling it is a distinct workstream, not a "small follow-up" to this wiring
# lane's own diff) so this stays a visible signal rather than blocking every push on old debt; pass
# --strict once the backlog is labeled, per the script's own header. Never previously run by anything,
# lane W71-A, 2026-09-05, docs/plans/complete-system-build-plan-2026-09-04.md section W7.
node fsi-app/scripts/verify/audit-finding-status.mjs || true
