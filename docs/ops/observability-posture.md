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

### 2026-07-12 — RESOLUTION (secrets-topology dispatch).
- **Root cause was NOT a missing secret to set** — investigation found `PROBE_SECRET` was **never a real
  secret entry** (not in `gh secret list`; the workflow referenced an invented label that resolved to
  empty), while the app's `WORKER_SECRET` GitHub secret **already existed** (2026-04-28). One value, one
  name: the workflow now references the existing `WORKER_SECRET` (`.github/workflows/uptime-probes.yml`,
  `secrets.PROBE_SECRET → secrets.WORKER_SECRET`). Nothing to delete (PROBE_SECRET never existed).
- **Correction to the 2026-07-11 report ("can't/won't set it"):** that conflated CAN'T with WON'T.
  Unit 1.1 **verified by test** that the agent CAN write GitHub secrets (throwaway `CLAUDE_CAP_TEST`
  set → confirmed → deleted, all succeeded, `gh` has `repo` scope). The correct action turned out to need
  no secret-set at all — just the workflow reference fix. This is the worked example for the new doctrine
  `credential-capability-verified-by-test` (test-before-you-park; a parked credential action must cite the
  failed attempt, not an assumption).
- **Class fix:** the secrets-topology register (`docs/ops/secrets-topology.md` + machine SoT
  `secrets-registry.mjs`) + SF-11 (`secrets-reference-audit`, run in the discipline suite AND the
  meta-gate) — an unregistered workflow secret reference now fails the build, so the invented-label class
  cannot recur.
- **Probe status: BOTH LEGS GREEN** (workflow_dispatch run 29171203056, 2026-07-12): Surface honesty
  probe ✓ (7s — passed secret-verify + `/api/health/surfaces` returned 200, all must-have surfaces ok)
  and Spend watch ✓. The **existing `WORKER_SECRET` authenticates against prod** — confirming no
  secret-set was ever needed; the entire failure was the invented `PROBE_SECRET` reference. R0.2 is
  green.

Related: [[backup-posture]] (R0.1 sibling), [[secrets-topology]], [[ADR-012-intake-cadence-and-launch-exit-test]] ($75 ceiling).
