# Operator ruling: GitHub Actions never opens PRs (2026-09-26)

OPERATOR RULING (2026-09-26, verbatim): "I've been building this for six months and not once
that I need a pull request from GitHub". Meaning: the repo setting *Settings → Actions → General →
Workflow permissions → Allow GitHub Actions to create and approve pull requests* stays OFF, for good.
It is not a temporary gap waiting on the operator to flip a checkbox. Every workflow and runbook that
frames PR creation as "waiting on the operator to enable the setting" (e.g. `deliver-artifact-branch.sh`'s
own comments, the `Runtime artifact branches awaiting a hand-opened PR` tracking issue's body text) is
describing a state that will not change. Confirmed live: repo Actions permissions are
`can_approve_pull_request_reviews=false`, `default_workflow_permissions=read`, i.e. Actions cannot
create or approve PRs at all, not just via `gh pr create`.

Binding consequence for future lanes: do not build or propose any mechanism whose only landing path is
a GitHub Actions job opening a PR (`gh pr create`, `peter-evans/create-pull-request`, or equivalent).
Harness-run artifacts and other automated writes must reach `master` through a path that needs no
Actions-created PR, e.g. a database table the consuming code reads directly, a human- or
coordinator-run collector script, or Actions artifacts (the built-in upload/download mechanism, not a
PR) paired with a separate landing step a person or a non-Actions process runs. See the companion note
`2026-09-26-harness-landing.md` in this directory for the current real landing path, the branches
stranded by this ruling, and options going forward.
