#!/usr/bin/env bash
# commit-brief-apply-artifact.sh -- extracted from .github/workflows/brief-apply.yml's own "Commit the
# run artifact back to the dispatched ref" step (task 6.1b fix 5, hardened in fix round 1 finding 1) so
# the push-degradation logic is a shell-level unit the discipline suite can drive directly, not embedded
# YAML nothing exercises before a real dispatch.
#
# THE FIX (review finding 1, Critical): `master` in this repository is branch-protected
# (`enforce_admins.enabled: true`, required status checks) -- once this lane merges, the "dispatched ref"
# for the NEXT brief-apply run is master itself, the normal case, not an edge case. A direct push to a
# protected ref is REFUSED BY DESIGN, every time, not a transient race the retry loop can ever resolve
# into success -- retrying a persistent rejection just fails identically twice. The real per-item work
# (Supabase writes, model spend) already succeeded by the time this step runs; failing the WHOLE RUN on a
# refused push turns a successful, costly apply into a reported CI red, directly against this repo's own
# standing rule (feedback_ci_green_means_github: "push done only when the Actions run on that commit is
# green"). So: a rejected push DEGRADES, it never fails the run. The workflow's own "Upload snapshots, run
# artifact, and run logs" step (already `if: always()`) is the fallback this step degrades to -- the
# artifact still reaches the coordinator, just not auto-landed on the ref.
#
# EXIT CODES:
#   0 -- nothing to commit; OR committed and pushed; OR committed but a protected-ref guard/persistent
#        push rejection means it stays local-plus-uploaded-artifact only (a `::warning::` names why).
#   1 -- ONLY a git error BEFORE the push attempt (the commit itself could not be made). This is the one
#        case that is a genuine tooling failure worth failing the run over.
#
# Usage: commit-brief-apply-artifact.sh <ref-name> <run-id> <artifact-dir>
#   <ref-name>     GITHUB_REF_NAME -- the ref this dispatch checked out (e.g. "master", a lane branch).
#   <run-id>       github.run_id -- used only in the commit message and the warning text.
#   <artifact-dir> the directory to `git add` (scripts/harness-runs/brief-apply/ in production).
set -u

ref_name="${1:?ref-name required}"
run_id="${2:?run-id required}"
artifact_dir="${3:?artifact-dir required}"

git config user.name "github-actions[bot]"
git config user.email "github-actions[bot]@users.noreply.github.com"
git add "$artifact_dir"

if git diff --cached --quiet; then
  echo "No new brief-apply run artifact to commit."
  exit 0
fi

if ! git commit -m "brief-apply: run ${run_id} artifact"; then
  echo "::error::could not commit the brief-apply run artifact (a git error before any push was attempted)."
  exit 1
fi

# Protected-ref guard: never attempt a push a branch-protection rule will refuse by design. Named
# explicitly (never inferred from a push failure) so the log distinguishes "we knew better than to try"
# from "we tried and a rejection came back" -- both degrade the same way, but the first never spends the
# two-attempt retry loop on a push that cannot ever succeed.
if [ "$ref_name" = "master" ]; then
  echo "::warning::brief-apply run artifact committed locally but NOT pushed -- '$ref_name' is branch-protected, so a direct push here is refused by design. The artifact is carried forward only in this run's uploaded workflow artifact (brief-apply-${run_id}); a coordinator lands it by hand (cherry-pick this commit, or copy the JSON) for the next dispatch on '$ref_name' to see it."
  exit 0
fi

pushed=0
for attempt in 1 2; do
  if git pull --rebase origin "$ref_name" && git push origin "HEAD:$ref_name"; then
    pushed=1
    break
  fi
  echo "push attempt $attempt failed -- retrying after a rebase against the current ref."
done

if [ "$pushed" -ne 1 ]; then
  echo "::warning::could not push the brief-apply run artifact to '$ref_name' after 2 attempts. A persistent rejection (branch protection, or any other repeatable refusal) fails identically both times, so this degrades rather than failing the run: the artifact is carried forward only in this run's uploaded workflow artifact (brief-apply-${run_id}); a coordinator lands it by hand."
  exit 0
fi

echo "brief-apply run artifact pushed to '$ref_name'."
exit 0
