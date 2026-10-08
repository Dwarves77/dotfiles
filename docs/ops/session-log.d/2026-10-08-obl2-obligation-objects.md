# 2026-10-08 OBL-2 (obl2-obligation-objects): the obligation object of spec 01 section 3.2, built as a layer, populated later

Lane OBL-2, branch lane/obl2-obligation-objects, cut from origin/master 6028b228. Executor lane. Facts only; each one was confirmed by the method named.

## Accomplished

- Migration 376 `obligation_objects` (NOT APPLIED, zero rows by construction): `fsi-app/supabase/migrations/376_obligation_objects.sql:85` table; guard trigger function `:202`; outbox trigger in migration 352's two-argument form `:282`; `obligations.obligation_id` nullable FK, no backfill `:308`; rolled-back self-check with attacks. Static test `376_obligation_objects.test.mjs` (17 tests, pass).
- Cost slots per the coordinator addendum: slot 1 penalty exposure is `statutory_maximum` and `cost_formula`; slot 2 `direct_compliance_cost jsonb {amount, currency, basis, source}` (`:111`); slot 3 `effort jsonb {person_days, recurrence}` (`:112`), refused by CHECK if it carries a money key. The four dates are four columns (`:102` to `:104` region: entry_into_force, date_of_application, first_deadline, enforcement_start).
- The gate: `fsi-app/src/lib/workspace/relevance.mjs` reads roleScope and sizeThreshold per obligation object (`objectGateInputs` `:117`, `summariseObligationBinding` `:190`, wired into `computeItemRelevance` `:343`); the item-grain path is the fallback when no objects exist. The route `src/app/api/detail/relevance/route.ts` reads the item's objects (`fetchObligationObjectsForItem`, `relevance.mjs:246`, request-scoped client, RLS applies) and returns `binding` for the banner.
- The detail page banner: `src/components/regulations/BindingBanner.tsx`, mounted above the obligations register at `src/app/regulations/[slug]/page.tsx:299`. One line per distinct binding_position with duty holders, the trigger, the applicability status, and the cost slots each labelled by name ("Penalty exposure", "Direct compliance cost", "Effort (person-days, not money)"); "Obligations not yet decomposed" when the item has no objects.
- The classifier in `scripts/obligations/derive-obligations.mjs`: `classifyItemBindingPosition` `:141` reads the instrument key, instrument_identifier and legal_instrument first, then the record-facts `[binding_position]` claim, then the title, then the monitoring_only duty-holder rule; `contextFromClaims` `:119`; `buildContextByItem` `:230`; DERIVATION_VERSION `oblig-derive-2026-10-08.1`.
- Fixtures: `src/lib/obligations/fixtures/obligation-objects.fixture.json`, marked FIXTURE, never loaded live: one object row per instrument (CountEmissions EU method duty, CBAM indirect customs representative, Empowering Consumers own marketing claims, PPWR user of transport packaging and importer of record) plus a fixture capture each holding the verbatim span. Text values are placeholder text, not the instruments' wording; only dates spec 01 section 1 and 3.3 state are set.
- Tests: `src/lib/workspace/obligation-gate.test.mjs` (17), `scripts/obligations/derive-obligations.test.mjs` (31 including 15 new), `src/components/regulations/BindingBanner.test.mjs` (9), `docs/inventories/migrations.md` regenerated with its generator (one row).

## Read and reused

- Read in full: CLAUDE.md, lane-common-contract.md, the OBL-1 register, spec 01, docs/design/ux-laws.md, design-principles.md, migrations 282, 283, 290, 352, the 284 outbox, 356 (span rule), 112, 264, 372's test shape, F70's header, `relevance.mjs`, `compute-applicability.mjs`, `profile-contract.mjs`, `viewer-relevance.ts`, `profile.ts`, the relevance route, the obligations register route, `ObligationRegister.tsx`, `derive-obligations.mjs` and its tests, the maintenance wrapper and its test, `classify-binding-position.mjs` and its test, the census fixture.
- Reused instead of built: the entity spine (`entities`, kind obligation, `id_matches_kind`); the outbox function and its entity-column argument (352); `agent_run_searches.result_content` as the capture and criterion 3's `position(lower(btrim(span)) IN lower(capture))` rule; the obligations RLS predicate shape (290); `computeApplicability`, `ORG_ROLES`, `ORG_SIZE_DIMENSIONS`, `findBand`; `BINDING_POSITION` labels; the 16-rule table `BINDING_POSITION_RULES` (unchanged, tested by the new classifier through its exported rules); `readAllByIds`; `fetchObligationObjectsForItem` follows the register route's legacy-id resolution; the existing census fixture for the red-then-green classifier cases; the detail-section container and gutter token of the sibling sections.

