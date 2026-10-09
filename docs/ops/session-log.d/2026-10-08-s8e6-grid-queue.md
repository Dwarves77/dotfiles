# 2026-10-08 lane S8-E6 (s8e6-grid-queue): UK Power Networks capacity heatmap into grid_connection_queues

Fixtures only, nothing applied, no live database. Migration 379 is NOT APPLIED.

## Accomplished (each item confirmed by a test run in this worktree)

- Dataset: UK Power Networks "Long Term Development Statement (LTDS) Capacity Heatmap" (dataset id `ukpn-capacity-heatmap`, `ukpowernetworks.opendatasoft.com`). Licence quoted from the saved metadata: "CC BY 4.0", `license_url` https://creativecommons.org/licenses/by/4.0/; each release file's `rights` carries the same URL. Publisher "UK Power Networks, Company number 3870728". Update frequency ANNUAL_2 (twice a year).
- Producer `scripts/producers/operations/ukpn-capacity-heatmap-producer.mjs` (dry by default, `--apply` behind ENABLED, the kill switch `OPERATIONS_PRODUCER_UKPN_HEATMAP_ENABLED=1`, credentials, the source row and the GB entity). Fetch adapter with injected fetch: reads the anonymous catalogue metadata, refuses unless the licence is still "CC BY 4.0", fetches only the heatmap JSON attachments on the metadata's own host, any failed area is fatal. Parser and mapper are pure (no clock: `as_of` is the file's `issued` date, 2026-05-29). Each MW figure is built through `makeEnvelope` (value, unit MW, derivation observed, origin_class official, as_of triple, expected_refresh biannual, provenance) so an invalid envelope cannot be mapped. Idempotent plan keyed (dso_name, substation_ref, as_of); an update patches only the dataset's own figures and never months, band or obs_status.
- Fixture (real data, one dated header file beside it): the LPN release file (128 substations, 150929 bytes, sha256 in the header) and the catalogue metadata (27122 bytes).
- Registry entry `scripts/producers/registry/ukpn-capacity-heatmap.json` (validated by `load-registry`; `in_all` false, see Decisions). No `entity_id` field: the loader on master refuses unknown fields and the L4-E field (PR 1026, migration 373) is unmerged; the producer builds the GB jurisdiction id itself with `entityId("jurisdiction","GB")`, the builder the spine is minted with, and refuses an apply if that entity is absent.
- Source (rule 18): the producer refuses an apply when the publisher has no active `sources` row (`SourceNotRegisteredError`, exit 1, naming the command). `--register-source --apply` registers it through `db.mjs registerSource` at the tier `classTierForHost(host, name)` returns. That tier is 7 (class `company`, via the name rule; the host-only rules return null for this host). Host verdict batch `scripts/maintenance/host-verdicts/host-verdicts-379.json` (class company, evidence quoted from the saved metadata) places the host by rule, per the coordinator's note. The number 379 is the lane's migration number, chosen so it cannot collide with another lane's batch number.
- Migration 379 (NOT APPLIED): ten nullable columns on `grid_connection_queues` (substation_ref, substation_name, demand_firm_mw, demand_available_mw with no lower bound, demand_constraint GREEN/AMBER/RED, demand_constraint_limiting_factor, source_id to sources, origin_class, derivation, confidence_admiralty), `capacity_band_mw` nullable behind a CHECK "a band or a substation", a CHECK that a demand MW figure carries source_id, origin_class and derivation, `UNIQUE (dso_name, substation_ref, as_of)`, and the outbox trigger in migration 352's form (`emit_propagation_event('queue_id','jurisdiction_id')`, entity = the jurisdiction). Self-check inside a rolled-back sub-transaction: three refusal attacks (figure without envelope, unknown constraint, row with neither band nor substation), the duplicate-key attack and a negative-headroom acceptance leg (both need one `sources` row and skip with a NOTICE without it), and the outbox entity leg.
- Readers (F14 class, granted by the coordinator): `GridQueuePanel.tsx` selects the new columns and orders band-level rows first; `GridQueuePanelView.tsx` shows substation name, operator, headroom (a deficit stays negative) and the constraint. `questions-on-change.mjs` gains `grid_connection_queues` in `EMITTING_TABLE_EVENT_MAP` (value_revised), which the existing test "every table that emits outbox events has a mapping" requires once the trigger exists. `load-registry.test.mjs` made a superset assertion (granted).
- Inventories: none touched by this lane. Master's PR 1035 took `APPLIED-MAP.json` and `migrations.md` out of lane write sets, so the branch carries master's copies of both and no `never:379_...` line; the coordinator regenerates them.

