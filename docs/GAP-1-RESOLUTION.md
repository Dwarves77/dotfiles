# Gap 1 Resolution — H-tier spot-check audit + threshold tightening

Resolution date: 2026-05-06
Branch: `verification/gap-1-spot-check-and-thresholds`
Owners: platform / verification pipeline (W2.F)

## Background

W3 shipped a verification pipeline that auto-approves discovered candidate
URLs to tier H (active monitoring) when:

- The URL is reachable
- It matches one of 57 `KNOWN_AUTHORITATIVE_PATTERNS`
- A Haiku classifier scores `ai_relevance_score ≥ 70` and
  `ai_freight_score ≥ 50`

That pipeline added 64 H-tier sources to the `sources` table without a
spot-check pass. A 20-source random spot-check
(`docs/SPOT-CHECK-RESULTS.json`) found 3/20 that should be M-tier
(provisional, queued for review), giving a 15% false-positive rate at
the original 70/50 thresholds.

## What changed in this resolution

### 1. Threshold tightening — `fsi-app/src/lib/sources/verification.ts`

| Threshold | Before | After |
|-----------|--------|-------|
| `AI_RELEVANCE_H` | 70 | **75** |
| `AI_FREIGHT_H` | 50 | **55** |
| `AI_RELEVANCE_M` | 50 | 50 (unchanged) |
| `AI_FREIGHT_M` | 25 | 25 (unchanged) |

Comment block above `THRESHOLDS` records the rationale, audit run
reference, and 15% false-positive-rate finding.

### 2. Three known demotions — `fsi-app/supabase/seed/apply-known-demotions.mjs`

The earlier 20-source spot-check flagged exactly three sources
`should-be-M`. These are demoted verbatim by the new script:

| # | Source ID | Name | URL | Reason |
|---|-----------|------|-----|--------|
| 1 | `3cab0b63-605b-47ef-9e4c-6af94680c10c` | DPNR – Division of Environmental Protection (US Virgin Islands) | https://dpnr.vi.gov/environmental-protection/ | freight 65 → 45 (below new threshold 55) |
| 2 | `9fefb65c-1e41-4c6b-a7a1-03982884604f` | Maryland Department of the Environment (MDE) – Air & Climate Change Program | https://mde.maryland.gov/programs/air/ClimateChange/Pages/index.aspx | freight 65 → 45 (below new threshold 55) |
| 3 | `76852e81-0c81-49ef-bc2c-eee80337db3f` | Virginia Department of Transportation (VDOT) – Freight Office | https://www.vdot.virginia.gov/travel-traffic/freight/ | relevance 72 → 65 (below new threshold 75) |

All three were T2-classified at the original verification, are still T2
on re-classification, but fall below the new H thresholds.

**Demotion path** (chosen after schema review):

1. Insert a `source_trust_events` row of type `tier_demotion` with full
   pre-state in the `details` payload.
2. Insert (or upsert by `url`) a `provisional_sources` row with
   `status='pending_review'`, `provisional_tier=7`,
   `recommended_tier = source.tier`, full reviewer notes.
3. **Suspend** rather than delete the original `sources` row:
   - `status='suspended'`
   - `processing_paused=true`
   - `notes` appended with demotion explanation pointing at the new
     provisional row id

The reason for suspending instead of deleting: `source_trust_events.source_id`
has `ON DELETE CASCADE`, so deleting the source row would cascade away
the demotion event we just wrote. Suspending preserves both the event and
the `source_verifications.resulting_source_id` audit chain.

`discovered_via` on `provisional_sources` is constrained to
`('skill_recommendation','citation_detection','worker_search','manual_add')`
— there is no `auto_demoted_post_spotcheck` enum value, so we use
`worker_search` (closest semantic) and tag the demotion in
`reviewer_notes` and the trust-events `details` JSONB.

### 3. Full 64-source spot-check — `fsi-app/supabase/seed/spot-check-all-h-tier.mjs`

New script that re-runs the spot-check across **every** un-spotchecked
tier-H source (filter: `verification_tier='H'` joined to `sources` with
`spotchecked=FALSE` and `status='active'`). For each source:

- HEAD reachability
- GET content + strip HTML to ~6000 chars
- Haiku re-classification with the verbatim system prompt from
  `verification.ts`
- Verdict matrix:
  - `confirm-H` (rel ≥ 75 AND frt ≥ 55) → mark `spotchecked=true`,
    `spotchecked_at=NOW()`, `spotchecked_by=NULL` (the FK is to
    `auth.users(id)`; system actor has no user row)
  - `should-be-M` (50 ≤ rel < 75 OR 25 ≤ frt < 55) → demote (same path
    as the known demotions)
  - `should-be-L` (rel < 50 OR frt < 25) → demote, flag for rejection
    consideration in notes
  - `unreachable` → no DB write; left for manual review

