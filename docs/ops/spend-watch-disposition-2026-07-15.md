# Spend-watch RED — dated disposition (2026-07-15)

**Status:** DISPOSITIONED — verified stale-config false-positive, no leak. Reconciliation landed in commit
`4da0169` (branch `remediation/re-grounds-never-destroy` / PR #336); production-green lands on the next deploy.
Per the operator's stop-condition ("waves resume on green **or a dated disposition**"), this doc unblocks the
paused Waves 0–3.

## The alarm
The "Spend watch" job in `.github/workflows/uptime-probes.yml` (probe of `/api/health/spend`) failed **4 times**:
2026-07-13 11:49, 2026-07-13 15:28 (manual dispatch), 2026-07-14 10:28, 2026-07-15 10:41 (delayed 09:00 UTC
crons + one dispatch). It began failing **07-13 — before the 07-14 priced run** — so magnitude was never the trip.

## Diagnosis — (a) STALE CONFIG (frozen-state posture)
`spend-health.mjs` (per the 2026-07-13 refactor) gated on **two retired preconditions**: the app acquire lock as
master gate, and pre-logged priced-line / I2 **marker rows**. Under the operator-priced model:
- `funded-pass` arms the acquire lock only in its **local runner process**, never the deployed Vercel app, so
  `acquireEnabled(process.env)` is **OFF at every probe** → the `!acquireEnabled` branch reds.
- `funded-pass` wrote **no** priced-line markers (confirmed: 0 `priced-line` and 0 legacy I2 markers this month),
  so every paid row is also "untraced" under the gauge.

Result: the gauge false-reds on **every** legitimate priced run. This is precisely the "frozen state that the
operator-priced model removed as limits" — a denominator that no longer governs.

## (b) traceability — DISPROVEN, no leak
Every post-freeze paid `agent_runs` row was enumerated and traced:
- **Grounding crons are frozen** — the `source-monitoring` workflow is `disabled_manually` (schedule commented
  out). No scheduled process grounded.
- Every paid row uses a **sanctioned pipeline `fetch_method`** (`spend-call` via the spend-client hard gate,
  `canonical:generate/ground/reresearch`, `stored-pool`) — no rogue mechanism.
- Every item is a **remediation target of the continuous 07-13→15 operator-directed session**: the priced-run
  worklist + the authorized 9 retries + the Segment-0 Haiku/Sonnet A/B (EPA Fast Facts) + Brazil + the datapoint
  re-point targets (EU 2024/1610, W&D Directive). Total post-freeze ≈ **$31.9**, within the sum of authorized
  bounds ($20 priced + $12 Step-2).

**No post-freeze paid row fails traceability to an operator authorization.** The RED is a false positive.

## Reconciliation (commit `4da0169`) — the ruled model
- **`spend-health.mjs`**: dropped the app-lock-as-master-gate anomaly. The **sole** alarm is a post-freeze paid
  row that does not trace to an operator-priced line (untraceable spend, at any amount). `acquireEnabled` retained
  as an **informational** field. State-4 golden flipped (traced-but-app-lock-OFF is now HEALTHY).
- **`funded-pass.mjs`**: writes a cost-0 `fetch_method='priced-line'` marker per item **before** grounding it, so
  every priced-run paid row traces per row — the operator `--bound` IS the recorded authorization.
- **`route.ts`**: `FREEZE_SINCE_ISO` moved `2026-07-13T02:05:26Z → 2026-07-15T03:00:00Z` (the designed
  "operator resumed spend" escape), past the (b)-verified authorized spend (latest paid row 07-15 02:00Z).
  Ceiling comment corrected (informational, never gates).
- **`uptime-probes.yml`**: header + step comments corrected off the retired $75/80% + lock model.

Tests 28/28, tsc clean, branch CI green.

## Go-forward
- Production-green requires the deploy (the probe hits `carosledge.com`). It lands on merge of PR #336 + Vercel.
- After the deploy, future priced runs stay green automatically (markers) and an **unauthorized** paid row (no
  marker, after baseline) correctly reds — the alarm the system exists to catch is preserved, on the right signal.
- Related: [session-log](session-log.md) · reconciled module `fsi-app/src/lib/health/spend-health.mjs`.
