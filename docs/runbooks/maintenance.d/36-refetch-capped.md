## 36. `refetch-capped`

**New this runbook, lane ONESHOTS, 2026-09-06** (F25 expiry-52 disposition). Written from
`scripts/remediation/refetch-capped-worklist.mjs`'s own header and `docs/decisions/ADR-016-storage-side-
uncap.md`.

**Purpose**: the ADR-016 storage-side uncap drain. `agent_run_searches.result_content` was captured under
now-retired `PRIMARY_MAX_CHARS`/`CORROBORATOR_MAX_CHARS` caps; this drains the legacy-capped rows in full.
`mode=dry` (BUILD) is read-only: pages past the 1000-row cap, classifies the three legacy populations
(`legacy_40k`, `corroborator_60k`, `primary_600k`) by the exact premise-2 length predicates, dedups on
`(item_id, result_url)`, and emits a worklist - no fetch, no write. `mode=apply` (EXECUTE) refuses while
`system_state.global_processing_paused`, then per row: re-fetches `result_url` through the LIVE transport
ladder (`refetchThroughLadder`, no copied transport code), applies the DIFF-ON-RECAPTURE guard (every
grounded FACT span must still `.includes()`-match the fresh capture), and replaces the stored capture only
on a clean match; any drift or roadblock HOLDs (`integrity_flags`) and keeps the old capture. Resolves an
item's truncation-guard flag only once ALL its capped rows replaced clean.

**What it does NOT do**: never replaces a capture whose grounded FACT spans would go missing; never runs
EXECUTE without the explicit gate token below (ADR-016's own drain order: merge → deploy → BUILD worklist
→ operator lifts the pause hold → EXECUTE → review drift-holds).

**Upstream**: `src/lib/agent/canonical-pipeline.ts`'s `refetchThroughLadder`, `scripts/lib/db.mjs`
(`guardedUpdate`, `guardedInsert`) - called unmodified via the target script.

**Ruling**: ADR-016 (`docs/decisions/ADR-016-storage-side-uncap.md`) - an active, numbered Implementation
step, not yet executed, blocked on an open GUARD-1 pool-insert-size ruling.

**Dispatch**: `mode=dry` (BUILD) is always allowed - including inside an `all` dry fan-out, since it is
read-only and $0. `mode=apply` (EXECUTE) is GATED: refused (exit 1, no subprocess spawned, no fetch) unless
`arg` is EXACTLY `GUARD-1-accepted` - ADR-016's own explicit operator-acceptance token for the open
GUARD-1 ruling. No other value unlocks it.

**Artifact / read back**: `summary.json` under `$OUT_ROOT/refetch-capped/`, parsed from the target
script's own `scripts/tmp/refetch-capped-worklist-{build,execute}.json` artifact (populations, raw counts,
replaced/held/reground-recommended/flags-resolved). Confirm against `SELECT result_chars FROM
agent_run_searches WHERE id = ANY(<replaced ids>)` (migration 322's trigger-maintained column, section 57
below -- never a corpus-wide read that computes the length of result_content in SQL).

**First dispatch** (coordinator): `mode=dry`, `step=refetch-capped`, no `arg` - the BUILD worklist, safe
and read-only, to confirm the population counts against ADR-016's own expected `{legacy_40k:105,
corroborator_60k:15, primary_600k:1}` before any EXECUTE is ever considered (which additionally needs the
GUARD-1 ruling itself accepted - a separate operator decision this dispatch does not make).

---

