## 62. `live-smoke`

**New this runbook, lane GATES-2, 2026-10-05.** Not a `maintenance.yml` step: it is a read-only check workflow,
`.github/workflows/live-smoke.yml` (job name "Live smoke"), that loads the real pages of a real deployment as a
signed-in customer and asserts named invariants. It writes nothing, to the database or the repo.

**Purpose**: what a customer actually receives is checked by a gate, not by a person. The rendering guard mounts
fixtures and never sees stored data; this job does.

**Secrets** (names registered in `fsi-app/.discipline/governance/secrets-registry.mjs`, values never printed):
- `LIVE_SMOKE_EMAIL`: the email of a dedicated read-only smoke account, an ordinary customer login.
- `LIVE_SMOKE_PASSWORD`: that account's password. It is only ever sent to `carosledge.com` or a `*.vercel.app`
  deployment (`live-preflight.mjs` refuses any other host).
With either unset the first step fails in seconds with a named message, before any install.

**The smoke account must never be a platform admin.** It is a workspace owner (a normal customer login, not
`profiles.is_platform_admin`). The `admin-gate` invariant is an attack on that: signed in as the smoke user it
asserts (a) no admin navigation link renders on any page visited, (b) `GET /admin` is refused (a redirect away from
`/admin`, or 401/403/404), and (c) two read-only admin API routes, `GET /api/admin/coverage` and
`GET /api/admin/integrity-flags`, answer 401/403/404 to a request carrying the user's own bearer token (read from the
session cookie in memory, never logged). Read-only GETs only, never a POST. Any link, or any 200 with admin
content, fails loudly as `admin-gate` and the line says the account may have become an admin: fix the account, not
the check.

**Triggers**: a Vercel `deployment_status` event reporting success for the `Production` environment (the target is
the event's environment URL), and `workflow_dispatch` with a `url` input. No schedule. The deployment_status
trigger only fires from the workflow file on the default branch.

**Previews are excluded, and why.** A protected Vercel preview answers with Vercel's own login page, so every
preview run would fail as `session-invalid` and teach people to ignore the check. Until a Vercel protection bypass
exists, a preview is checked by hand: `gh workflow run live-smoke.yml -f url=<preview url>`. The host allowlist
(`carosledge.com`, `*.vercel.app`) stays.

**Dispatch** (after both secrets exist):
`gh workflow run live-smoke.yml -f url=https://carosledge.com`

**What it visits**, at 1440x900 and 375x812: the dashboard, the four list pages, the first item on each list and
the item the first theme chip links to.

**Invariants** (each a named line in the job log, `FAIL <invariant> @<width> <url> :: <offending text>`):
`session-invalid` (a `/login` redirect, reported alone and distinct from a page defect), `internal-marker`,
`placeholder-literal`, `raw-tag-slug`, `bare-score`, `scroll-container-overflow` (375 only), `console-error`,
`own-origin-5xx` (a 4xx on the own origin is a warning, `own-origin-4xx`), `tier-above-ceiling`,
`legend-below-ceiling`, `list-has-no-rows`, `detail-has-no-masthead`, `admin-gate`. A JSON report is uploaded as the
`live-smoke-report` artifact (7 days) and converted by `scripts/turns/emit-live-smoke-artifact.mjs` into the
`live-smoke` harness family's run artifact, landed in `harness_runs` by `deliver-artifact-branch.sh` (the closure
gate's dispatch evidence). A firing with no report records `report_missing`, never a clean run. Exit is non-zero on
any failure.

**Reading a failure**: `internal-marker` means a stored body carries a leaked sentinel or payload; the stored count
is `scripts/verify/section-marker-audit.mjs` (data-audit label `section-markers`, hard), and the write path
(`writeSynthesizedBrief`) now refuses such a body. `scroll-container-overflow` is the shared rule in
`fsi-app/.discipline/rendering/overflow-rule.mjs`, the same one the rendering guard applies at 375.

**Not a required check yet.** To make it one: both secrets exist and the smoke account signs in on production;
three consecutive green runs on master; an admin adds "Live smoke" to the branch-protection required checks.
