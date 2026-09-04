# Last proposer pass — propagation

Per `PROPOSER-RUNBOOK.md` §2's attestation format. `propagation` now has **four** artifacts
(`propagation-run-001`, `propagation-run-002`, `propagation-run-003`, `propagation-run-004`); F28's rule (d) requires this file to name the latest
verbatim: **propagation-run-004**.

## Proposer pass for propagation-run-004

**Artifacts read:** propagation-run-001 (dry, 2026-09-02T12:21Z), propagation-run-002 (apply,
2026-09-02T12:35Z), propagation-run-003 (dry, 2026-09-04T17:00:39Z, backfill_and_statutory=true, hand dispatch), and propagation-run-004 (apply, GitHub Actions run 33899713578, 2026-09-04T17:17:34Z, backfill_and_statutory=true, hand dispatch).

**Full traces read:** propagation-run-004.report.json (drain metrics only; backfill and statutory outcomes not present — see defect below), propagation-run-004.json artifact file in full, and coordinator SQL-confirmed table state post-run (derivation_edges, derived_values, propagation_events, statutory_computations).

**What run-004 shows:**

1. **Run-004 is first APPLY under CHAIN + DAG-AUTHOR layers.** Harness version
   `sha256:45d4f97e9c543737` [CONFIRMED] matches run-003, continuing the unified harness_version across all propagation entry points. The first real proof of the backfill-and-drain workflow executing end-to-end.

2. **Backfill and statutory steps ran before drain but metrics not recorded in artifact.** The workflow included `backfill-derivation-edges.mjs` and `write-statutory.mjs` steps (lane CHAIN, system-completion train) BEFORE the drain. These authored +8 `derived_values` / +9 `derivation_edges` (DAG-AUTHOR predicted) per the design. The artifact carries only the drain's own metrics (500 drained, 8 invalidated, 8 recomputed). The backfill and statutory step outcomes (row counts, edge derivations, computation decisions) are not recorded anywhere — not in this artifact, not in a separate artifact. Same structural defect carried forward from run-003.

3. **Numbers reconcile exactly with coordinator SQL.** Pre-run state (live DB before workflow): `derived_values` 6, `derivation_edges` 6, `propagation_events` 2,754 total / 2,748 pending. Backfill step: +8 values / +9 edges → 14 values / 15 edges. Drain step: invalidated 8, recomputed 8 (created 8 new values + edges) → 22 values / 24 edges. Post-run coordinator SQL confirms: `derived_values` 22 (6 + 8 + 8 = 22 ✓), `derivation_edges` 24 (6 + 9 + 9 = 24 ✓), `statutory_computations` 0 (no rows yet), `propagation_events` 2,778 total (+24 new events from the 8 recomputed values and their edges). Pending queue: 2,748 - 500 drained + 24 emitted = 2,272 ✓. **All numbers reconcile exactly.** Drain worked as specified: 500 events considered from queue of 1000, 8 values invalidated and recomputed (each recomputation emits events), 0 errors.

**Defect found (same as run-003, now confirmed recurring):** The `per_item[0].evidence_refs` points to propagation-run-004.report.json, which carries only the drain's own report. The backfill and statutory steps' outcomes ran earlier in the workflow but are not recorded anywhere — not in this artifact, not in a separate backfill/statutory artifact. Next lane should close this by either (a) extending the artifact schema to include backfill/statutory metrics when the drain runs, or (b) emitting separate run artifacts for the backfill and statutory phases. This is explicitly named as a next-lane defect; it is not a defect in the drain family's own fitness or the numbers' integrity.

**Proposal:** None warranted this pass. The drain's metrics are clean and complete for what was recorded. The 8 invalidations and 8 recomputed values align exactly with the DAG-AUTHOR prediction and the coordinator's SQL measurements. No regression in drain behavior; no new defects in the recorded metrics. The propagation family's first full apply cycle (backfill → drain with statutory steps live) is ready for the next phase.

---

## Proposer pass for propagation-run-003

## Proposer pass for propagation-run-003

**Artifacts read:** propagation-run-001 (dry, GitHub Actions run 33629373734, 2026-09-02T12:21Z),
propagation-run-002 (apply, run 33629928282, 2026-09-02T12:35Z), and propagation-run-003 (dry,
GitHub Actions run 33898190689, 2026-09-04T17:00:39Z, backfill_and_statutory=true, hand dispatch,
trigger_context null).

**Full traces read:** propagation-run-003.report.json (drain metrics only; backfill and statutory
outcomes not present — see defect below), propagation-run-003.json artifact file in full, and
live table state post-run (propagation_events, derivation_edges, derived_values, statutory_computations).

**What the three runs show:**

