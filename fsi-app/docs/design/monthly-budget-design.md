# Month-Scoped Spend Budget — Design (2026-07-06)

Standing dispatch item 6b (monthly budget prep). Converts the spend chokepoint's **all-time lifetime cap**
into a **month-scoped budget**, minimal-change and reuse-first. Recommendation for the operator to set the number.

## 1. The shift: lifetime cap → month-scoped seed
Today `funded-pass.mjs` seeds `runningSpentUsd` from `readProgramTotalPaginated` = SUM(`agent_runs.cost_usd_estimated`)
across **all history**, checked against `SPEND_CEILING_USD` ($85 lifetime). Program ~$20 → lifetime headroom shrinks forever.

Month-scoped seed changes ONLY *what the seed sums*: rows WHERE `started_at >= <first instant of the current
UTC calendar month>`. `agent_runs.started_at` already exists (written in `recordSpendCall` as `new Date().toISOString()`),
so **no schema change**. `runningSpentUsd` then = month-to-date spend; the same `assertBudget` / `fitsUnderCeiling` /
`projectBatchFitsBuffer` math reinterprets the ceiling as a **monthly** budget that resets naturally as old rows
fall out of the window.

## 2. What changes / what stays (minimal, reuse-first)
- **Add** `readMonthlyTotalPaginated(fetchPage, pageSize)` to `program-total.mjs` — identical to the all-time
  paginator except the runner's injected `fetchPage` adds `.gte("started_at", monthStartIso)` (funded-pass.mjs ~line 84).
  Keep the pure `sumCostRows` + `MAX_PAGES` guard + paginated advance verbatim. The month boundary lives in the
  runner's closure, so `program-total.mjs` stays env/clock-free and node-testable.
- **Change:** the `fetchPage`/`seedSpend` caller in each runner; `SPEND_CEILING_USD` reinterpreted as monthly (value only).
- **Unchanged:** per-item breaker (`PER_ITEM_CIRCUIT_BREAKER_USD=$3`, orthogonal to the window); the auto-telemetry
  invariant (`unloggedCalls`/`markCallLogged`/`assertLedgerDrained` — it's exactly what makes the monthly seed
  trustworthy); the buffer math (`CEILING_BUFFER_USD`, `projectBatchFitsBuffer`, `fitsUnderCeiling`).

## 3. Month-boundary handling
UTC calendar month (matches `started_at`'s UTC ISO). `monthStartIso = new Date(Date.UTC(y, m, 1)).toISOString()`.
Compute **once at seed time** and hold for the whole (short-lived) process — a batch crossing midnight on the 1st
keeps its opening window; the bounded under/over self-corrects next run. Do NOT recompute per-call. Ceiling + buffer
keep current semantics; only the accumulator baseline is month-scoped.

## 4. Proposed default monthly number — **$50/month (recommended)**
Measured basis: ground-only ~$0.15–0.40/item; a full quarantine cascade ~$9–18; generation/seek-more adds more later.
- **$30** — ~1–2 cascades OR ~75–200 ground-only items; fine for maintenance months, tight if generation resumes.
- **$50 (recommended)** — a full cascade **plus** a healthy generation/seek-more allotment in one month
  (~$18 cascade + ~$30 residual) without repeated top-up pauses. Soft cap $45; the $3 breaker is ~6% of the month
  (good containment ratio).
- **$85** as a monthly cap = generous but risks normalizing higher burn.

**Operator sets the number** via `SPEND_CEILING_USD`. This is a recommendation, not a default I applied.

## 5. Monthly close-out reconciliation
Close-out line = SUM(`cost_usd_estimated`) WHERE `started_at` in month **vs** the real Anthropic month-over-month
balance delta. The ledger is an *estimate* (`costUsdForModel` at configured rates) + conservative corrective rows,
so expect the known **~$0.22 estimate-under-real discrepancy** (ledger runs slightly UNDER real). Report both + the
delta; a delta materially above ~$0.22 signals an unlogged call (auto-telemetry should already have blocked it) or a
rate drift in `SONNET_*_USD_PER_MTOK` — investigate before the next month's runs.

## Status
DESIGN ONLY — not built. Build = add `readMonthlyTotalPaginated` + flip the runner's seed to the month window +
operator sets `SPEND_CEILING_USD`. No paid work; no schema change.
