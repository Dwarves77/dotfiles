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
| 7 | Decision propagation (spec 08) | every table/function unbuilt; no ADR; §8 decisions unset [CONFIRMED, scout over 694 lines]. Operator ruling 2026-09-02: build it in this train; coordinator sets the §8 decisions in ADR-024 | no `entities` table |

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

### Lane SPEND — the classify path joins the spend chokepoint

Write set: `fsi-app/src/lib/llm/first-fetch-classify.ts`, `fsi-app/src/lib/llm/spend-client.ts`,
`fsi-app/.discipline/governance/secrets-registry.mjs`, `docs/ops/secrets-topology.md`,
`fsi-app/scripts/lib/run-artifact.test.mjs`, `fsi-app/.discipline/fitness/functions/F28-harness-run-integrity.test.mjs`
(the CONVENTION-parity assertion only), tests under `fsi-app/src/lib/llm/`.

Build: `firstFetchClassify` makes a raw `fetch` to Anthropic with no ticket and no `agent_runs` row, although
"first-fetch-classify" is a registered standing ticket class [CONFIRMED, Lane CONSUME report]. Route it through
the spend client's Haiku call path so every classify leaves the same telemetry row every other paid call does,
keep the function signature stable for its callers, and delete the driver-side logging wrapper Lane CONSUME had to
add once the chokepoint covers it (coordinator does that deletion at integration). Register `ANTHROPIC_API_KEY` in
the workflow-secrets registry and topology doc. Make `run-artifact.test.mjs`'s family assertion and F28's
CONVENTION-parity assertion derive from `ALLOWED_FAMILIES` instead of hardcoding the list, so adding a family
is one edit.

### Lane DP-SPINE — the entity spine (spec 08 §1)

Write set: `docs/decisions/ADR-024-decision-propagation.md`, `fsi-app/supabase/migrations/282_entities.sql`,
`283_entity_fk_columns.sql`, `fsi-app/scripts/entities/backfill-entities.mjs` (+ test),
`fsi-app/src/lib/entities/` (id builder, kind vocabulary, crosswalk helpers, tests),
`fsi-app/.discipline/fitness/functions/F30-entity-spine.mjs` (+ test), `docs/specs/08-flywheel-design.md` §6 status
lines only.

Decisions recorded in ADR-024 (operator ruling 2026-09-02: "if you decide that it needs to be done, we do it";
coordinator-set, each overridable by editing the named constant): (1) drain granularity: batch to a quiescent point;
(2) estimates back customer-visible ranges only, break-even given equal billing to the point; (3) floors
`FLOOR = { analysis: 0.50, calculation: 0.75, filing: 0.90 }`; (4) corridor identity: UN/LOCODE port-pair + mode,
`cl:corridor:<sha256-16 of "ORIGIN-DEST:mode">`.

Build: `entity_kind` enum, `entities`, `entity_identifiers` exactly as §1.1 (constraints included). Progressive
re-keying, not a big-bang rewrite: nullable `entity_id` FK columns added beside the existing text keys on
`intelligence_items` (`instrument_entity_id`, `jurisdiction_entity_id`), `sources` (`organisation_entity_id`),
`regions` (`jurisdiction_entity_id`), `emission_factors` (`corridor_entity_id` stays text per migration 258; do not
touch). Backfill script (dry default, `--apply` through `scripts/lib/db.mjs`): jurisdictions from ISO codes
present in items/regions, instruments from `canonical_instrument_key` (CELEX/ELI crosswalk rows), organisations
from `sources` hosts (scheme `HOST`, and `LEI` where `data_sources`/GLEIF rows already carry one). F30 = the
falsification test §7.1 in measurable form: counts text-keyed rows whose FK column is still null per table and
fails only on regression (the count may not rise between two commits; baseline file in the fitness dir).

### Lane DP-ENGINE — propagation engine, state machine, isolation, antitrust (spec 08 §2–§5)

Depends on DP-SPINE. Write set: `fsi-app/supabase/migrations/284_propagation_outbox.sql`,
`285_derivation_dag_and_derived_values.sql`, `286_statutory_and_estimates.sql`, `287_sensitive_aggregates.sql`,
`fsi-app/src/lib/propagation/` (types, `admissible-for.ts` with `FLOOR`, `effective-confidence.mjs`,
`drain.ts` = `runPropagationDrain(caller, {mode, batch})`, `register-derivation.ts`, tests),
`fsi-app/scripts/turns/run-propagation-drain.mjs` (+ test), `.github/workflows/propagation-drain.yml`,
`fsi-app/scripts/harness-runs/propagation/PENDING-RUN.md`, family registration lines, F31 (no read of
`derived_values` outside `src/lib/propagation/`), F32 (statutory purity: a fixture insert whose input graph touches an
estimate must fail).

