#!/usr/bin/env bash
# deliver-artifact-branch.sh — the ONE delivery step both runtime workflows (corpus-turn.yml,
# source-sweep.yml) end with: open a PR from the just-pushed artifact branch to master, and when the
# repository refuses ("GitHub Actions is not permitted to create or approve pull requests" — the
# Settings → Actions → General → Workflow permissions checkbox is off), record the branch on ONE tracked
# issue instead of failing the run.
#
# WHY NOT FAIL. Every runtime run on 2026-09-01 (corpus-turn #3, source-sweep #1–#5) did its real work —
# database writes through the guarded path, the harness artifact committed and pushed — and then went
# red on this one step, which cannot succeed on this repository until the operator flips the setting.
# A run that reports FAILED for a delivery it was never permitted to do is a gate that cries wolf: the
# operator received a failure email per run and could not tell a broken walk from a refused PR. The
# outcome is now honest: green run, a ::warning:: annotation, the step summary, and the branch + compare
# URL appended to a single issue that stays open until the branches are landed by hand. If the operator
# enables the setting, the PR opens and none of the fallback runs.
#
# Usage: deliver-artifact-branch.sh <branch> <pr-title> <pr-body-file>
# Requires: GH_TOKEN with contents:write, pull-requests:write, issues:write; GITHUB_REPOSITORY; gh CLI.
set -u

branch="$1"
title="$2"
body_file="$3"
repo="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY must be set}"
compare_url="https://github.com/${repo}/compare/master...${branch}?expand=1"
ISSUE_TITLE="Runtime artifact branches awaiting a hand-opened PR"

existing="$(gh pr list --repo "$repo" --base master --head "$branch" --json number --jq '.[0].number' 2>/dev/null || true)"
if [ -n "$existing" ]; then
  echo "PR #$existing already open for $branch — nothing to do."
  exit 0
fi

if pr_out="$(gh pr create --repo "$repo" --base master --head "$branch" --title "$title" --body-file "$body_file" 2>&1)"; then
  echo "$pr_out"
  echo "Opened a PR for $branch" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
  exit 0
fi

echo "$pr_out"
if ! printf '%s' "$pr_out" | grep -qi "not permitted to create or approve pull requests"; then
  # A DIFFERENT failure (network, auth, bad base) — that one IS a run failure; say so and stop.
  echo "::error::gh pr create failed for a reason other than the repository's PR-permission setting; see the output above."
  exit 1
fi

# The known, operator-side refusal. File the branch on the tracked issue and finish green.
issue="$(gh issue list --repo "$repo" --state open --search "\"$ISSUE_TITLE\" in:title" --json number,title \
  --jq "map(select(.title == \"$ISSUE_TITLE\")) | .[0].number" 2>/dev/null || true)"
comment="$(printf '**%s** — pushed by run %s (%s). Open the PR: %s\n\nLands once merged: the run artifact(s) under `scripts/harness-runs/`. Enable *Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests* and future runs open their own PR.' \
  "$branch" "${GITHUB_RUN_ID:-?}" "${GITHUB_WORKFLOW:-?}" "$compare_url")"
if [ -z "$issue" ]; then
  issue_body="$(printf 'Runtime workflows (corpus-turn, source-sweep) push their harness-run artifact to a branch and try to open a PR. This repository refuses PR creation by GitHub Actions (Settings → Actions → General → Workflow permissions → "Allow GitHub Actions to create and approve pull requests" is off), so each such branch is listed here instead, one comment per run, until a person opens and merges its PR.\n\nEnable the setting and this issue stops growing; close it once every listed branch is merged or deleted.\n\nFirst entry:\n\n%s' "$comment")"
  issue_url="$(gh issue create --repo "$repo" --title "$ISSUE_TITLE" --body "$issue_body" 2>&1)" || {
    echo "$issue_url"
    echo "::error::Could not create the tracking issue either (does the workflow grant issues: write?). The branch IS pushed: $compare_url"
    exit 1
  }
  echo "Tracking issue created: $issue_url"
else
  gh issue comment "$issue" --repo "$repo" --body "$comment" >/dev/null 2>&1 || {
    echo "::error::Could not comment on tracking issue #$issue. The branch IS pushed: $compare_url"
    exit 1
  }
  echo "Recorded on tracking issue #$issue"
fi

echo "::warning::PR creation refused by the repository setting; $branch is pushed and recorded on the tracking issue. Open it by hand: $compare_url"
{
  echo "### Artifact branch awaiting a PR"
  echo ""
  echo "PR creation is refused on this repository (Actions setting). The branch is pushed: [$branch]($compare_url)."
} >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
exit 0
