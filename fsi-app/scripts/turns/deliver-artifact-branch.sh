#!/usr/bin/env bash
# deliver-artifact-branch.sh -- lands every harness-run artifact this job's own runner just wrote to disk
# straight into the `harness_runs` table (migration 331) via `scripts/lib/record-harness-run.mjs`.
#
# REWRITTEN AGAIN (lane STATUTORY-WRITER, 2026-09-29, coordinator finding on PR #824, propagation-drain
# run 36534640498, "artifact commit does not rebase onto origin/master"). The PRIOR rewrite (lane
# HARNESS-LANDING, 2026-09-27) already removed the PR-open path, but every calling workflow still ran a
# full checkout-a-branch / git commit / `git fetch --depth=50 origin master` / `git rebase` / `git push`
# dance BEFORE calling this script, and discovered the artifact via `git diff --name-only --relative
# origin/master...HEAD` -- a rebase against origin/master that FAILS outright on a shallow checkout
# (`actions/checkout@v4`'s default `fetch-depth: 1`, no real history to rebase onto). #812 (gate-a-rescan)
# and #819 (maintenance) each independently found and fixed the shallow-checkout half of this in their OWN
# workflow file (`fetch-depth: 0`) -- but the branch/commit/rebase/push dance ITSELF was never the point
# once artifact landing became a DB write, not a branch merge: this file's own 2026-09-27 header already
# called the branch push "now REDUNDANT." Removed for real this time, in every calling workflow: no git
# add, no branch, no commit, no fetch, no rebase, no push, no PR, anywhere in this pipeline. Operator
# ruling, 2026-09-26, restated here because it is the reason none of this exists any more: "I've been
# building this for six months and not once that I need a pull request from GitHub."
#
# NEW DISCOVERY, no git history needed at all: `git status --porcelain` over
# `scripts/harness-runs/*/*-run-*.json` finds every artifact file THIS JOB's own harness-family runner(s)
# wrote to disk (always untracked -- nothing is ever committed), across every family a single job step may
# have produced one for (maintenance.yml runs several families per job; this scan is family-agnostic by
# design, matching the pathspec every caller already scoped its old `git diff`/`git add` to). Works
# identically on a depth-1 shallow checkout, because it never reads git history at all.
#
# Usage: deliver-artifact-branch.sh <label>
#   <label> is used for logging only (the run's own artifact JSON already carries harness_family/run_id/
#   trigger; nothing here needs to re-derive them).
# Requires: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (best-effort via record-harness-run.mjs:
# missing creds log and exit 0, never fail the run).
set -u

label="${1:-artifact}"

echo "deliver-artifact-branch: landing this run's harness-run artifact(s) ($label) into harness_runs, no git commit/branch/push (see this script's header)."

# REPO-ROOT-RELATIVE OUTPUT, CONFIRMED LIVE (lane STATUTORY-WRITER, 2026-09-29, propagation-drain run
# 36538491130): `git status --porcelain` output was assumed cwd-relative when this script always runs
# from fsi-app/ (git's own documented default, "relative to the current directory unless
# status.relativePaths is false"). That assumption was WRONG in this repo's actual CI runners: the real
# dispatch printed "fsi-app/scripts/harness-runs/statutory/statutory-run-001.json" while running FROM
# fsi-app/, so record-harness-run.mjs's own `--file` open failed with ENOENT (fsi-app/fsi-app/...) --
# harmless there only because write-statutory.mjs's own runWriter() had ALREADY landed that exact row
# directly (see that file's own harness-record wiring), but this SAME bug meant the propagation family's
# own artifact (propagation-run-009.json) never landed at all that run -- a real miss, not a redundant
# retry. This is the identical repo-root-vs-cwd asymmetry this script's PRIOR version already worked
# around for `git diff --name-only` (that one needed an explicit `--relative` flag; apparently this repo's
# git/CI environment applies the same repo-root-relative default to `git status --porcelain` too, contrary
# to git's own documented default -- an environment quirk, not documented git behavior, so this fix
# computes and strips the ACTUAL prefix rather than hardcoding "fsi-app/"). `git rev-parse --show-prefix`
# always reports cwd's own path relative to the repo root (empty string when cwd IS the root), which is
# the correct thing to strip regardless of which of the two relative conventions git's `status` output
# happens to be using in a given environment.
CWD_PREFIX="$(git rev-parse --show-prefix 2>/dev/null || true)"