## Decisions

1. ID shape is `cl:obligation:<16 hex>`, not the brief's `cl:oblig:`: migration 282 `id_matches_kind` makes `cl:oblig:` unregisterable in `entities`.
2. The verbatim guard is a SECURITY DEFINER BEFORE trigger (the capture text lives in `agent_run_searches.result_content`, which a trigger can read), so there is no `insert_obligation_object` RPC. F70: REVOKE and pinned search_path on the definer. Migration 356's own span function is not depended on (356 is NOT APPLIED); the rule is the same expression.
3. `capture_id` is `agent_run_searches(id)`, the FK target section_claim_provenance names (`search_result_id`, migration 112); NOT NULL. `instrument_item_id` is NOT NULL (the capture must belong to it and the outbox is keyed on its entity). `instrument_entity_id` is a denormalized column filled by the guard, because 352 reads the entity from a column of the changed row.
4. `owner` and `control_action` are not columns (customer-entered data, ADR-042, ADR-043).
5. The gate's roleScope for an object is the ORG_ROLES its duty_holder_class values map to (`DUTY_HOLDER_CLASSES`, relevance.mjs:68; a class with no ORG_ROLES counterpart maps to none) plus an `org_role` trigger value; a size-dimension trigger is the sizeThreshold; any other trigger attribute is reported as the missing input, never a silent apply.
6. Classifier: the CBAM and PPWR rules carry a generic phrase alternative that matched other instruments; the phrase is removed before the rule is tested (acronym and number still match), and the CBAM phrase is accepted back for EU items. `2023/956` is added as a CBAM identity. `classify-binding-position.mjs` itself is untouched (not in the write set); this logic lives in derive-obligations.mjs.
7. monitoring_only comes last in the order, after every named instrument rule, so a named spec 01 instrument is never turned into monitoring_only by an addressee. Duty holders come from the item's current obligation objects and from the verbatim "addressed to the Member States" scope claim. Consequence stated plainly: an EU directive that no rule names and whose scope claim says it is addressed to the Member States now classifies monitoring_only (census index 51) where it was direct_duty or unclassified.
8. The two extra reads in `main` (record-facts claims, obligation_objects) are tolerant and disclosed (`optional_reads_unavailable` in the summary), because migration 376 is not applied and other callers (`apply-record-briefs`, `run-population-flywheel`) pass their own dependency objects.

## Red then green

- Gate and classifier tests were written first and run against the old code: `obligation-gate.test.mjs` and `derive-obligations.test.mjs` failed at import (the new exports did not exist). On the old classifier (`classifyBindingPosition` on the title, run by `node -e` on the census fixture): index 51 direct_duty, 61 direct_duty, 81 null, 103 direct_duty, 164 direct_duty. After: 51 monitoring_only, 61 null, 81 direct_duty, 103 monitoring_only (record-facts claim), 164 null. The gate output before this lane was identical across the four instruments (OBL-1 section 6 D); the new test asserts four distinct outputs for one profile and different statuses per role profile.

## The ten ABSENT facts of OBL-1 section 8