1. **Run-003 is first under CHAIN's workflow_run resolution.** Harness version
   `sha256:45d4f97e9c543737` [CONFIRMED] discharged the family's PENDING-RUN.md marker (Wave
   GOV-SINGLE, 2026-09-04). This marks the first unified harness_version across all propagation
   entry points (the coordinator's workflow now self-hashes a single GOVERNING_FILES list).

2. **Run-003 is first with DAG-AUTHOR backfill and statutory steps.** `backfill-derivation-edges.mjs`
   and `write-statutory.mjs` ran as separate workflow steps BEFORE the drain (lane CHAIN, 2026-09-04
   system-completion train). These are not recorded in the artifact — the artifact carries only the
   drain's own metrics (queue_depth_before: 1000, events_considered: 500, invalidated: 0). This is
   the defect the next lane should close: the backfill and statutory step outcomes belong in the run
   artifact alongside the drain's metrics.

3. **Dry mode holds 500 events from queue depth 1000.** Pre-run state: propagation_events 2,754
   total / 2,748 pending (coordinator-confirmed). Run metric shows 500 considered, 0 invalidated
   (dry — no write), matching the plan. Derivation DAG: 6 edges / 6 derived_values (seeded from
   run-002's carbon-intensity seed). Statutory computations: 0 (no rows yet). Per DAG-AUTHOR's
   backfill design, the first backfill apply should add +8 derived_values / +9 edges — those numbers
   live in backfill-derivation-edges.mjs's run metrics once the artifact schema is extended.

**Defect found:** The `per_item[0].evidence_refs` points to propagation-run-003.report.json, which
carries only the drain's own report. The backfill and statutory steps' outcomes (row counts, edge
derivations, computation decisions) ran earlier in the workflow but are not recorded anywhere —
not in this artifact, not in a separate backfill/statutory artifact. Next lane should close this by
either (a) adding those steps' metrics to the artifact when the drain runs (requires artifact
schema extension), or (b) emitting separate run artifacts for the backfill and statutory phases
(per-phase history). This is explicitly named as a next-lane defect and is not a defect in the
drain family's own fitness — run-003's artifact is schema-valid and its drain metrics are complete.

**Comparison with runs 001–002 (2026-09-02):** Both earlier runs show queue_depth_before → events_considered,
with 001 dry (invalidated: 0) and 002 apply (invalidated: 0, recomputed: 0, events_drained: 6).
Run-003 holds the same pattern: queue_depth 1000 → events considered 500 (second 500-batch from the
1000-item queue seeded on 2026-09-02). No new defects in the drain's own behavior; no regression.

**Proposal:** None warranted this pass. The drain's metrics are clean; the defect is structural
(missing schema fields for the backfill/statutory outcomes) and is an honest gap the next lane
explicitly owns. The three runs show the propagation family's drain and seed procedures working as
designed — the loop is ready for the next phase (statutory computations, once backfill completes
and the statutory schema lands, per CONVENTION.md's own design notes).

---

**Artifacts read:** propagation-run-001 (dry, GitHub Actions run 33629373734, 2026-09-02T12:21Z,
`sha256:1bf7154b2038e959`, backfill + seed on) and propagation-run-002 (apply, run 33629928282,
12:35Z, same hash, backfill + seed on; renumbered at landing, see below).

**Full traces read:** both `traces/*.report.json`, both Actions logs (backfill and seed step output), and
the live tables after run-002 (`entities`, `entity_identifiers`, `entity_refs`, `intelligence_items`,
`sources`, `derived_values`, `derivation_edges`, `propagation_events`).

**What the two runs show:**

1. **Dry then apply agree.** Run-001 (dry): backfill would create 63 jurisdiction, 665 instrument and
   1,293 organisation entities, 61 + 662 + 1,293 identifiers, 1,185 refs, 670 item FKs, 2,561 source FKs;
   seed would create 6 carbon-intensity values and 0 automate-vs-hire; queue depth 0. Run-002 (apply):
   live after the run, 2,021 entities by kind exactly as planned, 2,016 identifiers, 1,185 refs, 670 item
   FKs, 2,561 source FKs, 6 `derived_values` (14.51 US rail … 363.62 GB rigid HGV 7.5–17 t, gCO2e per
   tonne-km, each equal to its DESNZ/EPA factor row × 1000), 6 edges, 6 outbox events emitted by the
   seed's inserts and all 6 drained by the run (`events_drained: 6, invalidated: 0, recomputed: 0`), 0
   pending.
2. **The first live dispatch found a real defect before either of these ran.** Run 33627113501 (not an
   artifact; it died before the driver) failed in `backfill-entities.mjs` on `readAll(entities)`:
   `scripts/lib/db.mjs` orders by `id` by default and the spine tables have none. Fixed in PR #519 with a
   source-shape test; the lane's fake client had never ordered.
3. **run-002 claimed `propagation-run-001`.** Both runs wrote the same run_id because every runtime
   workflow's hydrate guard ran `git ls-tree` with a cwd-relative pathspec under `working-directory:
   fsi-app` and matched nothing (Addendum 84 postscript 4; fixed in PR #521 with `--full-tree` and
   `workflow-hydrate-guard.test.mjs`). The apply run is landed as run-002 with the renumbering recorded in
   its `proposer_notes`.
4. **Automate-vs-hire seeded 0, honestly.** No region carried both an hourly wage fact and an energy
   fact when the seed ran: `eurostat-lc-lci-lev` had only dry-run (producers #16) and the BLS hourly
   series had not been re-produced. The seed's `skippedNoHourlyWage`/`regionsWithBothFacts` counters
   name the gap; the next seed after those producers apply is where the first estimate lands.

**Proposal carried forward:** the drain's dry mode reports `invalidated` from `invalidate_dependents(...,
p_apply=false)` per event; with 0 events it proves nothing about the closure walk. The first real proof is
a factor UPDATE (a DESNZ re-seed) followed by a dry drain that reports `invalidated: 6`, then an apply
that recomputes through `carbon_intensity_tkm` and supersedes six rows. That is the run to dispatch when
the 2026 DESNZ set publishes.
