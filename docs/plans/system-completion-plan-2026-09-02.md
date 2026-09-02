# System completion plan — 2026-09-02

Base: `origin/master` `822c675` (#515). Operator request (2026-09-02): "build the remaining parts of the
system now. make a build plan and use multiple sonnet agents". Written after four read-only scouts over the
tree and one live read of the database; every number below is labelled.

## 0. What "remaining" means, measured

The runtime layer proven on 2026-09-01 (`corpus-turn.yml`, `source-sweep.yml`, delivery step, Train 14)
runs the corpus and the EUR-Lex register. Everything that still runs only by hand, or not at all:

| # | Part | State [evidence] | Live number |
|---|------|------------------|-------------|
| 1 | Ledger consume (candidate → classify → mint/reject) | `consumePortalCandidates` has no production caller [CONFIRMED, `src/lib/intake/portal-harvest.ts:198`, grep] | 1,454 `portal_link_candidates.status='candidate'` [CONFIRMED live] |
| 2 | Population runs (census → record-grade mint) | exporter and apply script do not exist; `run-mint-batch --grade record` is DB-less by design [CONFIRMED, `docs/plans/record-tier-population-plan-2026-09-01.md` §3, §6] | 3,661 `would_mint`; 680 have a >200-char capture at `document_url`; only 31 of those have no item at that URL; 549 archived items without `archive_reason` (489 EUR-Lex) [CONFIRMED live] |
| 3 | Change detection runtime | `runReconcilePass` runs only inside the check-sources route; `drainChangeSweepUpdates` is unexported and only reached by `runIntakeCycle` apply; `source-monitoring.yml` schedule commented out [CONFIRMED] | 0 pending `monitoring_queue` change rows, 0 pending `staged_updates` [CONFIRMED live] |
| 4 | Market producers | `ecb-fx` fully implemented, `ENABLED=false`, `data_sources` has no `ecb` row (FK gate); `eia-v2` implemented, no workflow step, needs `EIA_API_KEY` secret; `series-registry.mjs` says eia-v2 `implemented:false` (stale) [CONFIRMED] | `market_series`: 6 series keys, 1 row each (oil bulletin) [CONFIRMED live] |
| 5 | Market Intel surface | spec §6 lists 12 components; freshness panel, methodology drawer, comparative read absent; "Unverified" chip unconditional (`isSignalType = !!r.type`) [CONFIRMED, `docs/specs/02-market-intel.md` §9] | — |
| 6 | FR / feed first walks | walkers built, never dispatched [CONFIRMED, harness records] | — |
| 7 | Decision propagation (spec 08) | every table/function unbuilt; no ADR; three §8 product decisions unset (`FLOOR[use]`, drain granularity, estimate-in-decisions) [CONFIRMED, scout over 694 lines] | no `entities` table |

## 1. Rulings this plan is built under

- Browser-only transport to GitHub (bundle → web upload → Codespace → PR → squash-merge). No direct git push from the cloud.
- One writer per shared dataset; harness and flywheel communicate through run artifacts (F28) and `LAST-TURN.json`.
- No standing schedules during build; every item already in the system gets run through the runtime by dispatch.
- Spend: no standing dollar ceiling (2026-07-13); every paid call leaves an `agent_runs` row (2026-07-06); `first-fetch-classify` is a named standing ticket class (`STANDING_TICKET_CLASSES`).
- ADR-023: producer `ENABLED` const is the reviewed-code gate; workflow `mode` is the per-run gate; dispatch-only in build mode.
- Record-grade items may appear on customer surfaces (operator, 2026-09-01). WO-26 exclusions stay archived (record-tier plan §4).
- "There is NO small follow-up fix" — a lane that finds a defect in its write set fixes it in the same lane.

## 2. Lanes (disjoint write sets)

Each lane is a Sonnet agent in its own worktree off `train/system-completion` (= `822c675`), writes only inside
its write set, runs its own tests plus `node --test` on touched files, and reports `git log -1`. The
coordinator merges lanes onto the train branch, resolves the two known shared-file touch points
(`scripts/lib/run-artifact.mjs` `ALLOWED_FAMILIES`, F28 `GOVERNING_FILES`), runs every gate, lands, dispatches.

### Lane CONSUME — ledger consume runtime

Write set: `fsi-app/scripts/turns/run-ledger-consume.mjs` (+ `.test.mjs`), `.github/workflows/ledger-consume.yml`,
`fsi-app/scripts/harness-runs/ledger-consume/` (PENDING-RUN.md, CONVENTION note), family registration lines,
`docs/runbooks/CORPUS-TURN-RUNBOOK.md` (new section only).

Build: a driver that loads `consumePortalCandidates` through jiti (`createJiti(import.meta.url, {interopDefault:true,
alias:{"@":resolve(ROOT,"src")}})`, the `scripts/canonical-pipeline-proof.mjs` pattern), `mode=plan` default,
`mode=apply` gated by a source-level `const LEDGER_CONSUME_ENABLED` AND the workflow `mode` input AND
`ANTHROPIC_API_KEY` presence. `fetchDoc` is a polite plain fetch (1 req/s, same discipline as
`run-source-sweep.mjs`'s `politeFetch`). `--limit` default 50, `--source-id` optional, cursor persisted in the
artifact so consecutive runs keyset-page instead of re-reading. Every classify call must leave telemetry: the lane
finds the sanctioned way (`logSpendRun` in `src/lib/llm/spend-client.ts`, or the `agent_runs` write
`firstFetchClassify`'s existing callers use) and wires it; if none exists inside the write set, the artifact
records per-call token counts and estimated USD and the report says so. Artifact family `ledger-consume`
(F28 schema; per_item = candidate outcomes; metrics = discovered/fetched/classified/promoted/rejected/est_usd).
Workflow mirrors `source-sweep.yml` (secrets check, hydrate guard for `ledger-consume/*` branches, commit,
push, `deliver-artifact-branch.sh`).

### Lane POP — population runtime

Write set: `fsi-app/scripts/mint/export-census-rows.mjs` (+ test), `fsi-app/scripts/mint/apply-mint-batch.mjs`
(+ test), `.github/workflows/population-turn.yml`, `fsi-app/scripts/mint/MINT-RUNBOOK.md` (new §11 only),
`docs/plans/record-tier-population-plan-2026-09-01.md` (status lines only).

Build:
1. `export-census-rows.mjs`: the record-tier plan §3 join (`census_worklist` would_mint × `sources` ×
   `agent_run_searches.result_content` by `result_url = document_url`, >200 chars), `--limit` (default 50),
   `--source-id`, `--celex-prefix`, `--exclude-held` (skip rows whose `document_url` already has an
   `intelligence_items` row), and for rows with NO capture a `--capture` flag that fetches `document_url`
   politely ($0, 1 req/s, text extracted the way `register-walk.mjs`/`feed-walk.mjs` extract) and fills
   `captured_text` in the export. `item_type` from the CELEX sector/type mapping already used at mint time;
   anything unmappable is emitted with `"hold": "<reason>"` and excluded from the payload set (plan §3 item 4,
   recorded, not defaulted). Output: the enriched-row JSON `run-mint-batch.mjs --census-rows` documents.
2. `apply-mint-batch.mjs`: takes `<basename>.apply-ready.json`, and for each payload: M4 holder pre-check
   (`canonical_instrument_key` across ALL `intelligence_items`, archived included; a holder with
   `archive_reason='out_of_scope_wo26'` → `not_applied_wo26_excluded`; any other holder →
   `not_applied_holder_conflict`), inline source registration through `registerSource` when the payload's
   source is absent, then the SAME write order the sanctioned path uses (`src/lib/intake/mint-item.ts` via jiti
   if `MintPlan` carries sections/claims/search_results; otherwise the insert order of
   `src/lib/agent/canonical-pipeline.ts`: `intelligence_items` → `agent_run_searches` → `intelligence_item_sections`
   → `section_claim_provenance` → `item_gate_a_state` → `intelligence_item_citations`), `item_grade='record'`,
   then `rpc validate_item_provenance`, then the `census_worklist` row stamped resolved. `--dry` default;
   `--apply` writes through `scripts/lib/db.mjs` guarded functions with a cite. Enriches the mint run artifact's
   metrics (`db_deltas`, `not_applied_*`) the way `mint-run-006.json` records them.
3. `population-turn.yml`: dispatch-only, `mode` dry/apply, inputs `limit`, `source_id`, `celex_prefix`,
   `capture` (bool). Steps: stamp-wo26 (`--apply` only in apply mode, idempotent) → export → `run-mint-batch
   --census-rows --grade record --execute` → apply-mint-batch (mode-gated) → `propose-tags.mjs --dry --since <run
   start>` (ratification stays operator-gated) → commit artifacts → push → deliver.

### Lane CD — change-detection runtime

Write set: `fsi-app/scripts/turns/run-change-detection.mjs` (+ test), `.github/workflows/change-detection.yml`,
`fsi-app/src/lib/intake/run-intake-cycle.ts` (export a drain entry only; no behaviour change to `runIntakeCycle`),
`fsi-app/src/lib/sources/reconcile.ts` (add `{dryRun}` that counts and reports without writing; default false),
`fsi-app/scripts/harness-runs/change-detection/`, family registration lines.

Build: step 1 calls the deployed `POST /api/worker/check-sources` with `x-worker-secret` (the route already
fingerprints, records `monitoring_queue` change rows and runs `runReconcilePass` in-process) with an explicit
`limit` input (Browserless units per source; the lane reads the route to report the per-source cost and the
default batch); step 2 runs `run-change-detection.mjs` through jiti: `runReconcilePass` (dry counts in `dry`
mode) then the exported drain (`UPDATE_DRAIN_LIMIT` respected, apply mode only). Artifact family
`change-detection` (per_item = sources checked / changes recorded / updates drained). If the route cannot be
called from a workflow without `APP_URL`/`WORKER_SECRET` secrets (they exist for `source-monitoring.yml`), the
lane reuses those secret names exactly.

### Lane PROD — market producers to parity

Write set: `fsi-app/scripts/producers/market/ecb-fx-producer.mjs` (ENABLED flip + header), `fsi-app/supabase/
migrations/281_data_sources_ecb.sql`, `fsi-app/src/lib/market/series-registry.mjs`, `.github/workflows/producers.yml`,
`fsi-app/scripts/producers/market/*.test.mjs` as needed, `docs/specs/02-market-intel.md` §7 row for ECB.

Build: register `data_sources` row `ecb` (licence: ECB euro foreign exchange reference rates, reproduction permitted
with source acknowledgement; the lane cannot reach `ecb.europa.eu` from the sandbox, so the licence text is
written `[UNCONFIRMED until the first runner dry run]` and the runner's dry-run output is the confirmation);
`ENABLED = true` on ecb-fx with the ADR-023 reviewed-change note; registry parity (`eia-v2.implemented=true`,
`producerScript` named, `licenceStatus` current; `refresh-published-price-statistics` documented as a derived
step, not a series); `producers.yml`: a `refresh-published-price-statistics` dispatch option + step, and the
eia-v2 step ONLY if the repo's secrets-reference audit allows a conditional reference (`.discipline`
fitness/audit files are read, not edited; if it forbids it, the step stays absent and the report says which
check forbids it). Migration numbering: 281 is next [CONFIRMED, highest is 280].

### Lane SURF — Market Intel honest surfaces

Write set: `fsi-app/src/app/market/**`, `fsi-app/src/components/market/**`, `fsi-app/src/lib/market/
series-board-view-model.mjs` (+ tests), `fsi-app/src/__tests__/market-*.test.mjs`. Reads `series-registry.mjs`,
never edits it (Lane PROD owns it).

Build, from `docs/specs/02-market-intel.md` §6/§9: (a) freshness panel per series from `as_at_date`/
`reference_period` against the registry cadence (current/ageing/stale/unknown, the vocabulary freshness-derived
already uses); (b) methodology/provenance drawer per series from the registry (`source_key`, licence, derivation,
`method_version`, n_observations) with no claim the data does not carry; (c) the "Unverified" chip fixed to the
promotion state the spec names, not `!!r.type`; (d) comparative ribbon Δ1w/Δ1m/ΔYoY computed from history when
≥2 points exist per series and rendered as "one observation, no delta yet" otherwise (the live table has 1 row per
series [CONFIRMED]). No new tables, no RPC changes. `tsc` clean, `next build` not required in-lane.

### Not a lane — operator decisions and dispatches

- Decision propagation (spec 08): NOT built in this train. Reasons, all confirmed by the scout: no `entities`
  table and no ADR; the spec's own §8 says the confidence floors "should not be picked by whoever writes the
  code"; §1.3 requires re-keying every text reference to `entity_id` (repo-wide). The build-ready next step is a
  design spike that the operator commissions: answer §8 items 1–3, write the ADR, prototype `entities` +
  `entity_identifiers` DDL. Deliverable when commissioned: `docs/decisions/ADR-024-decision-propagation.md`.
- Operator-only: enable "Allow GitHub Actions to create and approve pull requests"; create `EIA_API_KEY`
  secret; confirm `APP_URL`/`WORKER_SECRET` still valid.
- Dispatches after landing (coordinator, browser): `ledger-consume` plan, `population-turn` dry then apply
  (limit 50, `--capture`), `change-detection` dry, `source-sweep` `register-federal-register` dry and `feed`
  dry, `producers` `ecb-fx` dry then apply. Each artifact read against the live table before the next.

## 3. Integration and gates

1. Merge lanes onto `train/system-completion` in order CONSUME, POP, CD, PROD, SURF; resolve the family-registry
   touch points; add `meta-harness-run-007` + proposer pass (run-artifact.mjs and F28 are meta-harness governing
   files); source-sweep `LAST-PROPOSER-PASS.md` updated to name run-006 (branch `source-sweep/33575226376`, issue
   #516, merged into this train).
2. Gates: `run-test-suite.sh`, fitness runner (all functions), `tsc --noEmit`, meta-gate, discipline engine on
   the range, memory gate (addendum + board + INDEX in the same commit).
3. Land: bundle → GitHub web upload → Codespace → `git fetch <bundle> HEAD:refs/heads/train/system-completion`
   → push → PR → squash-merge → delete Codespace + branch.
4. Memory: Addendum 84, PROGRAM-BOARD thread "System completion train", INDEX line for this plan.

## 4. What this plan does not claim

- It does not claim the population backlog is cleared: the first apply run mints at most 50 record-grade items
  and the 31-row no-holder set is the only immediately captured, unminted slice; the rest needs `--capture` runs.
- It does not arm anything: every workflow is dispatch-only; `ecb-fx` needs the operator's PR merge as its
  reviewed-change gate and a dry run on the runner before its first apply.
- It does not build spec 08.