1. No obligation row for any of the four in any fixture or artifact: closed for fixtures by `src/lib/obligations/fixtures/obligation-objects.fixture.json` (4 rows). Live rows: deferred-to-population (Stage 9, a grounded drain batch; operator ruling 2026-10-04 holds population until every layer is complete).
2. No component-obligation schema: closed by `376_obligation_objects.sql:85`.
3. No role-scoped rows: closed as fixtures (the four rows carry duty_holder_class and trigger per role); live rows deferred-to-population.
4. No item-level binding banner: closed by `BindingBanner.tsx` and `page.tsx:299`.
5. No roleScope or sizeThreshold at obligation grain: closed in code by `relevance.mjs:117` (columns by `376_obligation_objects.sql:95` and `:96`); live producers of rows deferred-to-population.
6. The gate output has no reader: closed, the banner reads `binding` and `applicability` from the route (`route.ts`, `BindingBanner.tsx`).
7. No instrument-specific input to the gate: closed by `relevance.mjs:343` and the four-instrument test in `obligation-gate.test.mjs`.
8. No monitoring_only rule: closed in code by `derive-obligations.mjs:141`; the live non-null and monitoring_only rates are deferred-to-population (they need a derive run on live data, not run here).
9. Classification on title only: closed by `derive-obligations.mjs:141` and the widened select in `main`; the live effect deferred-to-population.
10. L17 acceptance (at least one non-null-position row per instrument, and the banner): the banner closed; rows for the four instruments deferred-to-population.

## Register rows closed (VERIFY-1 register `fsi-app/scripts/tmp/verify1-register-unknowns-2026-10-08.md`)

By name in that register: 01S3.3 four distinct dates (fields `date_of_application` and `enforcement_start` now exist, unknowns list item 5); 01S3.4 cost slot 1 penalty exposure (as a customer-readable object field, not the FuelEU-only formula writer), slot 2 direct compliance cost, slot 3 effort (unknowns list item 6): schema and renderer closed, values deferred-to-population; 01S4 #1 binding-position banner at item level (unknowns list item 8, banner form). Not closed by this lane: 01S4 #2, #4 T-90/T-30/T-7, #5, #6, #7 on the page as computed exposure, #9, #10, #11. Slot 1's "computed exposure only where formulaic" is not built: the banner shows the published `statutory_maximum` and `cost_formula` text only.

## What is NOT done

- No population, no live read or write, no migration applied.
- The outbox trigger on `obligation_objects` makes `src/lib/learning/questions-on-change.test.mjs` fail until `EMITTING_TABLE_EVENT_MAP` in `src/lib/learning/questions-on-change.mjs` gets an entry for `obligation_objects` (the test parses the migrations and requires a mapping per emitting table). NEEDS WRITE-SET EXPANSION: `fsi-app/src/lib/learning/questions-on-change.mjs`, one entry, event type `obligation_amended` (already a TRIGGER_EVENT_TYPES value).
- The UX smoke spec for the banner (`.discipline/rendering/smoke/binding-banner-smoke.mjs`, its line in `ux-smoke-specs.mjs`, and the `ROW_COMPONENTS` line in F35) is outside the write set. NEEDS WRITE-SET EXPANSION. Until it exists the 375 px layout is held by construction and proven statically in `BindingBanner.test.mjs`, not measured in a browser.
- No admin override mechanism on `obligation_objects` (migration 356's correction kinds do not include it) and no automatic writer exists in this lane, so nothing overwrites a row.
- `classify-binding-position.mjs` generic-phrase alternatives are neutralised in derive-obligations.mjs, not removed at the source (not in the write set).
- The banner is client-fetched; a viewer without an authenticated session gets the failure state because the table policy is for authenticated only.

## Open items

- Whether the coordinator wants the generic-phrase fix made in `classify-binding-position.mjs` (one home) and the smoke spec registered; both are expansions listed above.
- Which duty-holder classes are authoritative: `DUTY_HOLDER_CLASSES` in relevance.mjs is the vocabulary used by the gate; the migration deliberately has no CHECK on class values.

## UX compliance (BindingBanner, Regulations detail)

- Primary goal: know whether this regulation is the customer's own duty, the carrier's, the customer's contract, or monitor only. Path: read the banner, zero clicks.
- One primary action: "Open organisation profile" (to /settings), shown only when an answer needs profile input; the retry control "Try again" is shown only after a failed load; never both. Each is at least 44 px tall.
- Feedback per async action: the fetch has a loading line (role status), a plain-language failure with retry (role alert) that leaves the rest of the page intact, and a completion state in every branch (decomposed lines, or "Obligations not yet decomposed").
- Rows at 375 px: lines wrap, no fixed widths, overflow-wrap anywhere, the title carries data-guard-title, gutter is the page token (16 px at phone width). Measured by construction and statically in BindingBanner.test.mjs; the browser measurement waits on the smoke spec listed under NOT done.
- DP-1 not applicable (customer surface, read only). DP-2: the answers above.
