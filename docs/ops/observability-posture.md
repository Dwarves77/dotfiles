# Observability Posture (R0.2, 2026-07-11)

First-party runtime observability — two independent GitHub Actions watches against the deployed app
(`.github/workflows/uptime-probes.yml`). No external alerting by design (no Sentry/PagerDuty/Slack);
the alert channel is GitHub's failed-workflow email to the repo owner.

## The two watches (independent jobs — no dependency between them)
- **Surface honesty probe** (`surfaces` job) — every 30 min + manual. Curls `/api/health/surfaces`,
  asserts every must-have customer surface reports `ok=true` (backing data present):
  `dashboard, regulations, market, research, operations`. Also fails on `seed_leak=true`.
- **Spend watch** (`spend` job) — daily 09:00 UTC + manual. Curls `/api/health/spend`, fails at ≥80%
  of the $75 monthly ceiling.

**Coupling: NONE.** The two are separate jobs with **no `needs:`**. Each is schedule-gated by an `if:`
on `github.event.schedule` (surfaces on the 30-min cron, spend on the daily cron); on a manual
`workflow_dispatch` **both** run in parallel. A surface-probe failure therefore cannot skip or fail the
spend watch — they watch different things and never run coupled. (This resolves the 2026-07-11 relay's
"un-skip spend from the honesty probe" concern: the skip observed on a 30-min run was the daily-vs-30min
schedule gate, not downstream-of-failure. Nothing to decouple.)

## Designed-empty is a PASS (the honesty contract)
The probe's honesty contract for a surface = **HTTP 200 + no error-frame + no placeholder-literal +
(backing data OR a recognized designed-empty frame)**. Designed-empty is a pass, not a fail. This is
already encoded at the endpoint (`/api/health/surfaces` treats community / map / *-config zero-states as
legal) and re-asserted in the workflow only for the five must-haves. The audit's honest-empty list
(Watchlist, Affected-lanes, "NO PRICE DIMENSION", "NO KEY FIGURE YET", etc.) must stay probe-exempt by
design — a designed-empty frame is not a dishonesty breach.

## Incident log

### 2026-07-11 — probe RED (3s), Spend watch skipped. Classification: INFRA (startup death).
- **Run** 29170113475 (30-min surfaces cron). Died at the `Verify required secrets` step, 3s, before
  any surface was reached.
- **Mechanism (named from the log):** `PROBE_SECRET` repo secret is **empty** (`APP_URL: ***` is set;
  `PROBE_SECRET:` blank → `::error::PROBE_SECRET secret is not set`). NOT a real finding, NOT a
  designed-empty mis-classification, NOT a stale URL — the probe never ran an assertion.
- **Fix (OPERATOR action — a credential, agent cannot set it):** set the GitHub Actions repo secret
  **`PROBE_SECRET` = the app's `WORKER_SECRET`** (Settings → Secrets and variables → Actions, or
  `gh secret set PROBE_SECRET`). The health endpoints auth the `x-worker-secret` header against
  `WORKER_SECRET`; the probe presents `PROBE_SECRET` as that header. Value never written to any file/log.
- **Spend watch:** correctly schedule-gated off on this 30-min run (not downstream-of-failure). It will
  fail at its own `Verify required secrets` too until `PROBE_SECRET` is set.
- **Re-run (after the secret is set, once):** `gh workflow run uptime-probes.yml` → both legs green.
  NOT re-run before the secret is set (would re-fail deterministically on the same missing secret).
- **Alert path: WORKING** — the failure correctly emailed the owner (a nonzero exit = the alert). The
  observability alerting is functioning; it alerted on the missing config, which is the point.

Related: [[backup-posture]] (R0.1 sibling), [[ADR-012-intake-cadence-and-launch-exit-test]] ($75 ceiling).
