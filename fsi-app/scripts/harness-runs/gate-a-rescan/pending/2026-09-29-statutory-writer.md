## Change

Lane STATUTORY-WRITER (2026-09-29) edited `.github/workflows/gate-a-rescan.yml` (a `gate-a-rescan`
governing file): removed the "Commit this run's harness artifact and open a PR" step's git
add/branch/commit/rebase/push/PR dance and replaced it with a single call to
`scripts/turns/deliver-artifact-branch.sh` (git-status based, no branch/commit/push -- coordinator ruling
on PR #824, propagation-drain run 36534640498). Behavior of the rescan itself is unchanged; only how its
harness-run artifact reaches `harness_runs` changed.

## Planned run

No new `gate-a-rescan` run is dispatched by this lane. The next real dispatch of `gate-a-rescan.yml`
(workflow_run-chained off Brief apply / Population turn, or hand-dispatched) lands the run artifact that
supersedes this file, and will exercise the simplified landing step for real.