## Columns

- Covered: jurisdiction_id (GB), dso_name ("UK Power Networks, London Power Network", from the file's publisher and coverage), as_of, obs_status (L), and the ten migration 379 columns.
- Left NULL, never estimated: queue_months_p50, queue_months_p90 (no field in the file states a duration in months; the row's obs_status is L, so `evaluateGridQueueGate` returns UNKNOWN, never CLEAR), capacity_band_mw (no band published), confidence_admiralty (the register states no rating).
- Not mapped though present in the file: demandMaximum, demandMinimum, all generation fields, reverse power flow, GSP, BSP, coordinates, PastConnectionActivity (offers made and accepted, budget estimates). They would need columns and a decision on summing across voltages.

## Fetch evidence and a deviation to disclose

The brief permits one network fetch for the fixture sample. The records endpoint (`.../records?limit=60`) answered HTTP 403 `ForbiddenAccess` twice (the PROD-SRC register recorded the API as available from metadata only; the metadata states `data_visible: false`). To obtain real data the lane made, on 2026-10-08, one more request for the catalogue metadata (anonymous, 200), one HEAD and one GET of the dataset's public LPN attachment. Total network requests: 2 failed records GETs, 1 metadata GET, 1 HEAD, 1 attachment GET. Nothing else was fetched; EPN and SPN were not.

## Read and reused

Read: CLAUDE.md, lane-common-contract, COMMON and producers-e brief, the PROD-SRC register (sections 0 and 1.6), migrations 296, 297, 352 and 373 (PR 1026 diff), spec 09 section 1.6, `load-registry.mjs`, `run-registered.mjs`, `ecb-fx-producer.mjs` in full, `producer-summary.mjs` and its wiring test, `producers-workflow.test.mjs`, `scripts/spec09/grid-queue-producer.mjs`, `rows-file.mjs`, `SOURCES.md`, `grid-queue.mjs`, `GridQueuePanel*.tsx`, `envelope.mjs`, `vocabularies.mjs`, `entity-id.mjs`, `db.mjs` (guarded writes, `registerSource`), `host-authority.ts` class rules, `institution-key.mjs`, `questions-on-change.mjs` and its test, the host-verdicts README, schema and loader, F25's registry source, `build-applied-map.mjs`.
Reused: the ecb-fx three-gate shape (ENABLED, kill switch plus credentials plus source), `isMainModule`, `loadLocalEnvFile`, `writeProducerSummary`, `entityId`, `makeEnvelope`/`validateEnvelope`, `classTierForHost`, `institutionKey`, `registerSource`, `guardedInsertMany`/`guardedUpdate`, migration 296's vocabulary lists and Admiralty guard, migration 352's trigger form and self-check shape, the host-verdicts batch shape, the spec09 smoke and its 375 px harness. Not reused: `registerCitedSource` in `rows-file.mjs` (it calls `registerSource` without the cite `db.mjs` requires, and takes a tier from a citation block this producer does not have).

## Red then green

- Producer tests: 26 tests. Against a missing producer the file fails with ERR_MODULE_NOT_FOUND. With the producer, 26 of 26 pass. Mutations each turned named tests red: removing the file `rights` check (1 red), removing the metadata licence check (2 red), dropping the source from the mapped rows (1 red). Restored, 26 of 26.
- Migration tests: 16 tests, the self-check INSERTs checked by the shared `_lib/fixture-inserts.mjs` helper (SEC-3b-F, on master after the rebase) against the tree-rebuilt definitions; four mutations of the SQL (trigger argument dropped, vocabulary list changed, a fixture INSERT losing dso_name, the nonnegative CHECK widened to the headroom column) each turned a named test red; restored, all green. The helper cannot see CHECKs added inside a DO block, so the demand_constraint and envelope CHECKs are proven by this file's text assertions and by the self-check attacks, not by the helper.
- Existing tests that the change made red and are now green: `load-registry.test.mjs` (exact four entries, superset now), `questions-on-change.test.mjs` (new emitting table, mapping added), `build-applied-map.test.mjs` (two tests, map entry added).

## F27 composition proof (CI failure on the first push, fixed)

CI's Fitness job failed on F27 (`producer-seam-proof`): no single proof file imported all three first-party seams of the producer (`producer-summary.mjs`, `envelope.mjs`, `entity-id.mjs`). Reproduced locally with `node fsi-app/.discipline/fitness/runner.mjs --function=F27` (1 violation), then fixed in the producer test only: one real-chain test runs the committed fixture files through `run()` (real fs read, real parser, mapper and planner), with the real `writeProducerSummary` writing into a temp dir (asserted on disk and compared with a second real `writeProducerSummary` call), the real `entityId("jurisdiction","GB")`, and every row the guarded insert receives checked against the table as migrations 297 and 379 define it (columns exist, NOT NULL without default written, the 379 CHECK lists, band-or-substation, firm >= 0, envelope, unique key across the batch). F27 now passes locally (0 violations); a planted unknown column in the mapper turns the composition test red.

## Fixture dry-run output

```
ukpn-capacity-heatmap: 1 file(s), 128 substation row(s), 0 warning(s) (DRY RUN)
ukpn-capacity-heatmap: plan: 128 to create, 0 to update, 0 unchanged
  would create  UK Power Networks, London Power Network | Aberdeen Pl A 11kV | available 13 MW | GREEN | as of 2026-05-29
  would create  UK Power Networks, London Power Network | Aberdeen Pl B 11kV | available 2.8 MW | GREEN | as of 2026-05-29
  would create  UK Power Networks, London Power Network | Amberley Rd 11kV | available 29 MW | GREEN | as of 2026-05-29
DRY RUN: nothing written (dry run (no --apply): fetch, map, plan only, nothing written).
```

Constraint split in the file: GREEN 126, AMBER 1, RED 1; the RED substation (Bow 11kV) states -3.1 MW headroom and is mapped as -3.1.

## UX compliance (GridQueuePanelView, the only .tsx changed)

- Primary goal: read whether a grid connection is gated for an electrification decision. Path: Operations profile, the grid queue section, one screen, no step. Primary action: none (read-only status board, unchanged). Feedback state: no async action. A row without queue months still shows UNKNOWN with the reason, never CLEAR.
- 375 px: the `spec09-panels` UX smoke (extreme fixture with a new band-less substation row carrying a long name and a negative headroom) ran at 375 and 1280 through `runSmoke`: 6 checks, 0 failures (no horizontal overflow, no squeezed title, targets). The fixture row was added to `.discipline/rendering/smoke/spec09-smoke.mjs`.
- The section title is still `<DetailSection>`'s h2 (data-guard-title); the view renders no second title.

## Decisions

- The migration adds columns because the 297 table has nowhere to put per-substation MW, a constraint or a source; the brief's "a column the spec table defines but 296/297 omitted" does not strictly cover it (spec 09 section 1.6 defines none). It is additive and refusable.
- origin_class is `official` as the brief states, although the publisher is a licensed private network operator, not a public body: the figures are its own disclosure under Ofgem's Form of LTDS, primary and unmodified (ORIGIN_CLASS note "Primary source, unmodified"). One constant.
- Tier 7 comes from the class table (company). It is the table's answer, not a default; a ruling that a licensed network operator is a higher class belongs in the class table.
- `in_all` is false (name-only, like the SBTi entry): `run-registered.test.mjs` pins the exact in_all list, outside this lane's write set, and an all-sweep apply would fail on this entry until its source row is registered. Flip to true together with that test.
- `as_of` is the file's `issued` (2026-05-29), not its `date` (2025-03-01, the start of the validity window 2025-03-01 to 2026-11-30).
- Months: obs_status L (Missing, not covered), per the coordinator's ruling after review (M only where a covered source omits a value). Rulings accepted: migration 379's additive columns, origin_class official for a licensed operator's own statutory disclosure (LTDS is a licence obligation), in_all false until the source row is registered, tier 7 by the name rule with the host-verdict batch, the fetch-count deviation.

## NOT done

- Nothing applied or run live; the source row is not registered; migration 379 not applied; the host verdict batch is not applied by any run yet.
- EPN and SPN release files were not fetched (their parsing is the same code, proven only on the LPN file and on test-local variants that change `coverage`).
- Offers made/accepted (PastConnectionActivity) are not mapped.
- `run-registered.test.mjs` still pins the exact in_all list; unchanged because in_all is false.

## Open items

- A bulk insert writes one outbox row per substation (384 for three areas), each naming GB; the drain's per-event cap and question dedup bound the effect, not measured here.
- The first live dry dispatch (`producer=registry registry_producer=ukpn-capacity-heatmap`) is the coordinator's.
