# live-smoke family

Registered by lane GATES-2, 2026-10-05.

`.github/workflows/live-smoke.yml` signs in once as a dedicated read-only smoke account and loads the real pages of
a real deployment (the dashboard, the four lists, the first item on each list and the first theme-chip item) at
1440x900 and 375x812. It asserts the named invariants in `.discipline/rendering/live/live-assertions.mjs` and writes
a JSON report. It never writes to the application.

Each firing, including one that failed before producing a report, lands one artifact written by
`scripts/turns/emit-live-smoke-artifact.mjs`: pages visited, failure and warning counts, a count per invariant, and
one defect per failing invariant. `deliver-artifact-branch.sh` lands it into `harness_runs`, which is the dispatch
evidence the closure gate's NEVER-RUN check reads.

**Standing metric**: `failure_count` per run (target 0) and `pages_visited` (a drop means discovery found fewer
items than before).

**The smoke account must never be a platform admin** (it is a workspace owner, a normal customer login). The
`admin-gate` invariant attacks that: as the smoke user, no admin navigation link may render, `GET /admin` must be
refused, and `GET /api/admin/coverage` and `GET /api/admin/integrity-flags` must answer 401/403/404. It fails
loudly, naming a possible admin account, if any of that stops being true. Read-only GETs only.

Triggers: production `deployment_status` events and `workflow_dispatch`. Previews are excluded until a Vercel
protection bypass exists (see `docs/runbooks/maintenance.d/62-live-smoke.md`).
