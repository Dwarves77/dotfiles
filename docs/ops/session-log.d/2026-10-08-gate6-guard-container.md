# 2026-10-08, lane GATE-6 (gate6-guard-container): the rendering guard never stalls on a browser install again

Brief: coordinator brief gate6 (2026-10-04 wave), with the coordinator's approval and write-set grant of 2026-10-08.

## Accomplished

- `.github/workflows/discipline.yml`, rendering-guard job only: runs in
  `mcr.microsoft.com/playwright:v1.61.1-noble`; the `playwright install --with-deps chromium` step is gone;
  `timeout-minutes` 10 to 15 with the measured reasoning in the job comment; the guard step prints
  `guard run: <s> s` to the step summary and keeps the guard's exit status.
- `.github/workflows/layout-baseline-renewal.yml` (job `renew`) and `.github/workflows/live-smoke.yml` (job
  `live-smoke`): same container and install step, one image line per file (grant 2026-10-08). Their timeouts
  (20) are unchanged.
- `fsi-app/.discipline/fitness/functions/F52-workflow-file-validity.test.mjs`: the GATE-4 timeout assertion now
  says 15; four new GATE-6 workflow-shape tests (below).

## Before and after (rendering-guard job)

Before: `runs-on: ubuntu-latest`, `timeout-minutes: 10`, steps checkout (depth 1), setup-node 24,
`npm install --no-save playwright@1.61.1` plus `npx playwright install --with-deps chromium`, then the guard.
After: same `runs-on`, `container.image: mcr.microsoft.com/playwright:v1.61.1-noble`, `timeout-minutes: 15`,
steps checkout (depth 1), setup-node 24, an install step that reads the version out of the image line of the
same file with `sed` and runs `npm install --no-save "playwright@${version}"` (no browser install), then the guard
with its runtime summary line.

## The four cancellations (rendering guard cancelled at the 10 minute limit)

Confirmed from the run API (job conclusion `cancelled`, attempt in brackets):

- PR 1007: run 37749343614, attempt 1 (08:21:57Z to 08:32:13Z, 10m16s); attempt 2 of the same run passed in 7m37s.
- PR 1016: run 37760242711, attempt 1 (09:57:38Z to 10:07:54Z, 10m16s).
- PR 1020: run 37765744934, attempt 1 (10:47:05Z to 10:57:20Z, 10m15s); attempt 2 was in progress when read.
- PR 1009 first attempt: NOT FOUND. The two runs listed for that PR's branch (37750724346, 37751672069) are
  single-attempt successes. The id is not in this log because it was not confirmed.

## Decisions

- The coordinator's three brief premises were wrong, and said so in the approval: package.json does not pin
  Playwright (the pin was the workflow install line), the job had no `npm ci` step, and a step output cannot feed
  `container.image`.
- `job.container.image` does not exist (the job context carries `container.id` and `container.network` only), so
  the install step reads the version from the image line in its own workflow file. One literal per file; the F52
  test runs the same sed pattern over the real file and asserts it yields the tag's version.
- Distro `noble`, as approved; the first CI run proves the tag is pullable.

## First CI run (run 37767563172) failed on two defects of this lane, fixed with the coordinator's approval

- Rendering guard: `fatal: detected dubious ownership in repository at '/__w/dotfiles/dotfiles'` from
  `git rev-parse --show-toplevel` (the container user does not own the checkout; `actions/checkout` sets
  `safe.directory` only under a temporary HOME). Fix: a `git config --global --add safe.directory
  "$GITHUB_WORKSPACE"` step after the checkout in all three Playwright jobs.
- Fitness functions and Discipline engine unit tests (via `gate-a-rescan-workflow.test.mjs`): F52f, the
  `| tee -a "$GITHUB_STEP_SUMMARY"` line had no `set -o pipefail`. Fix: the summary line is written with `>>`, no
  pipe.
- The container itself pulled and started (`noble` is valid for 1.61.1).

## Tests

- `node --test fsi-app/.discipline/fitness/functions/F52-workflow-file-validity.test.mjs`: new tests assert each of
  the three Playwright jobs has exactly one Playwright image line at one shared version, no `playwright install`,
  no apt or `--with-deps`, no second version literal, a derivation over its own file that yields the image
  version, the summary line (no pipe) and preserved exit status, the safe.directory step ordering, the 15 minute
  timeout with the recorded p90 and max, and the corrected workflow header. Red against the first commit's
  workflows: 3 of the new tests fail; green after: 56 pass, 1 skipped (live-tree flag).

## NOT done

- `layout-baseline-renewal.yml` is dispatch-only, so this PR does not exercise it; its container form is proven by
  the shape test, not by a run. It checks out with `fetch-depth: 0` and later runs `git show`, so it needs `git`
  in the image; unproven until dispatched.
- `live-smoke.yml` runs on a Production deployment or by dispatch; not exercised by this PR either.

## Open items

- First green run timings: appended below once the PR's Rendering guard has run. [CLOSED: PR 1021]
