# Last proposer pass — propagation

Per `PROPOSER-RUNBOOK.md` §2's attestation format. `propagation` now has **two** artifacts
(`propagation-run-001`, `propagation-run-002`); F28's rule (d) requires this file to name the latest
verbatim: **propagation-run-002**.

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
