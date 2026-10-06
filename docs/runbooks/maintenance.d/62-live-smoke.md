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

**Triggers**: a Vercel `deployment_status` event reporting success (production and previews; the target is the
event's environment URL), and `workflow_dispatch` with a `url` input. No schedule. The deployment_status trigger
only fires from the workflow file on the default branch.

**Dispatch** (after both secrets exist):
`gh workflow run live-smoke.yml -f url=https://carosledge.com`

**What it visits**, at 1440x900 and 375x812: the dashboard, the four list pages, the first item on each list and
the item the first theme chip links to.

**Invariants** (each a named line in the job log, `FAIL <invariant> @<width> <url> :: <offending text>`):
`session-invalid` (a `/login` redirect, reported alone and distinct from a page defect), `internal-marker`,
`placeholder-literal`, `raw-tag-slug`, `bare-score`, `scroll-container-overflow` (375 only), `console-error`,
`own-origin-5xx` (a 4xx on the own origin is a warning, `own-origin-4xx`), `tier-above-ceiling`,
`legend-below-ceiling`, `list-has-no-rows`, `detail-has-no-masthead`. A JSON report is uploaded as the
`live-smoke-report` artifact (7 days). Exit is non-zero on any failure.

**Reading a failure**: `internal-marker` means a stored body carries a leaked sentinel or payload; the stored count
is `scripts/verify/section-marker-audit.mjs` (data-audit label `section-markers`, hard), and the write path
(`writeSynthesizedBrief`) now refuses such a body. `scroll-container-overflow` is the shared rule in
`fsi-app/.discipline/rendering/overflow-rule.mjs`, the same one the rendering guard applies at 375.

**Not a required check yet.** To make it one: both secrets exist and the smoke account signs in on production;
three consecutive green runs on master; an admin adds "Live smoke" to the branch-protection required checks.