Build, per the spec text: outbox table + `emit_propagation_event()` trigger attached to `emission_factors`,
`market_series`, `regional_data_facts`, `derived_values`; `derivation_edges` + `assert_acyclic()`;
`derived_values` with `lifecycle`, `admissibility`, `origin_class`, `derivation`, `method_id/version`,
`base_confidence`, `asserted_at`, `half_life_days`, retained history (new row per recompute, `supersedes`);
`effective_confidence()` SQL as §3.2; `statutory_computations` and `estimated_values` as §4 Layer 1 with the
`assert_statutory_purity()` trigger (Layer 3); `sensitive_field_policy`, `publish_aggregate()` SECURITY DEFINER with
k ≥ 5 and the overlapping-cohort refusal via `aggregate_query_log` (§5). RLS: application role reads
`derived_values_admissible` view only. Drain: batch to quiescent point, topological order over the DAG, recompute
via registered method functions (`src/lib/propagation/methods/`), `dry` reports the closure without writing.
Workflow dispatch-only, same scaffold as `source-sweep.yml`.

### Lane DP-SURF — the surfaces the engine feeds

Depends on DP-ENGINE. Write set: `fsi-app/src/lib/operations/automate-vs-hire.mjs` (+ test),
`fsi-app/src/lib/market/carbon-intensity.mjs` (+ test), `fsi-app/src/lib/propagation/methods/*.mjs`,
`fsi-app/src/components/figures/StatutoryFigure.tsx`, `EstimatedFigure.tsx`, `RecalculationNotice.tsx`,
`fsi-app/src/app/operations/**` (calculator section only), `fsi-app/src/app/market/[slug]/**` (carbon-intensity
block only), `fsi-app/src/app/api/notices/route.ts`, `fsi-app/scripts/propagation/seed-derived-values.mjs` (+ test).

Build: (a) Operations automate-vs-hire: inputs from `regional_data_facts` (BLS OEWS wages, Eurostat energy prices,
both producers armed) plus reader-entered capex/throughput; outputs npv, payback, break-even wage as
`estimated_values` rows with `derivation_edges` to their input facts; rendered with `EstimatedFigure` as a range,
break-even with equal billing (ADR-024 §2). (b) Carbon intensity per tonne-km by mode and jurisdiction from
`emission_factors` (`wtw_co2e`, `quantity_basis`) as `derived_values` (`derivation: calculated`,
`origin_class: derived`), on the market signal detail. (c) FuelEU Maritime Annex IV penalty as the first
`statutory_computations` method (formula and constants cited to the regulation; reader supplies compliance balance
and energy) rendered with `StatutoryFigure`; the lane must verify the current Annex IV formula and unit price
against EUR-Lex and label anything unconfirmed. (d) Recalculation notices: `GET /api/notices` returns derived values
superseded since the reader's last visit for entities on the org's `org_watchlist`, rendered by
`RecalculationNotice` with both versions, the spec's step 4. (e) `seed-derived-values.mjs` computes the initial
closure so the first drain has real dependents.

### Not a lane — operator-only

- Enable "Allow GitHub Actions to create and approve pull requests"; create `EIA_API_KEY` secret; confirm
  `APP_URL`/`WORKER_SECRET` still valid.
- Dispatches after landing (coordinator, browser): `ledger-consume` plan, `population-turn` dry then apply
  (limit 50, `--capture`), `change-detection` dry, `source-sweep` `register-federal-register` dry and `feed`
  dry, `producers` `ecb-fx` dry then apply. Each artifact read against the live table before the next.

## 3. Integration and gates

1. Merge lanes onto `train/system-completion` in order CONSUME, SPEND, POP, CD, PROD, SURF, DP-SPINE, DP-ENGINE, DP-SURF; resolve the family-registry
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
- Spec 08 is built as three chained lanes (SPINE → ENGINE → SURF); the entity re-keying is progressive (FK columns
  beside text keys, F30 forbids regression), not a one-commit rewrite of every reference.
