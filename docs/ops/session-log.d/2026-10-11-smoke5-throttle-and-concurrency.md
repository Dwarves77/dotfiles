# 2026-10-11, lane SMOKE-5 (smoke5-throttle-and-concurrency): a 429 on the admin-gate probe retries then HOLDS, and a newer production deployment's smoke supersedes an older one

Defect: three merges landed within a minute, Vercel deployed each, and three live smoke runs started at 04:08:08, 04:08:58 and 04:09:01. The first failed `admin-gate GET 429 /api/admin/integrity-flags :: the smoke account may have become a platform admin` while the two later runs passed. [CONFIRMED: run 38110613718, 2026-10-11T04:08Z, master 97951486b]

## Accomplished

1. `live-smoke.mjs`: any admin-gate probe answered 429 (the two admin API GETs and the /admin page navigation) is retried after the `Retry-After` header (default 5 s when absent or unusable, at most 3 attempts, total wait capped at 60 s). A probe still 429 after that is a HOLD with reason `throttled` in the SMOKE-3 hold shape (same `holds` list, report, artifact and summary line), never a FAIL and never the admin hypothesis. New exports: `THROTTLE`, `retryAfterMs`, `retryOnThrottle`, `getWithThrottleRetry`, `adminGateOutcome`, `summaryLines`. 401/403/404 answer at once with no retry; a 200 still produces the "may have become a platform admin" finding; markers on the /admin page still fail even when the page was throttled.
2. `live-smoke.yml`: the concurrency group is keyed on the workflow plus the ENVIRONMENT of a successful deployment event (`Production`), `cancel-in-progress: true` kept. [CONFIRMED: `gh api repos/.../deployments/<id>/statuses` for the last three Production deployments gives three different `environment_url` values (carosledge-3mw1gjgus, -6dey88zqf, -nir2ttgx9); the old group keyed on that URL, so each deployment had its own group and nothing was superseded.] Only a `success` event shares the group (pending and in_progress events key on the run id and never cancel a running smoke); `workflow_dispatch` keeps one group per target url.
3. Why a master smoke may be cancelled here and discipline.yml's master run may not: a smoke run is a read-only check of what a deployment serves right now, so once a newer production deployment exists the older run measures a site that is no longer live; discipline.yml's master run validates a distinct commit, whose verdict a later commit does not supply. The cancelled run still emits its harness-run artifact (those steps run under `if: always()`).

## Read and reused

Read: root `CLAUDE.md`, COMMON, `live-smoke.yml`, `live-smoke.mjs` (probe loop, runner, summary), `live-assertions.mjs` (`judgeAdminProbe`, `formatSummary`, `buildReport`), `live-content.mjs` (`holdOf`), `emit-live-smoke-artifact.mjs` (hold handling), the SMOKE-3 and SMOKE-4 logs, discipline.yml's concurrency comment. Reused: the SMOKE-3 hold shape and its report/artifact/summary plumbing (no second outcome type), `checkAdminProbes` for every non-throttled probe, the existing stub-browser test file.

## Red then green

- Red: committed first (62108a0b4); `node --test live-smoke-content.test.mjs` failed to load against the unchanged source (`does not provide an export named 'THROTTLE'`).
- Green: `node --test fsi-app/.discipline/rendering/live/live-smoke-content.test.mjs` 25 pass, 0 fail (13 new). Covered with an injected fetch and an injected sleep: 429 then 200 answers 200 after the header wait; 429 x3 is `throttled` after 3 attempts and waits of 5 s and 5 s; a huge Retry-After never exceeds 60 s in total; 401/403/404/500 are not retried; the admin message appears for a 200 and never for 401/403/404/429.

## Decisions

- The throttled HOLD line drops the `[candidates=...]` tail that `formatSummary` appends to every hold, in `summaryLines` inside `live-smoke.mjs`, because a throttled probe is not a conditional invariant and "candidates=unresolved" would be false.

## NOT done

- `judgeAdminProbe` (live-assertions.mjs, outside this write set) still prefixes the "may have become a platform admin" hypothesis to a non-refusal status that is not 200 (for example an admin API answering 500); the 429 case no longer reaches it. Needs live-assertions.mjs and its test file in a write set. [WORK: owed]
- The first production run after this merges shows whether the concurrency group cancels an older run; nothing in the repo can show it before. [NOT-WORK: needs two production deployments close together, which a lane never fires]
