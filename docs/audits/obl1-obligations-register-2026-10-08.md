# OBL-1 fact register: the obligation layer for the four forwarder-direct instruments (CALLED, RUNS)

> Landed in docs/audits/ on 2026-10-08 by the coordinator docs lane DOCS-3 from the register's scratch copy (source path: fsi-app/scripts/tmp/obl1-obligations-register-2026-10-08.md). The body below is the register verbatim; only the form of status tokens was touched where the checker required it. Statements below about a scratch location or a gitignored copy describe where the file lived before it landed.

Date: 2026-10-08. Fact lane OBL-1. Read-only. No live database access, no network, no sub-agents, no proposals.
Window: the main checkout tree at master 6028b228 (clean at start and at end; `origin` was not fetched because that is a
network call), plus dry fixtures. Register rows served: S8-7 and D-4 of
`fsi-app/scripts/tmp/remaining-build-register-2026-10-06.md`.

## 0. Declarations

- Lenses run: CALLED, RUNS. Lenses NOT run, owed: EXISTS, ATTACKED, COSTS, FIRED-TRUE, MODE, OVERLAPS, OPERATOR-SEAT,
  RECORD-VS-REALITY. (Anything below that reads like one of those is incidental and carries its own token.)
- Subsystem: 13 (API routes and page.tsx files) and 15 (scripts, and `fsi-app/src/lib` library code).
- Unit: each of the four forwarder-direct instruments.
- Enumerator (quoted). `docs/specs/06-gap-register-and-sequence.md` Phase 3.4: "Regulations: obligation decomposition,
  starting with the instruments that bind the forwarder directly (CountEmissions EU, CBAM indirect representation,
  Empowering Consumers, PPWR)." `docs/plans/complete-build-plan-2026-10-01.md` lane L17: "Decompose the 4 instruments spec 01
  S1 names as directly binding on the forwarder (CountEmissions EU, CBAM indirect-representative, Empowering Consumers
  Directive, PPWR) into their component obligations". Spec 01 section 1 table 1 names two more rows (SOLAS VGM, CSRD);
  they are outside the unit and are not run here.
- Status tokens (CLAUDE.md rule 14): [CONFIRMED: method], [HYPOTHESIS], [REFUTED]. State words: present, absent, partial.
- QUESTION: for each instrument, (1) does an obligation decomposition exist, (2) is it reached by a reader (the detail-page
  binding banner), (3) does the applicability gate receive roleScope inputs from a real caller.

## 1. Read and reused

Read in full: `CLAUDE.md`; `docs/dispatches/lane-common-contract.md`; `docs/runbooks/audit-catalogue.md` lines 1 to 110
(section 1, lens definitions CALLED and RUNS); register rows S8-7 (line 133) and D-4 (line 258) and the surrounding stage
tables; `docs/specs/01-regulations.md`; `fsi-app/supabase/migrations/290_obligations.sql`;
`fsi-app/scripts/obligations/derive-obligations.mjs` and its test; `fsi-app/scripts/maintenance/derive-obligations.mjs`;
`fsi-app/src/lib/obligations/classify-binding-position.mjs` and its test; `fsi-app/src/lib/obligations/read-register.mjs`
(lines 1 to 130 and 296 to 475, rest skimmed by grep); `fsi-app/src/lib/applicability/compute-applicability.mjs`;
`fsi-app/src/lib/profile/profile-contract.mjs`; `fsi-app/src/lib/workspace/relevance.mjs`, `profile.ts`,
`viewer-relevance.ts`; `fsi-app/src/app/regulations/[slug]/page.tsx`; `ObligationRegister.tsx`;
`ObligationRegisterFilterBar.tsx` (lines 1 to 150 and 300 to 449); `RelevanceBadge.tsx`; `RelevanceBadgeClient.tsx`;
`fsi-app/src/app/api/obligations/register/route.ts`; `fsi-app/src/app/api/detail/relevance/route.ts`;
`docs/runbooks/maintenance.d/04b-derive-obligations.md`; `docs/ops/session-log.d/2026-09-29-w2e.md`.
Reused (no new code written): the repo's own `node --test` harness and the real modules above, driven by an in-memory
`node --input-type=module -e` script that creates no file; tracked harness-run artifacts and tracked fixtures as evidence.

## 2. Result table: instrument x (decomposition, reader, gate inputs, fixture run)

