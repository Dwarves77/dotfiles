# Scraping-hold audit (2026-06-28) — is the auto-fetch HOLD honored?

READ-ONLY. Verifies the operator HOLD (nothing should auto-scrape/auto-fetch external data until Jason
lifts it). Distinct from the dead-code/routing audits: a fetcher can pass those clean and still violate
the hold. **Verdict: the hold is NOT fully honored — `check-sources` is live-scraping hourly right now.**

## VERDICT
There is **no code-level hold**. The hold is purely DATA-GATED by three flags, and two of the three are
not set to "held":
- `system_state.global_processing_paused` = **FALSE** (global hold is OFF)
- `sources.auto_run_enabled = true` on **89 sources** (1096 false, 8 processing_paused) — 89 are armed
- `pending_first_fetch` queue = 27 rows, **0 pending** (drain idle *by luck*, not by a gate)

Live proof of scraping: `source_trust_events(event_type='accessibility_check', created_by='worker')` =
**5 in the last 24h, 24 in 7d, newest 2026-06-28 09:50Z**. The hourly GitHub Actions cron is rendering
real source URLs through Browserless. `agent_runs` last 7d = 0 (the heavier generation path is dormant
only because the drain queue is empty).

---

## ACTIVELY SCRAPING (violates the hold — PRIORITY)

### 1. `check-sources` — hourly, LIVE
- **Trigger:** `.github/workflows/source-monitoring.yml`, `cron: '0 */1 * * *'` (every hour), confirmed
  firing+succeeding (runs at 16:54 / 15:08 / 13:08 / 11:29 / 09:49 … on 2026-06-28).
