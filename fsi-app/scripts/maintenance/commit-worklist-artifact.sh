#!/usr/bin/env bash
# commit-worklist-artifact.sh -- Part 7 tasks 7.1/7.4, fix round 1 (review-7.1-7.4.md finding C,
# Important): commits a modified file-based MAINT worklist artifact (e.g.
# scripts/_worklists/attach-found-sources.seed.json, appended to by resolve-error-body-gate.mjs's own
# apply mode) back to the dispatched ref, so the append survives past the GitHub Actions runner that
# produced it. Modeled on task 6.1b's fsi-app/scripts/turns/commit-brief-apply-artifact.sh (read in full
# for this fix, not copied verbatim) -- same push-degradation shape, generalized to an arbitrary
# artifact path and commit-message label instead of hardcoding brief-apply's own run-artifact directory,
# so any future file-based MAINT artifact needing this durability gets it without a third near-duplicate
# script.
#
# THE FIX THIS MIRRORS (task 6.1b's own header, unchanged reasoning here): `master` in this repository
# is branch-protected -- a direct push to a protected ref is REFUSED BY DESIGN, every time, not a
# transient race a retry can ever resolve into success. So: a rejected push DEGRADES, it never fails the
# run. The real per-item work (the resolve-error-body-gate apply's DB writes) already succeeded by the
# time this step runs; failing the WHOLE RUN on a refused push would turn a successful, costly apply into
# a reported CI red, against this repo's own standing rule (feedback_ci_green_means_github: "push done
# only when the Actions run on that commit is green").
#
# WHY THE FILE, NEVER integrity_flags. read directly off the consumer (review finding C): attach-
# found-sources.mjs takes its worklist ONLY via --arg <path> to a JSON file on disk
# (`readWorklistFile: async (path) => JSON.parse(readFileSync(resolve(fsiRoot(), path), "utf8"))`); it
# has no code path that reads integrity_flags as an input source at all. Committing the FILE back to the
# ref is therefore the only architecturally consistent fix -- there is no "persist a flag row instead"
# alternative for this particular consumer.
#
# EXIT CODES:
#   0 -- nothing to commit; OR committed and pushed; OR committed but a protected-ref guard/persistent
#        push rejection means it stays local-plus-uploaded-artifact only (a `::warning::` names why).
#   1 -- ONLY a git error BEFORE the push attempt (the commit itself could not be made). This is the one
#        case that is a genuine tooling failure worth failing the run over.
#
# Usage: commit-worklist-artifact.sh <ref-name> <run-id> <artifact-path> <commit-label>
#   <ref-name>      GITHUB_REF_NAME -- the ref this dispatch checked out (e.g. "master", a lane branch).
#   <run-id>        github.run_id -- used only in the commit message and the warning text.
#   <artifact-path> the file (or directory) to `git add` (scripts/_worklists/attach-found-sources.seed.json
#                   in production).
#   <commit-label>  a short human-readable label for the commit message and log lines (e.g.
#                   "attach-found-sources worklist").
set -u

ref_name="${1:?ref-name required}"
run_id="${2:?run-id required}"
artifact_path="${3:?artifact-path required}"
commit_label="${4:?commit-label required}"

git config user.name "github-actions[bot]"
git config user.email "github-actions[bot]@users.noreply.github.com"
git add "$artifact_path"

if git diff --cached --quiet; then
  echo "No new ${commit_label} to commit."
  exit 0
fi

if ! git commit -m "${commit_label}: run ${run_id}"; then
  echo "::error::could not commit the ${commit_label} (a git error before any push was attempted)."
  exit 1
fi

# Protected-ref guard: never attempt a push a branch-protection rule will refuse by design. Named
# explicitly (never inferred from a push failure) so the log distinguishes "we knew better than to try"
# from "we tried and a rejection came back" -- both degrade the same way, but the first never spends the
# two-attempt retry loop on a push that cannot ever succeed.
if [ "$ref_name" = "master" ]; then
  echo "::warning::${commit_label} committed locally but NOT pushed -- '$ref_name' is branch-protected, so a direct push here is refused by design. The change is carried forward only in this run's own checkout (and this run's uploaded workflow artifact, if any); a coordinator lands it by hand (cherry-pick this commit, or copy the file) for the next dispatch on '$ref_name' to see it."
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
  echo "::warning::could not push the ${commit_label} to '$ref_name' after 2 attempts. A persistent rejection (branch protection, or any other repeatable refusal) fails identically both times, so this degrades rather than failing the run: the change is carried forward only in this run's own checkout; a coordinator lands it by hand."
  exit 0
fi

echo "${commit_label} pushed to '$ref_name'."
exit 0
