#!/usr/bin/env bash
# deliver-artifact-branch.sh -- the ONE delivery step every harness-family workflow calls after
# committing its own run artifact(s). REWRITTEN (lane HARNESS-LANDING, 2026-09-27, operator ruling: "yes
# supabase but do not reinvent processes, look at what has already been built"). The OLD behavior (push
# a branch, try `gh pr create`, fall back to commenting on tracking issue #520 when Actions is refused
# PR creation -- see docs/ops/session-log.d/2026-09-26-harness-landing.md) is REMOVED: it left 39
# branches stranded across 5 families with no automated landing path, because GitHub Actions on this
# repository cannot create or approve PRs, permanently, by operator ruling (2026-09-26: "I've been
# building this for six months and not once that I need a pull request from GitHub").
#
# NEW behavior: land each harness-run artifact this commit added straight into the `harness_runs` table
# (migration 331) via the guarded writer `scripts/lib/record-harness-run.mjs`, the SAME best-effort
# posture `brief_apply_runs`'s writer already uses (recordApplyRunStart: a plain insert, exempt from
# rule 015 because it is additive, never a mutation). No branch, no PR, no issue.
#
# Call signature is UNCHANGED (`<branch> <title> <body_file>`) so no `.github/workflows/*.yml` file
# needs editing for this lane: every caller still runs `git push origin HEAD:"$branch"` immediately
# before this script (a residual from the old design -- the branch push is now REDUNDANT since landing
# is a DB write, not a branch merge; removing that push step is a follow-up lane's workflow-file edit,
# out of this lane's scope). `title`/`body_file` are accepted for logging continuity only; no PR is ever
# opened from them.
#
# Usage: deliver-artifact-branch.sh <branch> <title> <body-file>
# Requires: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (best-effort: missing creds log and
# exit 0, never fail the run -- see record-harness-run.mjs's own header).
set -u

branch="$1"
title="$2"
body_file="${3:-}"

echo "deliver-artifact-branch: landing this run's harness-run artifact(s) into harness_runs (branch ${branch:-?} pushed by the caller is now a redundant residual, see this script's header)."
if [ -n "$body_file" ] && [ -f "$body_file" ]; then
  echo "--- run context ($title) ---"
  cat "$body_file"
fi

git fetch --no-tags --depth=50 origin master >/dev/null 2>&1 || true

landed=0
failed=0
while IFS= read -r path; do
  [ -z "$path" ] && continue
  echo "deliver-artifact-branch: recording $path"
  if node scripts/lib/record-harness-run.mjs --file "$path"; then
    landed=$((landed + 1))
  else
    # record-harness-run.mjs itself is best-effort and exits 0 even on failure; a nonzero exit here
    # means the node process itself couldn't run (missing node, syntax error) -- log, never fail the run.
    failed=$((failed + 1))
    echo "::warning::deliver-artifact-branch: record-harness-run.mjs did not run cleanly for $path (best-effort, continuing)"
  fi
# Pathspec is relative to CWD (this script always runs from fsi-app/, matching every caller workflow's
# working-directory) -- a leading '**/' here does NOT match a zero-depth path even under glob pathspec
# magic (verified live, lane HARNESS-LANDING: the first real dispatch, gate-a-rescan run 36435442672,
# landed=0 with the '**/'-prefixed form even though the artifact file existed in the diff -- confirmed by
# testing both forms against that run's own pushed branch). No leading '**/' needed since the path is
# never nested under an extra nonexistent nesting level from here.
done < <(git diff --name-only origin/master...HEAD -- 'scripts/harness-runs/*/*-run-*.json' 2>/dev/null)

echo "deliver-artifact-branch: landed=$landed failed=$failed"
{
  echo "### Harness-run artifact landing"
  echo ""
  echo "Landed $landed artifact row(s) into \`harness_runs\` (migration 331). $failed row(s) could not be recorded (best-effort, logged above)."
} >> "${GITHUB_STEP_SUMMARY:-/dev/null}"

exit 0