- **What it fetches:** for each due source it calls `browserlessRender(source.url)`
  ([check-sources/route.ts:34](../../src/app/api/worker/check-sources/route.ts#L34)) — a real outbound
  page render for reachability. Writes `source_trust_events` + `monitoring_queue` per render.
- **Gate:** short-circuits on `isGloballyPaused` (line 114, currently FALSE) and the queue filter requires
  `status='active' AND processing_paused=false AND auto_run_enabled=true AND due` (line 129-137), limit 10.
- **Why it's violating:** global pause OFF + 89 sources `auto_run_enabled=true` → as those come due, it
  renders them. ~5 renders/24h observed.
- **Turn off (pick one or stack):**
  - (a) **Disable the workflow** — `gh workflow disable "Source monitoring"` (stops the hourly tick entirely; cleanest).
  - (b) **Set the global hold** — `system_state.global_processing_paused = true` (short-circuits check-sources at line 114).
  - (c) **Re-arm the per-source kill switch** — flip the 89 `auto_run_enabled=true → false` (the cold-start state).
  - Most complete = (a). (b)+(c) honor the intent in data even if the cron keeps ticking.

## ARMED BUT IDLE (latent violation — not held by any flag, only by an empty queue)

### 2. `drain-first-fetch` — hourly, currently 0 pending
- **Trigger:** same `source-monitoring.yml` (runs after check-sources, hourly).
- **What it does:** drains `pending_first_fetch` → fetches (`browserlessRender`/`apiFetch`/`rssFetch`) →
  Haiku classify → **forwards to `/api/agent/run`** (full Sonnet brief = more scraping + `web_search` +
  `fetchPrimaryDeep`). Queue is populated by a migration-065 trigger on source INSERT **or** on
  `auto_run_enabled` flip.
- **Gate:** **does NOT import/check `isGloballyPaused`** ([drain-first-fetch/route.ts:1-8](../../src/app/api/worker/drain-first-fetch/route.ts#L1)) — its ONLY brake is an empty queue. Currently 0 pending → idle.
- **Why it's a latent violation:** any new source INSERT, or flipping any source `auto_run_enabled`, drops
  a row into `pending_first_fetch`, and the next hourly tick will fetch + classify + **trigger unattended
  brief generation** (the full scrape/web_search path) — with no pause gate. Idle today is luck, not a hold.
- **Turn off:** disabling the workflow (1a) also stops this. Otherwise it has no off-switch short of the empty queue.

## MONTHLY SCRAPER (low volume)

### 3. `spot-check/recurring` — monthly
- **Trigger:** `.github/workflows/spot-check-monthly.yml`, `cron: '0 3 1 * *'` (1st of month).
- **What it does:** samples 20 recently-approved sources, re-classifies via Haiku (and renders to re-check) — outbound fetch + LLM, monthly, with a 4h cooldown.
- **Turn off:** `gh workflow disable "Spot-check monthly recurring"`.

---

## SCHEDULED BUT DB-ONLY (no scrape — consistent with the hold)
- `q7-daily-recompute` (vercel cron, nightly) — pages `sources` + `recomputeEffectiveTier`; **DB reads only, no network fetch** (also the inert/misrouted engine from the other audit).
- `trust-recompute` (gh, monthly) — reads metrics/citations, computes; DB-only.
- `data-audit-lane` (gh, nightly) — read-only DB audits; no fetch.
- `discipline`, `bug-class-guard` (gh) — repo CI checks; no network data fetch.

## FETCH-CAPABLE BUT DORMANT (no trigger wired — consistent, latent)
- `/api/admin/sources/discover`, `/api/admin/sources/verify`, `/api/worker/reconcile` — fetch/discover by
  function but wired to NO schedule/workflow (confirmed absent from all 6 workflows). Dormant. Do not wire
  live while the hold stands.

## FETCH ONLY ON EXPLICIT OPERATOR ACTION (the intended state)
- `/api/agent/run` (generation: Browserless + `web_search` + `fetchPrimaryDeep`) — operator-initiated…
  EXCEPT it is also reachable unattended via `drain-first-fetch` (#2) — that path is the leak.
- `/api/admin/scan` (operator-triggered regulatory scan + `web_search`).

---

## Bottom line
To honor the hold completely and immediately: **`gh workflow disable "Source monitoring"`** (kills #1 and
#2's trigger) and **`gh workflow disable "Spot-check monthly recurring"`** (kills #3). Belt-and-suspenders
in data: set `system_state.global_processing_paused = true` and flip the 89 `auto_run_enabled → false`.
Note the gap to fix later: `drain-first-fetch` (and its `/api/agent/run` fan-out) has **no global-pause
gate** — even with the cron disabled, that's the one to harden before any worker is re-enabled.

(The disable/flag commands above were AUTHORIZED and EXECUTED 2026-06-28 17:52Z — see Impact section.)

---

## IMPACT ASSESSMENT — what the scrape actually WROTE (was stopping it sufficient, or is cleanup owed?)

Verified read-only against code + the 30-day write window. **Conclusion: metadata-only. No corpus cleanup owed.**

### check-sources (the hourly, live one) — METADATA ONLY
Exact writes (`assessAndUpdateSource`): `sources` UPDATE of reachability fields only —
`last_checked, next_scheduled_check, consecutive_accessible, total_checks, last_accessible/last_inaccessible,
successful_checks`, and `status` ONLY on a definitive-DEAD evict (404/410, d3-guarded) or reactivate. It
renders `maxTextLength:2000` but **uses only the HTTP status and discards the body** — it writes **NO
content** (`result_content_excerpt`, brief text, grounding pool: untouched). It writes **NO tier**
(base_tier/effective_tier/tier/classification: untouched). It **INSERTs only telemetry**
(`source_trust_events` accessibility_check, `monitoring_queue`) — **no new `sources` rows**.
Window proof: 87 accessibility_check/worker events in 30d; `status=inaccessible` count = **0** (evicted
nothing). → Category (a) near-harmless. **No cleanup owed.**

### spot-check (monthly) — CALIBRATION MONITOR, REPORT-ONLY
Re-classifies a 20-source sample via Haiku and **records the new scores in a `source_trust_events`
(`manual_review`) forensic log + the `admin_action_cooldowns` ledger**. There is **no `.from("sources").
update(...)` in the route** — the recommended re-classification (should-be-M/L) is *reported* (and drives
the 502 drift-alert), **never applied to the source row**. **No tier write, no content write, no new rows.**
Window proof: 20 manual_review/system events (its 2026-06-01 run); zero source mutations.

### drain-first-fetch — would create corpus, but IDLE in-window
Can seed `intelligence_items` + trigger `/api/agent/run` (real corpus creation), but `pending_first_fetch`
= 0 pending and `intelligence_items` created last 7d = **0**, `agent_runs` 7d = 0. Created nothing.

### New source rows? NO.
No armed/scraping path INSERTs `sources`. The ~1.6× row:institution inflation + 431 provisional backlog
are HISTORICAL (the tier1-* backfills + past discovery runs), not ongoing unattended insertion.

## KEY RECONCILIATION — the scraper did NOT re-tier; the drift diagnosis stands
`source_trust_events` tier_promotion/demotion **EVER = 3, all `created_by='system'`, all 2026-05-06.
ZERO from the worker/scraper, ever.** Neither check-sources nor spot-check writes source tiers. So the
**resolver's inputs (sources.base_tier/effective_tier/tier_override) were STATIC with respect to the
scrape.** The 264 FACT-stamp disagreements are therefore **NOT** explained by unauthorized re-tiering —
they remain the previously-identified mechanism (stamp-at-generation vs resolver-now; admin/migration
source registrations; the WS1 non-FACT stamps; the A6 backfill never re-run). "Source-of-truth tiers were
static" holds.

**Correction to the prior turn's framing:** the scrape was a real HOLD VIOLATION and unauthorized
*activity*, but it moved **reachability METADATA only** — not corpus content, not source tiers, not
provenance, not claims. So it was NOT a hidden contributor to the lane/stamp drift, and stopping it does
not retroactively stabilize the tier substrate (that was already static). Stopping it was correct for two
real reasons — honoring the hold, and closing the **latent drain→`/api/agent/run`** path that *would* move
the corpus if its queue ever filled — not because it had been corrupting the corpus.