State words: present / absent / partial. Detail and line references are in sections 3 to 6.

| Instrument | Decomposition | Reader (detail-page banner) | Gate inputs (roleScope) | Fixture run (RUNS) |
|---|---|---|---|---|
| CountEmissions EU | absent [CONFIRMED: scan of tracked fixtures and harness artifacts, 0 rows; migration scan, no component-obligation schema] | partial [CONFIRMED: grep and read; per-row chip exists, item-level banner does not] | partial [CONFIRMED: read of relevance.mjs:112-123; item-grain tags only] | present [CONFIRMED: ran, section 6] |
| CBAM | partial [CONFIRMED: forward-events-run-007 and 008 record 18 events for item 51b2c91e; obligations rows themselves [HYPOTHESIS], component decomposition absent] | partial [CONFIRMED: same chain] | partial [CONFIRMED: same call site] | present [CONFIRMED: ran, section 6] |
| Empowering Consumers | partial [CONFIRMED: mint-run-019 and forward-events-run-025 record 2 events for item 9566075e; that this item is the 2024/825 directive is [HYPOTHESIS]] | partial [CONFIRMED: same chain] | partial [CONFIRMED: same call site] | present [CONFIRMED: ran, section 6] |
| PPWR | absent [CONFIRMED: no forward-events or obligations artifact for item efdb3390 in tree; live rows [HYPOTHESIS]] | partial [CONFIRMED: same chain] | partial [CONFIRMED: same call site] | present [CONFIRMED: ran, section 6] |

Counts: 4 instruments, 16 cells; present 4, partial 10, absent 2; 0 cells without a token.
Tests run to support the RUNS column: 6 test files, 118 tests, 118 pass, 0 fail (section 6).

## 3. Decomposition (D-4 and S8-7)

Common facts for all four instruments.

- The only obligation schema is migration 290. Table `obligations` has 14 columns and one row per `item_forward_events` row
  (`290_obligations.sql:99-153`, UNIQUE on `forward_event_id`). Columns: id, intelligence_item_id, forward_event_id,
  jurisdiction, modes, binding_position, due_date, date_precision, event_kind, status, derivation_version, derived_at,
  created_at, updated_at. [CONFIRMED: file read]
- The migration header states it ships the "MVP" grain, not the spec 01 section 3.2 field list (`290_obligations.sql:19-29`).
  No column exists for pinpoint_citation, verbatim_text, plain_language, duty_holder_class, applicability_trigger, the four
  dates, evidence, sanction, cost_formula, owner, or obligation version. [CONFIRMED: file read]
- No later migration alters `obligations`. A search of `fsi-app/supabase/migrations` for `public.obligations`, `duty_holder_class`,
  `pinpoint_citation` and `obligation_version` returns only 290 (plus comments in 282, 283, 368 that do not alter it).
  Migration 349, the number lane L17 requested for the obligation entity table, is `349_external_data_only.sql`.
  [CONFIRMED: git grep over the migrations directory and directory listing]
- The writer derives rows from forward events by item title only: the item select list is
  `id, title, jurisdiction_iso, transport_modes, is_archived` (`scripts/obligations/derive-obligations.mjs:158-163`); the
  classifier is called at line 94 with `title` and `legal_instrument` (the latter never selected). No row is produced for an
  item that has no extracted forward event. [CONFIRMED: file read]
- A scan of every tracked `.json` and `.jsonl` for the obligations row key `forward_event_id` finds one file
  (`scripts/verify/lib/fixtures/duplicate-table-schema-snapshot.json`, a schema snapshot, no rows). No tracked fixture
  contains an `obligations` row for any instrument. [CONFIRMED: git grep]
- Tracked read-backs of the live table exist only as aggregates, in `scripts/harness-runs/brief-apply/brief-apply-run-004.json`
  (2026-09-17T02:22Z, obligations_total 1276) and `brief-apply-run-006.json` (2026-09-17T03:35Z, obligations_total 1318,
  active 1314). Run 006 read-back by binding_position: null 1188, direct_duty 96, carrier_passthrough 22,
  customer_contract 12, monitoring_only 0. Non-null rate 130 of 1318 = 9.9 percent. Neither artifact names any of the four
  instruments. [CONFIRMED: file read and arithmetic]
