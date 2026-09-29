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

landed=0
failed=0
while IFS= read -r path; do
  [ -z "$path" ] && continue
  echo "deliver-artifact-branch: recording $path"
  # record-harness-run.mjs is best-effort BY DESIGN and always exits 0, even on a read/parse/insert
  # failure (so a DB hiccup never fails the calling workflow step -- see that file's own header). A
  # nonzero exit here means the node PROCESS itself could not run at all (missing node, syntax error),
  # not that the row landed. The real success signal is the "record-harness-run: landed <id>" line it
  # prints on an actual successful insert; capture stdout and grep for that marker rather than trusting
  # the exit code (verified live, lane HARNESS-LANDING: exit 0 was reported for a run whose file could
  # not even be opened -- the exit-code-only counter silently reported landed=1 for zero real inserts).
  out="$(node scripts/lib/record-harness-run.mjs --file "$path" 2>&1)"
  status=$?
  echo "$out"
  if [ $status -eq 0 ] && printf '%s' "$out" | grep -q '^record-harness-run: landed '; then
    landed=$((landed + 1))
  else
    failed=$((failed + 1))
    echo "::warning::deliver-artifact-branch: record-harness-run.mjs did not confirm a landed row for $path (best-effort, continuing)"
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
done < <(git status --porcelain --untracked-files=all -- 'scripts/harness-runs/*/*-run-*.json' 2>/dev/null | cut -c4-)

echo "deliver-artifact-branch: landed=$landed failed=$failed"
{
  echo "### Harness-run artifact landing"
  echo ""
  echo "Landed $landed artifact row(s) into \`harness_runs\` (migration 331). $failed row(s) could not be recorded (best-effort, logged above)."
} >> "${GITHUB_STEP_SUMMARY:-/dev/null}"

exit 0