Outputs:

- `docs/GAP-1-SPOT-CHECK-FULL-RESULTS.json` — per-source detail
- `docs/GAP-1-SPOT-CHECK-FULL-RESULTS.md` — summary table

Idempotent. Re-runs only process sources that haven't been processed
yet (filter on `spotchecked=FALSE`).

**Estimated cost**: 64 sources × ~$0.001 Haiku ≈ **$0.06**.

### 4. Recurring monthly spot-check

#### Workflow — `.github/workflows/spot-check-monthly.yml`

- Cron `0 3 1 * *` (1st of month, 03:00 UTC)
- Hits `POST /api/admin/spot-check/recurring` on `${APP_URL}` with
  `x-worker-secret: ${WORKER_SECRET}`
- Same secrets as the existing trust-recompute workflow (no new
  GitHub Actions secrets required)
- Workflow fails (exits 1) when the endpoint returns HTTP 502, which
  the endpoint emits when `false_positive_rate_pct > 5`

#### Endpoint — `fsi-app/src/app/api/admin/spot-check/recurring/route.ts`

- POST handler with worker-secret auth (`x-worker-secret`)
- 4h cooldown via `admin_action_cooldowns` (key `admin_spot_check_recurring`)
  — same pattern as `/api/admin/scan`
- Pulls 20 random tier-H verifications from the past 30 days, joined to
  active sources
- Re-classifies via Haiku at current thresholds (reuses
  `VERIFICATION_HAIKU_SYSTEM_PROMPT` and `__internals.THRESHOLDS` from
  `src/lib/sources/verification.ts` — no duplication)
- Inserts a `source_trust_events` row of type `manual_review` per
  sampled source (subtype `recurring_spot_check` in details JSONB)
- Stamps the cooldown ledger with summary metadata (sample size, counts,
  FP rate) so historical runs are queryable from
  `admin_action_cooldowns.metadata`
- Returns JSON: `sample_size`, `confirm_h`, `should_be_m`,
  `should_be_l`, `unreachable`, `false_positive_rate_pct`,
  `recommendations[]`, plus per-source `results[]`
- Returns HTTP 502 (not 200) when `false_positive_rate_pct > 5` so the
  workflow surfaces an alert

**No new schema** is added. The only candidate would be a
`spot_check_runs` aggregate table; that is **not** added in this
resolution (per task constraint to surface schema additions before
writing). The forensic record uses existing tables:

- per-source verdicts → `source_trust_events`
- run-level summary → `admin_action_cooldowns.metadata` (latest run only)

If aggregate run history becomes a UI need (e.g., "show me FP rate over
the past 12 months"), a `spot_check_runs` table is a clean follow-up.
For now, the GitHub Actions run history serves as the visible audit
trail of monthly runs.

## Files written

1. `fsi-app/src/lib/sources/verification.ts` — `THRESHOLDS` updated +
   comment block (Edit, not new file)
2. `fsi-app/supabase/seed/apply-known-demotions.mjs` — NEW
3. `fsi-app/supabase/seed/spot-check-all-h-tier.mjs` — NEW
4. `fsi-app/src/app/api/admin/spot-check/recurring/route.ts` — NEW
5. `.github/workflows/spot-check-monthly.yml` — NEW
6. `docs/GAP-1-RESOLUTION.md` — NEW (this file)

## Execution order (orchestrator runs)

1. **Apply known demotions** first
   (`node fsi-app/supabase/seed/apply-known-demotions.mjs`).
   These are the high-confidence demotions and validate the demotion
   path before the full audit runs.
2. **Run the full 64-source spot-check**
   (`node fsi-app/supabase/seed/spot-check-all-h-tier.mjs`).
   Estimated cost: ~$0.06.
3. **Verify** by reading `docs/GAP-1-SPOT-CHECK-FULL-RESULTS.md`. Any
   `error` write_status entries should be hand-investigated.
4. **Deploy** the verification.ts threshold change + new API route.
5. **Add the GitHub workflow secrets** (already present from
   trust-recompute) and confirm via `workflow_dispatch` that the new
   monthly workflow runs cleanly.

## Open follow-ups

- If the full 64-source audit produces a false-positive rate above ~5%
  even after applying the new thresholds, escalate to a stricter
  recalibration (rel ≥ 80, frt ≥ 60) and re-audit.
- Consider a `spot_check_runs` table if monthly history needs UI
  surfacing (out of scope for Gap 1).
- The `provisional_sources.discovered_via` enum should be extended with
  `auto_demoted_post_spotcheck` to make the demotion path
  self-documenting at the schema level. Out of scope here (would
  require a migration); flagged for the next schema-evolution sweep.
