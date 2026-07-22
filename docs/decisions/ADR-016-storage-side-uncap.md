---
id: ADR-016
title: Storage-side uncap; a cap belongs at the synthesis window, never at capture/storage
status: accepted
date: 2026-07-21
scope: fsi-app generation/grounding pipeline (fetch->store->synthesise->ground), the PRIMARY_MAX_CHARS/CORROBORATOR_MAX_CHARS retirement, F17 size-cap doctrine, the legacy-capped agent_run_searches remediation
supersedes: the storage-side reading of the 2026-06-23 truncation fix (that a raised fetch cap is sufficient); PRIMARY_MAX_CHARS + CORROBORATOR_MAX_CHARS as capture-time caps
related: F17 size-cap doctrine (docs/design/cap-inventory-2026-07-06.md), ADR-013 (report-scope), the fetch-hold gate RD-11 (F16 signed callers), remediation-discipline section 2.1 (research-or-erase), the ICM scope-down-vs-full-delivery guard in fsi-app/.claude/CLAUDE.md
---

# ADR-016 — Storage-side uncap

## Decision (operator ruling, Jason, 2026-07-21)

> "We are NOT supposed to cap, because then the system runs analysis on incomplete data."

A cap applied at FETCH/STORAGE time makes incompleteness **permanent**. The captured document is sliced
before it lands in `agent_run_searches.result_content_excerpt`, so the stored pool row holds only the head of
the text and **every re-analysis inherits the loss** with no way to recover the discarded tail short of a
re-fetch. The storage-side caps are therefore removed. The pipeline captures and stores the **full** document.

Capping does not disappear, it **moves**. It becomes a **synthesis-window** decision, applied over a complete
stored capture (`SYNTH_INPUT_BUDGET_CHARS` / `SYNTH_PRIMARY_HARD_CEILING_CHARS`). A synthesis window is
re-openable: a later re-analysis, a wider grounding pass, or a chunked read can revisit the whole stored text.
A storage slice is not. This is the pipeline instance of the standing "scope-down vs full-delivery" guard
(fsi-app/.claude/CLAUDE.md): regulatory relevance is not pre-identifiable, so the qualifying clause can live
anywhere in the document, and only full-delivery-plus-coverage-forcing is correct at the storage layer.

## Evidence (each premise re-verified live 2026-07-22 before relying on it)

1. **All truncation was client-side.** `full.slice(0, max)` in `directFetchClean` and `apiFetchForHost`
   (`src/lib/agent/canonical-pipeline.ts`) and the `cap()` closure in `src/lib/sources/canonical-fetch.mjs`.
   The full text is in memory at the moment it is discarded, and `truncated` + `fullLength` are already
   reported alongside, so the loud-on-bind machinery already exists.
2. **Damaged populations in `agent_run_searches`** (the caps that already fired, verified live):
   - legacy 40k cap: 106 rows `searched_at < 2026-06-28 AND length BETWEEN 39900 AND 40000` (raw).
   - primary 600k cap: exactly 1 row at `length = 600000`.
   - corroborator 60k cap: 15 rows at `length = 60000` or `59900..59999`.
   - 22 open `integrity_flags` rows with `created_by = 'truncation-guard'`.
3. **No storage migration needed.** `result_content_excerpt` is `text` (~1GB ceiling, migration 112).

## Changes

- `src/lib/agent/generation-config.ts`: retire `PRIMARY_MAX_CHARS` (600000) and `CORROBORATOR_MAX_CHARS`
  (60000). Add `STORAGE_MAX_CHARS = Number(process.env.STORAGE_MAX_CHARS || 10_000_000)`, documented as a
  **pathological-page sanity ceiling, not an operating cap**. A hit still fails loud: the fetch reports
  `truncated` + `fullLength` and `recordTruncation` fires the existing `truncation-guard` flag. The synthesis
  window caps (`SYNTH_INPUT_BUDGET_CHARS`, `SYNTH_PRIMARY_HARD_CEILING_CHARS`) are unchanged, that is where a
  cap now legitimately lives.
- `src/lib/agent/canonical-pipeline.ts`: every use of the two retired constants replaced with
  `STORAGE_MAX_CHARS` (the import, `blFetchCleanFor`, both `truncEvents` cap fallbacks, the `fetchMeta`
  corroborator call, the `fetchText` grounding call). `fetchText`'s `max` parameter is now **required** (the
  `= 40000` default is deleted) so omitting it, which would silently reintroduce the retired 40k storage cap,
  is a compile error. A thin `refetchThroughLadder(url, caller)` is exported (a wrapper over the internal
  `fetchMeta`) so the remediation script re-fetches through the LIVE ladder with no copied transport code.
- `.discipline/fitness/functions/F17-size-cap-doctrine.mjs` (+ test): the two retired registry entries removed,
  `STORAGE_MAX_CHARS` added classified `surfaced`, fixtures updated, red-then-green passes.
- `scripts/remediation/refetch-capped-worklist.mjs` (new): BUILD (read-only, default) classifies the three
  legacy populations and emits a worklist; EXECUTE re-captures each stored URL in full through the live ladder,
  guarded by a diff-on-recapture check, and resolves a `truncation-guard` flag only when all of an item's
  capped rows replaced clean.

## Two design questions resolved (not inherited)

- **a. `discoverCorroborators` receiving the uncapped primary.** Audited end to end. The primary reaches the
  web_search prompt only through `primaryText.slice(0, 3000)` (an already-bounded discovery window at the call
  site, now annotated). The 10M capture never floods an LLM prompt. Every other consumer of the uncapped text
  is safe: `truncEvents` reads only `.length`, `captureForStorage` is in-memory classification, and
  `synthesiseAndWriteBrief` -> `buildSourceBlocks` windows via `SYNTH_INPUT_BUDGET_CHARS`. The only unbounded
  sink is the pool INSERT (question b).
- **b. GUARD-1 all-or-nothing pool INSERT can now carry a large row.** Presented as a FINDING for operator
  ruling (see the PR description). Summary: `result_content_excerpt` is `text` and PostgREST imposes no
  relevant byte cap; the constraining layer is the upstream API gateway, which Supabase does not document a
  fixed byte limit for and which cannot be empirically tested under the write-freeze. A single 10M-char row is
  ~10MB and passes with wide margin; only a pathological coincidence of many multi-MB captures in one item's
  pool would approach the gateway limit, and at that ceiling the sanity cap plus the truncation-guard flag keep
  the worst case bounded. An RPC-per-row transaction would preserve atomicity but does not reduce request-body
  size, so it does not by itself solve a gateway rejection; no code change is made pending the ruling.

## Drain order

1. Operator merges this PR and deploys (code caps gone).
2. Run `refetch-capped-worklist.mjs` (BUILD) to produce the worklist artifact.
3. Operator lifts the hold via `admin_set_pause_state` (EXECUTE refuses while `global_processing_paused`).
4. Run `refetch-capped-worklist.mjs --execute` (re-capture full, diff-guarded, F16 caller `unit3-remediation`).
5. Review the drift-holds and the `reground_recommended` list.

## Divergence recorded (premise, not overridden)

Premise 2 expected the legacy 40k population to dedup to **105** on `(item_id, result_url)`. Live data dedups
to **106**: there are zero duplicate `(item_id, result_url)` pairs in the 40k set, so dedup removes nothing
(raw 106 = deduped 106; 44 distinct items, 77 distinct URLs, 101 `block4 retroground` + 5
`canonical:generate-pool`). The BUILD run emits 106 / 15 / 1. Reported as a finding, not forced to 105.
