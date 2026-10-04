## Appendix: F51 check 5, the hotspot standing number (`.discipline/fitness/functions/F51-no-shared-append.mjs`, lane F51b, 2026-09-20, second occurrence)

Not a data-audit lane step, part of the pre-push discipline gate (`run-test-suite.sh`'s fitness runner).
F51 check 5 prints, on every run, the standing count of files changed by 3 or more of the last 30
first-parent commits of `origin/master` after a dated anchor commit (`HOTSPOT_WINDOW_ANCHOR_COMMIT`) --
observability only, never a refusal by itself. It fired twice against files it could not have refused at
the time: `docs/dispatches/lane-briefs/2026-09-19/README.md` on 2026-09-19, then `fsi-app/scripts/lib/loop-run-id.mjs`,
`fsi-app/scripts/lib/loop-run-id.test.mjs` and `fsi-app/scripts/turns/emit-downstream-chain-artifact.mjs`
on 2026-09-20 (three serial lanes, M3/#752, M3b/#755, M4/#759, extending one module one after another),
each time refusing every OTHER lane's push after the fact rather than the lane that made the third touch.
The design correction: a hotspot is a VIOLATION only when the CURRENT LANE'S OWN changed-file range (the
same `merge-base(origin/master, HEAD)..HEAD` resolution checks 1-4 use, via `change-range.mjs`) touches the
file -- count is master-window touches plus one for this range, threshold 3 unchanged. A hotspot the
current range does not touch is printed in the standing number and is never a violation (the bystander
case). On `origin/master` itself, or any run with an empty or unresolvable range (a scheduled or manual
run), there is no change to refuse: standing number only. The three loop-id-resolver files carry a dated
`HOTSPOT_ALLOWLIST` entry (coordinator-decided) until they age out of the 30-commit window; delete each
entry then, never before.