# REWRITTEN (lane HARNESS-RUN-NUMBER, 2026-09-29, coordinator finding on GitHub run 36610847827):
# record-harness-run.mjs no longer always exits 0 (see that file's own header) -- it now exits 0 only on
# a confirmed landed row, 2 on a missing credential (self-skip, never a failure), and 1 for any other
# real failure (bad usage, an unreadable/unparseable artifact, or the insert itself failing for a reason
# that isn't a missing credential -- most commonly a duplicate-key collision the OLD claim-then-write
# path could produce silently). The exit code is now the primary, trusted signal; the "landed <id>" grep
# stays as a belt-and-suspenders confirmation on the success path only (defense in depth against a node
# process that somehow exits 0 without actually inserting), never as a substitute for checking the code
# the way the pre-2026-09-29 version did.
landed=0
skipped=0
failed=0
while IFS= read -r raw_path; do
  [ -z "$raw_path" ] && continue
  path="$raw_path"
  if [ -n "$CWD_PREFIX" ] && [ "${path#"$CWD_PREFIX"}" != "$path" ]; then
    path="${path#"$CWD_PREFIX"}"
  fi
  echo "deliver-artifact-branch: recording $path"
  out="$(node scripts/lib/record-harness-run.mjs --file "$path" 2>&1)"
  status=$?
  echo "$out"
  if [ $status -eq 0 ] && printf '%s' "$out" | grep -q '^record-harness-run: landed '; then
    landed=$((landed + 1))
  elif [ $status -eq 2 ]; then
    skipped=$((skipped + 1))
    echo "::warning::deliver-artifact-branch: record-harness-run.mjs self-skipped $path (no credentials) -- not landed, not a failure"
  else
    failed=$((failed + 1))
    echo "::error::deliver-artifact-branch: record-harness-run.mjs failed to land $path (exit $status) -- this run's own artifact is not recorded"
  fi
# `git status --porcelain --untracked-files=all -- <pathspec>` runs from CWD (this script always runs
# from fsi-app/, matching every caller workflow's working-directory) and reports paths RELATIVE TO CWD,
# not the repo root, unlike `git diff --name-only`, which needed `--relative` to get the same shape (see
# this file's own prior header for the live incident that taught that lesson; porcelain status has always
# reported cwd-relative paths, so no equivalent flag is needed here). Porcelain v1 format is exactly
# `XY<space>PATH` (two status characters, one space, then the path); `cut -c4-` takes everything from the
# 4th character on, which is the path, for both an untracked ("??") and a modified (" M") entry alike,
# this repo's own harness-run convention never modifies an existing artifact file in place
# (`writeRunArtifact` refuses to overwrite one without an explicit opt-in), so every real hit here is "??".
# `:(glob)` pathspec magic (lane STATUTORY-WRITER, 2026-09-29, same live dispatch as the CWD_PREFIX fix
# above): a PLAIN git pathspec's `*` matches ACROSS `/` (unlike a shell glob), so the un-magic'd pattern
# also matched e.g. "propagation/traces/propagation-run-009.report.json" -- a nested trace file, not a
# top-level run artifact -- and this script tried (and, correctly, failed) to land it as one. `:(glob)`
# makes `*` behave like a normal shell glob (never crosses `/`), restricting the match to exactly one
# directory level under scripts/harness-runs/, the shape every real run artifact actually has.
done < <(git status --porcelain --untracked-files=all -- ':(glob)scripts/harness-runs/*/*-run-*.json' 2>/dev/null | cut -c4-)

echo "deliver-artifact-branch: landed=$landed failed=$failed skipped=$skipped"
{
  echo "### Harness-run artifact landing"
  echo ""
  echo "Landed $landed artifact row(s) into \`harness_runs\` (migration 331). $failed row(s) FAILED to land (see errors above -- this step now fails when \$failed > 0, lane HARNESS-RUN-NUMBER 2026-09-29). $skipped row(s) self-skipped (no credentials routed to this job)."
} >> "${GITHUB_STEP_SUMMARY:-/dev/null}"

# FAIL LOUD (lane HARNESS-RUN-NUMBER, 2026-09-29, CLAUDE.md rule 15/17): a landing that does not land now
# fails this step, so a real insert failure surfaces as a red CI check instead of a silent SUCCESS. A
# self-skip (missing credentials, counted in $skipped, never in $failed) is NOT a failure -- see this
# script's header and record-harness-run.mjs's own exit-code contract.
if [ "$failed" -gt 0 ]; then
  exit 1
fi
exit 0
