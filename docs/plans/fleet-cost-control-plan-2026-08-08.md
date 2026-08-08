# Fleet cost control plan — 2026-08-08

Operator-directed ("stage it"). Successor to the 2026-08-07 cadence cut, which the
Phase B measurement proved insufficient. Companion runbook:
[fleet-budget-control](../runbooks/fleet-budget-control.md). Charter source of truth:
[fleet-charters/authorship-worker](../runbooks/fleet-charters/authorship-worker.md).

## Measured facts (2026-08-08, this session)

1. **Phase A (kill-switch proof): PASSED.** Shard 0 fired 16:23:56Z with the halt row
   open; zero writes across intelligence_items / agent_runs / integrity_flags /
   staged_updates at T+3 and T+5.5 min; halt row untouched.
2. **Phase B (single-firing cost): ~1 percentage point of weekly subscription budget**
   (operator dashboard 15% → 16%; display rounds to whole points, so true value 0–2,
   centered ~1). The run minted zero items — that cost was almost pure fixed overhead.
3. **Fixed anatomy per firing** (computed from the exact fire payload, not estimated):
   ~18,300 tokens of prompt before any work — ~14,700 platform system prompt (not
   editable), ~2,000 environment appendix, ~1,600 charter. Re-billed every turn.
   Runs fire at `effort: high` on sonnet-5; the trigger API exposes a model knob but
   no effort knob.
4. **Cadence math:** 51 firings/day × ~1 pt ≈ 51 pts/day — the weekly budget dies in
   under 2 days. This reproduces the 2026-08-01 outage arithmetic; the 2026-08-07 cut
   (360 → 51/day) attacked frequency but not the fixed-cost-dominance, which is the
   actual root cause.

## Design changes (staged this session)

1. **Consolidation.** The 12 authorship shards collapse into ONE daily authorship
   worker (shard 0's trigger, renamed, cron `0 9 * * *`, batch up to 10/run —
   operator-tunable). Shards 1–11 are RETIRED: they stay disabled forever and are
   deleted after the consolidated worker's first instrumented run proves out.
   Rationale: the fixed 18.3k overhead amortizes over the batch; 5 items/firing paid
   ~3.7k/item of overhead, 10/firing pays ~1.8k, and one firing/day pays the platform
   prompt once instead of 48 times.
2. **Self-metering (accuracy, not averages).** The charter CLOSE step now sums the
   session's own transcript usage fields (input, output, cache read, cache write,
   turn count) into the RUN SUMMARY integrity_flags row — exact per-firing cost lands
   in the database from the first instrumented run onward. Fail-honest: if the
   transcript is unreadable the row records `metering=unavailable`, never an estimate.
3. **Charters versioned in the repo.** Until today every charter existed only in the
   trigger store (chat-only defect class). The authorship charter is now canonical at
   `docs/runbooks/fleet-charters/authorship-worker.md`; the trigger store is a deploy
   target. Rule: edit file → update_trigger → same PR.
4. **Maintenance workers (citation harvest, legacy remediation, summary sweep):**
   remain disabled and UNCHANGED — their charter texts exist only in the trigger
   store, retrieval-by-halted-fire was blocked by the session's tool classifier, and
   amending them blind would be guesswork. Next session action: operator copies the
   three prompts from the scheduled-tasks UI (or authorizes halted-fire retrieval);
   they then get the same treatment (repo-versioned, self-metering, consolidation
   into one rotating daily worker). Their combined 3 firings/day is a secondary term
   (~21 pts/week at measured rate) — real, but an order below the shard term was.

## Phase D — redefined (operator-gated, unchanged authority)

1. On the operator's word only: resolve the halt row, fire the consolidated
   authorship worker ONCE (Phase-B lock pattern: re-arm after STEP 0 passes).
2. Read the exact metering totals from its RUN SUMMARY row. No dashboard-delta
   guessing.
3. Operator rules on standing cadence with exact numbers: enable daily / adjust
   batch / hold. Only then does the trigger get enabled.
4. The 14 other triggers do NOT re-enable under any Phase D outcome; maintenance
   restart is a separate staged decision after their charters are retrieved.

## Projection at measured rate (to be replaced by metering)

One authorship firing/day ≈ 7 firings/week. Even at 2× the Phase-B cost per firing
(bigger batch, real work), ~14 pts/week versus the old design's ~357 — and the
per-item overhead falls ~4×. Numbers become exact after the first instrumented run.
