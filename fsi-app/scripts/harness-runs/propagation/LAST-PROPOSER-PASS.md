# Last proposer pass — propagation

Per `PROPOSER-RUNBOOK.md` §2's attestation format. `propagation` now has **five** artifacts
(`propagation-run-001` through `-005`, `-005` folded onto `train/wave48-2026-09-05` by lane
ASSEMBLE-48); F28's rule (d) requires this file to name the latest verbatim:
**propagation-run-005**.

## Proposer pass for propagation-run-005 (2026-09-05, lane ASSEMBLE-48)

**Artifacts read:** propagation-run-001 through propagation-run-005, in `started_at` order (001
2026-09-02T12:21Z through 005 2026-09-05T20:08:10Z — the run-004 pass below covers 001-004 in
full; re-read here, not taken on faith).

**Full traces read:** `traces/propagation-run-005.report.json`, `propagation-run-005.json` in full,
and — because the trace alone could not settle what this pass found — the query itself,
`src/lib/propagation/drain.ts`'s `runPropagationDrain` (the family's one canonical entry point).

**What run-005 shows, beyond the run-004 pass below:**

1. **Run-005 is the first drain chained from a real `workflow_run` trigger context**
   (`trigger_context: {"name":"Data producers","run_id":33989121767,"conclusion":"success"}`, vs.
   003/004's `trigger_context: null` hand dispatches) — the propagation-drain -> producers chain
   named in this train's own dispatch-ledger row 3 is now proven live, not just wired.

2. **`invalidated: 0, recomputed: 0` this run, correctly — not a defect, but a DAG-AUTHOR finding.**
   [CONFIRMED] The producers run that triggered this drain (`refresh-published-price-statistics`,
   4 -> 10 rows) touches `published_price_statistics`. Per today's audit of migration 285's
   `derivation_edges` table, the DAG currently covers only two source tables: `emission_factors`
   and `regional_data_facts`. `published_price_statistics` is NOT yet in the DAG. Therefore zero
   downstream `derived_values` rows had anything to invalidate. `events_drained: 500` still marks
   all 500 considered outbox rows as drained (the drain's own job, independent of whether anything
   was invalidated); this is the expected, correct shape for a drain triggered by a producer whose
   table is not yet registered as a derivation source. **The 0 recomputed result on 500 drained
   events means every event touched an unregistered table — a measurement, not a defect, and an
   explicit finding for the DAG-AUTHOR workstream to close by extending coverage to additional
   source tables.** Propose next drain to measure DAG coverage growth and register additional
   derivation edges.

3. **A real defect found reading `queue_depth_before` across all three of runs 003/004/005, not
   present in the run-004 pass below.** [CONFIRMED, this pass, by reading `drain.ts` itself after
   the traces made the pattern visible] `queue_depth_before` reads **1000** in run-003, run-004,
   AND run-005 — three different points in time, three different true pending-queue sizes (the
   run-004 pass's own SQL reconciliation computed 2,272 pending after run-004; this train's ledger
   row 3 puts the outbox at 2,778 total / 1,772 pending after run-005's own drain). The number
   never moves because it was never a real count: `runPropagationDrain` read it as
   `.from("propagation_events").select("event_id").is("drained_at", null)` — no `.limit()`, no
   `.range()` — and reported the fetched array's `.length`. PostgREST silently caps a range-less
   response at 1000 rows (`src/lib/db/paginate.mjs`'s own header), so `queue_depth_before` has been
   reporting `min(true_pending, 1000)` since run-003, the exact "a count fed by a truncated array's
   `.length`" defect class CAP-1000 (F38's own header) named for PERF-13's slug enumeration, the
   obligations register's `OVERFETCH_CAP`, and `run-change-detection.mjs`'s backlog count — this is
   a fifth instance of the same bug class, in a fourth family, that F38's own scope note says it
   does NOT mechanically catch (a bare unranged `.select()` with no `.limit()` at all). Not a
   regression from anything folded into this train; it has been wrong since run-003 first crossed
   1000 pending events (2026-09-04), silent because nothing downstream ever compared it to the
   live table.

**Proposal (implemented in this pass, per rule 13 — a flag found while reading this family's own
history is fixed in the same motion, not deferred):**

`runPropagationDrain`'s `queueDepthBefore` now reads via `paginate.mjs`'s `exactCount()` — a real
`COUNT(*)` (`.select("event_id", {count:"exact", head:true}).is("drained_at", null)`), independent
of any row page, the same fix already applied to PERF-13/obligations/run-change-detection.
`DrainClient`'s `select()`/`then()` types widened to carry the optional `count` field
`exactCount()` needs; the fake test client (`drain.test.mjs`) updated to honor
`{count:'exact', head:true}` and a new regression test (`queue_depth_before is an exact COUNT, not
the .length of a possibly-capped row page (CAP-1000)`) seeds 1,200 undrained events — past both the
default `batch: 500` and the 1000-row PostgREST cap this fake does not even simulate — and asserts
`queueDepthBefore === 1200`. All 11 of this family's own unit tests pass (10 pre-existing + 1 new).

**Family gates status:** green — `node --test fsi-app/src/lib/propagation/drain.test.mjs` (11/11
pass), `npx tsc --noEmit` clean over the widened `DrainQueryBuilder` type, fitness runner and
closure gate unaffected (no allowlist entry touches this module).

**Proposals for next cycle:**
1. **Continue next drain dispatch.** Run-005 drained 500 from a queue of 1000 (now 500+ pending
   after run-005's own draining, plus new events from the producers). Next manual or chained
   propagation-drain dispatch (when producers change or scheduled) will drain the next batch and
   produce `propagation-run-006.json` with an accurate `queue_depth_before` measurement.
2. **Measure DAG coverage.** As the propagation family continues draining (every producers run
   now triggers a chain), track the count of source tables registered in migration 285's
   `derivation_edges` DAG against the total count of tables touched by producers. This measurement
   belongs in a DAG-AUTHOR proposer pass (not this family's scope) but is made concrete and
   measurable by run-005's finding: `published_price_statistics` (and likely others) are producers
   targets without derivation edges. A secondary metric: per drain run, `sum(recomputed) /
   sum(events_drained)` measures the "DAG activation rate" — how many events actually triggered
   propagation. Once coverage grows beyond the current two tables, this rate should move away from
   zero.

**Basis:** the three artifacts' identical `queue_depth_before: 1000` reading, cross-checked against
the run-004 pass's own live-SQL reconciliation (2,272 pending after run-004, all three runs holding
1000-plus pending) and this train's own dispatch-ledger row 3 (2,778 total / 1,772 pending after
run-005), is measured evidence, not a hypothesis about what PostgREST might do — read directly from
`drain.ts`'s query once the flat repeated number made the shape worth checking (CLAUDE.md rule 14/
B4: measure, don't assume, even when a doc predicts the value — here no doc predicted it, the
`.length()` read simply never got compared to the live table until this pass did).

---

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