- The register row S8-7 figure "1,336 obligation rows" appears in `docs/plans/system-map-2026-10-04.md:249` ("`item_forward_events`
  1,336. `obligations` 1,336."). That count was not re-queried. [CONFIRMED: document says so; live value [HYPOTHESIS]]

Per instrument.

- CountEmissions EU. Item `cd1083c9-fd05-47f7-bfed-8354b70a31ac` (CELEX 32026R1030) is recorded as minted in
  `docs/ops/session-log.md:1872`; it appears in `gate-a-rescan-run-001.json` and in no forward-events artifact. The earlier item
  `7aaecc81-b065-4f32-934b-d4c981269e8b` ("CountEmissions EU") shows `no_events`, 0 events and 5 skips in
  `forward-events-run-002.json` (2026-09-01) and `forward-events-run-004.json` (2026-09-03). So no forward event, hence no
  register row, is evidenced for either item in tree. [CONFIRMED: file reads] Live rows: [HYPOTHESIS] (not queried).
- CBAM. Item `51b2c91e-776f-42f5-a799-a957312d4e56` ("EU CBAM", verified in `docs/audits/gate-a-route-b-baseline-2026-08-11.csv:127`):
  `forward-events-run-007.json` and `-008.json` (2026-09-04, execute mode) record "extracted 18 event(s), 4 skip(s)";
  `scripts/forward-events/DRY-RUN-REPORT.md:91` records 16 events and 4 skips for the same item in the 2026-09-01 dry run
  (extractor fe1-2026-09-01.1, cited not re-run). Obligation rows follow forward events only when the derive step runs
  after them; no artifact in tree reads back rows per item. [CONFIRMED: file reads] Rows exist for this item: [HYPOTHESIS].
  The item is the instrument as a whole; no row is scoped to the forwarder acting as indirect customs representative.
  [CONFIRMED: the table has no role column and derive copies only item-level fields]
- Empowering Consumers. No stored title for the directive is recorded in tree. Screening verdict
  `fsi-app/scripts/mint/reviewed-verdicts.json:3987-3991` (worklist id `77be75c3-...`) names "empowering consumers for the
  green transition Directive (2024/825)"; `mint-run-019.json:425-431` (2026-09-03) records that worklist id as
  `minted_verified` with item id `9566075e-051e-472c-a0f7-9d8cf7e883b9`; `forward-events-run-025.json:368-371` (2026-09-04)
  records that item as "extracted, 2 event(s), 0 skip(s)". [CONFIRMED: file reads] That item 9566075e is the directive:
  [HYPOTHESIS] (inferred from the worklist id; no artifact states the item title). Obligation rows for it: [HYPOTHESIS].
- PPWR. Item `efdb3390-7530-44e5-b99d-9b20157ae186` (legacy_id g2, title "EU PPWR 2025/40",
  `docs/archive/logs/iso-backfill-2026-05-08-investigation.json:767-770`). No forward-events, obligations or brief-apply
  artifact in `scripts/harness-runs` names this id. [CONFIRMED: grep over harness-runs] Rows: [HYPOTHESIS].

Spec and plan acceptance bars, stated against the above.

- Plan L17 acceptance (complete-build-plan lines 396-398, 551): "each of the 4 instruments has >=1 obligation row with a
  non-null `binding_position`". Not evidenced for any of the four in tree. [CONFIRMED: sections above]
- Spec 01 section 7 criterion 1: "Every obligation carries `binding_position`, and zero render without it." Measured
  non-null rate 9.9 percent (run 006); null rows render with the text "needs binding classification"
  (`ObligationRegisterFilterBar.tsx:367`). [CONFIRMED: file reads]

## 4. Reader call chain, detail page to data (CALLED)

Chain R1, the obligation register on the Regulations detail page. [CONFIRMED: each hop read]

1. `fsi-app/src/app/regulations/[slug]/page.tsx:295`: `<ObligationRegister variant="detail" itemId={r.id} />`, mounted after
   `RegulationDetailSurface` (line 274), not inside its hero.
2. `fsi-app/src/components/regulations/ObligationRegister.tsx:140`: client `fetch("/api/obligations/register?itemId=...")`.
3. `fsi-app/src/app/api/obligations/register/route.ts:82-97`: detail variant resolves a legacy id to a uuid, then
   `fetchObligationRegister(supabase, { itemId, limit: 200 })`.
4. `fsi-app/src/lib/obligations/read-register.mjs:324-358` (select list at lines 88-89): `from("obligations")`, `status = active`,
   `intelligence_item_id = itemId`, joined to `intelligence_items` with `is_archived = false` and `provenance_status = verified`.
5. `ObligationRegisterFilterBar.tsx:327-369` (`Row`): the "Binding" cell renders `BINDING_POSITION[row.binding_position].label`
   in a coloured text chip (lines 359-363), or the text "needs binding classification" when null (line 367).
6. `ObligationRegister.tsx:169`: `if (variant === "detail" && result.rows.length === 0) return null;`. An item with zero rows
   renders nothing from this table.

Facts about the "binding banner".

- No component named banner for binding position exists. A search of `src/components/regulations`, `src/components/detail`,
  `src/app/regulations`, `src/lib/detail` and `src/components/ui` for "banner" returns `SystemErrorBanner`, `InlineErrorBanner`
  and `IntegrityBanner` (`RegulationDetailSurface.tsx:167,341,608`, admin-only integrity flag). None reads binding_position.
  [CONFIRMED: git grep]
- Plan L17 acceptance required "the existing Regulations detail page renders a binding-position banner (spec 01 S4 component 1)
  reading from this table, falling back to today's rendering when no obligation row exists". The per-row chip in a lower
  section exists; an item-level banner does not. [CONFIRMED: grep and reads]
- A second binding_position source exists on record-grade items: the mint-time fact claim `[binding_position]`
  (`src/lib/intake/record-facts.mjs:532-560`), rendered at most as a generic SCOPE fact card
  (`src/lib/detail/fact-card-model.ts:425-445`). It is a different value from `obligations.binding_position`: in the tracked
  census fixture `src/lib/connections/fixtures/census-rows.apply-ready.json`, row index 103 (UK Producer Responsibility
  Obligations (Packaging and Packaging Waste) Regulations 2024) carries record-facts binding_position `monitoring_only`
  while the classifier returns `direct_duty` for its title (section 6, test A2). [CONFIRMED: fixture run]
- Per instrument, the chain reaches data only if the item has register rows (R1 step 6). Same chain for all four; rows
  per instrument are not evidenced (section 3).

Writer side (CALLED, other direction). `derive-obligations` is reached by `.github/workflows/maintenance.yml:256-265`
(dispatch step), `.github/workflows/downstream-chain.yml:296-300` (workflow_run chain), and
`fsi-app/scripts/turns/run-population-flywheel.mjs:836,1267` (population flywheel step, via
`scripts/maintenance/derive-obligations.mjs`). The table has a writer and the readers above. [CONFIRMED: git grep and reads]
Under build mode (CLAUDE.md rule 16) these run dry or by explicit dispatch.

## 5. Applicability gate inputs (CALLED)

Chain R2, the only production caller of `computeApplicability`. [CONFIRMED: git grep for `computeApplicability` and
`compute-applicability` across `fsi-app/src`, `fsi-app/scripts`, `.github`: one production importer, `relevance.mjs:38`]

1. `RegulationDetailSurface.tsx:367`: `<RelevanceBadgeClient itemId={r.id} />` (the same badge is mounted on the Operations,
   Market and Research detail surfaces).
2. `RelevanceBadgeClient.tsx:28-46`: `fetch("/api/detail/relevance?itemId=...")`.
3. `fsi-app/src/app/api/detail/relevance/route.ts:44-46`: `getViewerRelevanceForItem(detail.relevanceInput)`.
4. `fsi-app/src/lib/workspace/viewer-relevance.ts:31-47`: resolves the org from cookies (returns null with no org, line 35),
   `getWorkspaceProfile`, then `relevanceForItem`.
5. `fsi-app/src/lib/workspace/profile.ts:117-133`: passes `orgRoles` and `orgSize` (read from
   `workspace_settings.profile.org_roles` and `org_size`, lines 78-95).
6. `fsi-app/src/lib/workspace/relevance.mjs:112-123`: builds the obligation `{ roleScope, sizeThreshold }` and calls
   `computeApplicability(obligation, orgProfile)`.

Inputs at the call site.

- roleScope: `deriveRoleScopeFromComplianceObjectTags(item.compliance_object_tags)` (`profile-contract.mjs:165-169`). The
  mapping covers 14 tag values onto 8 org roles (`profile-contract.mjs:140-155`); unmapped tags are dropped, an empty result
  is passed as no roleScope (`relevance.mjs:113-114`). The tags come from the item row via
  `src/lib/supabase-server.ts:4452-4460` (`relevanceInput`). The grain is the ITEM, not the obligation row, and not the
  instrument. [CONFIRMED: file reads]
- sizeThreshold: read from `item.size_threshold` only if set (`relevance.mjs:115-117`). `relevanceInput` does not carry the
  field (`supabase-server.ts:4452-4460`) and a search of `fsi-app/src`, `fsi-app/scripts`, `fsi-app/supabase` finds no
  producer of `size_threshold` outside the gate and its tests. So sizeThreshold is never set in production. [CONFIRMED: git grep]
- Profile inputs are real: the Organisation profile card writes `org_roles` and `org_size`
  (`OrganisationProfileSection.tsx:150`, mounted at `SettingsPage.tsx:237`). [CONFIRMED: file reads]
- The obligations table and `REGISTER_SELECT` (`read-register.mjs:88-89`) carry no role or size column. The system map
  (`docs/plans/system-map-2026-10-04.md:292`) says the same: "it needs obligations to carry roleScope / sizeThreshold, which
  nothing produces yet". [CONFIRMED: file reads]
- Output use: `computeItemRelevance` returns `applicability`; `RelevanceBadge.tsx:26-57` renders only `band` and `summary`.
  A search for `.applicability`, `needs_profile_input`, `does_not_apply`, `missingDimensions` across `fsi-app/src` and
  `fsi-app/scripts` (non-test) finds no reader other than the type declarations in `profile.ts:98-113`. The detail page's own
  `relevance` prop is declared (`RegulationDetailSurface.tsx:110`) and the loader skips it by default
  (`load-detail-core.ts:302-303`). [CONFIRMED: git grep and reads]
- The tags that the four instruments' live items carry are not in tree. [HYPOTHESIS] for any claim about what tags they carry.

## 6. Fixture runs (RUNS)

Method: the repo's own harness `node --test`, then one in-memory script (`node --input-type=module -e`, no file created)
that imports the real modules and drives each instrument through classifier, `deriveObligationRow`, `main()` dry-run, and the
read-time gate. Run from `fsi-app/` on master 6028b228, 2026-10-08.

Run 1, existing tests:
`node --test scripts/obligations/derive-obligations.test.mjs src/lib/obligations/classify-binding-position.test.mjs
src/lib/obligations/read-register.test.mjs src/lib/applicability/compute-applicability.test.mjs
src/lib/workspace/relevance.test.mjs src/lib/profile/profile-contract.test.mjs`
Result: tests 118, pass 118, fail 0, skipped 0. [CONFIRMED: ran]

Run 2, per instrument. Titles used are forms found in tree (stored titles or spec names); Empowering Consumers has no stored
title in tree, so spec names are used. Inputs are constructed fixtures, not live rows.

A. Classifier on title (as `derive-obligations` supplies it): direct_duty for all 11 title forms across the four instruments
   (3 CountEmissions, 3 CBAM, 2 Empowering Consumers, 3 PPWR). [CONFIRMED: ran]

A2. Classifier on real titles from the tracked census fixture (`census-rows.apply-ready.json`): index 51 (Directive 2004/12/EC
   amending Directive 94/62/EC on packaging and packaging waste) returns direct_duty; index 61 (UK Carbon Border Adjustment
   Mechanism (Transitory Provision) Regulations 2026) direct_duty; index 103 (UK Packaging and Packaging Waste producer
   regulations 2024) direct_duty; index 164 (2001/171/EC glass packaging derogation) direct_duty; index 81 (Commission
   Implementing Regulation (EU) 2025/2621 applying Regulation (EU) 2023/956) returns null. [CONFIRMED: ran] None of these five
   is one of the four instruments; the PPWR and CBAM rules (`classify-binding-position.mjs:51-68`) match on the generic phrases
   "packaging and packaging waste" and "carbon border adjustment" and do not match the number 2023/956.

B. `deriveObligationRow` with one dated event (2030-12-02, compliance_deadline) per instrument: each returns
   binding_position direct_duty, due_date 2030-12-02, modes [road, ocean], jurisdiction [EU], status active. [CONFIRMED: ran]

C. `derive-obligations` `main({apply:false})` with injected deps over 4 fixture items and 4 events: "forward events: 4,
   items resolved: 4, derived rows: 4, new to insert: 4"; breakdown `{ direct_duty: 4 }`; `guardedInsertMany` not called.
   [CONFIRMED: ran]

D. Gate via `computeItemRelevance`, per instrument, per tag set, per profile (output is identical across the four
   instruments, because instrument identity is not an input):

| compliance_object_tags | profile orgRoles [forwarder] | profile orgRoles [] | profile orgRoles [carrier] |
|---|---|---|---|
| [] (title-only record item) | applies | applies | applies |
| [freight-forwarder] | applies | needs_profile_input (role) | does_not_apply |
| [customs-broker] (maps to importer_of_record) | does_not_apply | needs_profile_input (role) | does_not_apply |
| [manufacturer-producer] (unmapped) | applies | applies | applies |

Rows of the table were each produced for CountEmissions EU, CBAM, Empowering Consumers and PPWR (16 combinations, 48 gate
calls). [CONFIRMED: ran] Consequences stated as observed facts: with no mapped tag the gate answers `applies` for every
profile including a carrier-only profile; a forwarder profile receives `does_not_apply` when the only mapped tag is
`customs-broker`.

## 7. Facts left unverified because of the window (no live access)

- Whether any of the four instruments has rows in live `obligations` or `item_forward_events` today. [HYPOTHESIS] [NOT-WORK: live question, answered at population, rule 16]
- Which `compliance_object_tags` the four live items carry. [HYPOTHESIS] [NOT-WORK: live question, answered at population, rule 16]
- Whether item 9566075e is the Empowering Consumers directive. [HYPOTHESIS] [NOT-WORK: live question, answered at population, rule 16]
- Whether `origin/master` differs from the checkout at 6028b228 (not fetched). [NOT-WORK: live question, answered at population, rule 16]

## 8. ABSENT, stated as facts (input for OBL-2)

1. No obligation row for any of the four instruments exists in any tracked fixture or artifact (git grep over all tracked JSON
   and JSONL; 0 rows). The two instruments with no forward-events evidence in tree at all: PPWR (item efdb3390) and
   CountEmissions EU (item cd1083c9; the earlier item 7aaecc81 shows 0 events). [NOT-WORK: build-mode hold, population after all layers, CLAUDE.md rule 16]
2. No component-obligation decomposition schema: `obligations` has 14 columns and event grain; no pinpoint, verbatim text,
   duty-holder class, applicability trigger, four dates, or obligation version column; no later migration alters it; the
   migration number plan L17 requested (349) is a different migration. [CLOSED: PR 1025]
3. No role-scoped rows: nothing represents CBAM as indirect customs representative, PPWR as user of transport packaging or
   importer of record, Empowering Consumers as the forwarder's own marketing claims, or CountEmissions EU as the method duty. [NOT-WORK: build-mode hold, population after all layers, CLAUDE.md rule 16]
4. No item-level binding-position banner on the Regulations detail page; the only render is the per-row "Binding" cell in a
   section mounted below the surface, and it renders nothing for an item with zero rows. [CLOSED: PR 1025]
5. No roleScope or sizeThreshold at obligation grain: no column, no producer; the gate's roleScope exists only at item grain
   from `compliance_object_tags` (14 tag values mapped to 8 roles); `size_threshold` has no producer. [CLOSED: PR 1025]
6. The gate's output has no reader: `applicability` is computed and returned in the `/api/detail/relevance` JSON and no
   non-test code reads it; the badge renders band and summary only. [CLOSED: PR 1025]
7. No instrument-specific input to the gate: identical outputs for all four instruments under identical tags. [CLOSED: PR 1025]
8. The classifier has no rule that returns `monitoring_only` (16 rules: 6 direct_duty, 7 carrier_passthrough, 3
   customer_contract); both tracked read-backs show 0 monitoring_only; non-null binding_position rate 9.9 percent
   (130 of 1318) at brief-apply-run-006. [CLOSED: PR 1025]
9. `derive-obligations` classifies on title only: `legal_instrument`, the canonical instrument key and the record-facts
   `[binding_position]` claim are not read; title forms without the instrument name or number return null (census index 81),
   and the PPWR and CBAM rules return direct_duty for non-target instruments whose titles contain the generic phrases
   (census indices 51, 61, 103, 164). [CLOSED: PR 1025]
10. Plan L17 acceptance (>=1 obligation row with non-null binding_position for each of the 4 instruments, and the detail-page
    banner) is not evidenced as met for any instrument. [NOT-WORK: build-mode hold, population after all layers, CLAUDE.md rule 16]
