# Industry-level statements: fact register (lane s8f-industry-statements, Phase 1)

Status: FACT REGISTER ONLY. No design, no options, no recommendation. The coordinator writes the design from this.
Filename keeps the path the brief named; its content is a register because the coordinator redirected the lane
mid-task (operator ruling: the coordinator designs, lanes do not).

Method: read in a worktree cut from origin/master at 32292086 (2026-10-07). No live database, no network
other than `gh pr diff 922` and `gh pr view 922`. Row counts are the values RECORDED in the cited documents;
this lane did not re-query them.

Status tokens (CLAUDE.md rule 14): `[CONFIRMED]` re-verified by the method named in the entry; `[HYPOTHESIS]`
read from a record or inferred, not re-verified here; `[REFUTED]` investigated and found false (corrected in place).

---

## 1. Spec 04 requirements and warnings (quoted verbatim, `docs/specs/04-operations.md`)

1.0 `[CONFIRMED]` (grep, `git grep -i "industry-level"` across docs and fsi-app): the phrase "industry-level" does not
occur in spec 04. Its only occurrence in the docs tree is `docs/plans/buildout-plan-2026-10-04.md` line 96:
"Industry-level statements replace the removed calculator." Spec 04 never defines an "industry-level statement" or
"industry-level indicator". The nearest spec 04 vocabulary is "composite indicators" (section 2) and "cost model" versus
"quality/capability index" (section 1). The quotes below are every passage that constrains a derived or aggregate figure.

1.1 `[CONFIRMED]` Contract, lines 5-8 and the ADR-043 note at line 10:

> **Contract (RULED 2026-07-12).** Operations reads are STRUCTURED JURISDICTIONAL DATA SURFACES:
> comparative and numerical regional intelligence (feasibility, cost, labour, materials, infrastructure)
> for hire-vs-automate and infrastructure decisions. Not a text brief. It is a **content build, explicitly
> not a decision-engine UI**.

> **Operator ruling 2026-10-03 (ADR-043).** The contract is now: structured jurisdictional cost and feasibility evidence (labour, energy, materials, infrastructure) for the reader's own decisions. "Hire-vs-automate" is no longer the surface's purpose; the surface states what wages and costs are, sourced, and does not say automate or hire.

1.2 `[CONFIRMED]` Section 1, two blocks, lines 26-32 (cost model versus quality index):

> Professional location-intelligence products split the object into a **cost model** (money, comparable,
> additive) and a **quality/capability index** (scores, non-additive), and never mix them in one column.

> **availability of skilled labour 100%, site readiness and due-diligence status 98.5%, electric power
> availability 94%**. Feasibility has overtaken price as the binding constraint. **A surface that scores
> feasibility instead of gating it gets the decision backwards** (see component 8).

1.3 `[CONFIRMED]` Section 2, composite indicators, lines 39-56 (the warnings, verbatim):

> The OECD/JRC Handbook's own cons list, reproduced as design constraints, because we are building exactly
> the artefact it warns about:
>
> - may send misleading policy messages if poorly constructed or misinterpreted
> - may invite simplistic conclusions
> - **may be misused to support a desired conclusion if the construction process is not transparent**
> - the selection of indicators and weights could be the subject of dispute
> - **may disguise serious failings in some dimensions**
> - may lead to inappropriate decisions if dimensions that are hard to measure are ignored
>
> And the governing statement: *"Transparency must be the guiding principle of the entire exercise."*
>
> **Consequences for this surface.** Normalise by **distance-to-reference (base region = 100)**, not
> min-max, because min-max destroys ratio meaning for cost. **Never hard-code the base region**: a Dutch
> forwarder and a Polish forwarder ask the same question from different origins, and a fixed base smuggles
> in a point of view. Publish weights. Ship sensitivity as a feature, not an internal check.

1.4 `[CONFIRMED]` Section 3, missing data, lines 58-79 (the "rule that protects everything"):

> 1. **Never impute silently. Never impute at all in a cost cell.** A missing electricity price is missing.
>    Inventing one and displaying it identically to a real one is precisely the failure the Handbook names.
> 2. **Explicit flag vocabulary on every cell**, modelled on Eurostat and consistent with the shared
>    `status` vocabulary in `00-foundation` §3.1: observed / provisional / estimated (method X) / modelled glyph:verbatim
>    / proxy (from Y) / confidential / not available / not applicable / stale (>N years).
> 3. **Reference period on every cell.** A 2023 packaging recycling rate assessed against a 2030 target is
>    legitimate; presenting it undated is not.
> 4. **Per-region coverage percentage as a first-class field**: "Region R: 14 of 22 indicators populated."
> 5. **Suppression rule for aggregates**: if a derived cell would depend on more than ~20% imputed inputs,
>    suppress the derived cell and show the components instead.
> 6. **If you must estimate, name the donor.** "Estimated from Czechia (nearest peer, NACE H, 2024)" is
>    defensible. "18.20" is not.
> 7. **Sensitivity as a shipped feature.** If the automate-vs-hire answer flips when a missing input moves
>    within its plausible range, **the surface must say the answer is indeterminate.**
>
> > **Operator ruling 2026-10-03 (ADR-043).** Retired with the automate-versus-hire answer it qualified. Sensitivity still applies to any estimate the surface shows: a range, never a bare point (ADR-024 decision 2).

(Line 63 of the spec carries a section-sign glyph, disclosed by the marker on the quoted line above.)

1.5 `[CONFIRMED]` Section 6, required components (lines 126-141) that constrain a derived figure, verbatim table cells:

> | 1 | **Region roster with a coverage ledger** (count and % of populated indicators, oldest reference period in the row) | All five. A comparison whose regions have unequal data density is a comparison of data density |

> | 4 | **Provenance and vintage stamp on every cell**: source, dataset code, reference period, status flag, retrieval date | What makes this intelligence rather than a table, and the only defence against the Handbook's misuse warning |

> | 8 | **Feasibility gate layer, evaluated BEFORE cost**: PPWR thresholds, EPR registration and authorised-representative requirements, PFAS limits, national permitting, ETS2. Rendered as gates (blocked / conditional / clear), **never as points added to a score** | Decisions 3, 4, 5. §1 | glyph:verbatim

> | 11 | **Missing-data surface** with reasons, per-region coverage %, and the suppression rule | Protects every decision. §3 | glyph:verbatim

Components 6 and 7 (TCO panel, sensitivity strip) are struck through and retired by ADR-043 (lines 133-136).

1.6 `[CONFIRMED]` Section 7, the honest gap on manually curated figures, lines 189-193:

> **Land and warehouse rent: the honest gap.** No free, authoritative, machine-readable, pan-jurisdiction
> dataset exists. Prologis, Cushman & Wakefield, JLL, CBRE and Savills publish free PDFs with inconsistent
> definitions. **Design consequence: rent must be a manually curated, provenance-stamped, explicitly dated
> cell, visibly of a different quality class from the API-fed cells. Do not launder a PDF number into a
> cell that looks identical to a Eurostat cell.**

1.7 `[CONFIRMED]` Section 8, line 197 (the regulation-to-operations comparison is reserved elsewhere):

> **Operator ruling 2026-10-03.** PPWR here is an illustration of a class, not the scope (CLAUDE.md rule 19). The L14 page-local build of rows 8 and 9 (PR 911) was reverted (lane L14-REVERT). Regulation-to-operations comparisons are produced by the flywheel for every regulation, never as a named regulation's own section; the design is owed by the coordinator.

1.8 `[CONFIRMED]` Section 9, acceptance criteria 1 to 12, lines 207-221, verbatim (criterion 8 struck by ADR-043):

> 1. A cross-region view exists in which two regions appear on one axis for one dimension, without
>    expanding accordions.
> 2. Every cell carries source, dataset code, reference period, status flag and retrieval date.
> 3. Zero imputed values in cost cells; zero silent imputation anywhere.
> 4. Every region row shows its coverage percentage.
> 5. Derived cells suppress above the imputation threshold and show components instead.
> 6. The base region is user-selectable and printed wherever an index is shown.
> 7. Feasibility renders as gates, never as score contributions.
> 8. ~~`breakeven_wage` and `breakeven_utilisation` render with equal prominence to the headline result.~~ **Operator ruling 2026-10-03 (ADR-043): retired (ADR-043).**
> 9. One assumption register, one discount rate, stamped on every derived output.
> 10. Native units are primary; index is visually subordinate.
> 11. Distance-to-node accompanies every infrastructure capacity figure.
> 12. Manually-curated cells (rent) are visually distinguishable from API-fed cells.

1.9 `[CONFIRMED]` Line 143, the ADR-042 note on component 12 (assumption register):

> **Operator ruling 2026-10-03 (ADR-042, external data only).** Component 12 applies only as the product's own versioned modelling constants (assumption_register, migration 271), not as customer-editable stored assumptions. The customer uploads nothing and the system stores no customer-entered data for analysis; it takes external data and advises what it means. The automate-versus-hire calculator takes typed inputs, computes in the browser and stores nothing; that stays.

(The last sentence of line 143 is superseded by ADR-043, which removed the calculator; both lines are still in the file. `[CONFIRMED]` by reading ADR-043 frontmatter `supersedes`, see section 6.)

---

## 2. The exact mount point the calculator occupied (`gh pr diff 922`)

PR 922 `[CONFIRMED]` (`gh pr view 922`): state MERGED 2026-10-04T11:40:52Z, title "NO-TYPED-INPUT: retire the calculator and the automate-vs-hire framing (ADR-043, migration 350)".

2.1 `[CONFIRMED]` Origin of the position (deleted header of `OperationsCalculatorPageView.tsx`, in the diff): "The capacity-investment calculator was a full-width section mounted below the /operations list, under artboard 08's last card. Item D's page-scope ruling is that an artboard defines the whole page, so the calculator moves to its own route." (UI fix round 2026-09-08, item D3.) So the calculator held two positions over time: first a section below the list; then, from 2026-09-08 until PR 922, its own route.

2.2 `[CONFIRMED]` Route file deleted: `fsi-app/src/app/operations/calculator/page.tsx`. Default export `OperationsCalculatorPage`, an async server component. Reads: `getPublicSurfaceCounts("operations")` (for `totalItems`), `renderNowIso()`, `formatLocaleDate(...)`. Renders `<OperationsCalculatorPageView dateLabel={dateLabel} nowIso={nowIso} itemCount={aggregates.totalItems ?? 0} />`.

2.3 `[CONFIRMED]` Component deleted: `fsi-app/src/components/operations/OperationsCalculatorPageView.tsx`, a `"use client"` component. Props, exactly: `{ dateLabel: string; nowIso: string; itemCount: number }`. It rendered: `<Masthead title="Capacity investment estimate" dek=... dateLabel nowIso commandBar={{ itemCount, scope: "operations", placeholder }} />`; a two-column grid (`minmax(0,1fr) 300px`, class `cl-list-surface-grid`); in the left column `<div data-audit="calculator-column">` containing `<AutomateVsHireCalculator nowIso={nowIso} />`; in the right column `<LegendRailCard />`. Imports: `Masthead`, `LegendRailCard`, `LIST_SURFACE_MOBILE_CSS` (from `ListSurfaceShell`), `AutomateVsHireCalculator`.

2.4 `[CONFIRMED]` Component deleted: `fsi-app/src/components/operations/AutomateVsHireCalculator.tsx`. Props, exactly: `{ nowIso: string }` (required). Local state `FormState` from typed number inputs; imports `automateVsHire`, `DEFAULT_SCENARIO` from `@/lib/operations/automate-vs-hire.mjs`, `EstimatedFigure`, `NoticesRail`, type `Value`. Its foot rendered `<NoticesRail heading="Recent recalculations" bare />`. No API route, nothing stored.

2.5 `[CONFIRMED]` The one link into it, removed from `OperationsLedger.tsx` in the same diff: a `belowRows` prop value passed to `ListSurfaceShell`, a `<Link href="/operations/calculator" data-audit="calculator-link">` with text "Capacity investment estimate", wrapped in `<div style={{ display: "flex", justifyContent: "flex-start" }}>`, minHeight 28, in the slot the removed "By state" disclosure had vacated.

2.6 `[CONFIRMED]` Other files the diff removed or edited that referenced the position: `.discipline/rendering/audit/spec/compose-operations-calculator.json` (deleted), the calculator link row in `compose-08-operations-list.json`, the mount in `.discipline/rendering/audit/mounts.mjs`, `src/lib/operations/automate-vs-hire.mjs` and its test (deleted), propagation method `automate_vs_hire` (deleted).

2.7 `[CONFIRMED]` (grep `automate-vs-hire|AutomateVsHire|operations/calculator` over `fsi-app/src` and `fsi-app/scripts`, excluding markdown) at origin/master 32292086: no source file under `fsi-app/src` references the calculator or the route. The only remaining hits are historical harness-run JSON artifacts under `fsi-app/scripts/harness-runs/` (value ids and evidence strings).

2.8 `[CONFIRMED]` What occupies the neighbouring slot today. `fsi-app/src/app/operations/page.tsx` (81 lines) passes `belowRows={<ThemeStrip surface="operations" />}` to `OperationsLedger`, which forwards it to `ListSurfaceShell`'s `belowRows` prop (Lane S3-B comment in `OperationsLedger.tsx`). `/operations/calculator` has no route file. `ListSurfaceShell` slots (grep of its props, lines 92-156): `bandCounts`, `facetGroups`, `aboveRows`, `rowsByBand`, `belowRows`, `rail`.

2.9 `[CONFIRMED]` The data the calculator route read was one count (`getPublicSurfaceCounts`); the calculator itself read no table (pure client compute from typed inputs, per the deleted header: "pure client-side compute").

---

## 3. Operations tables, recorded row counts, and live consumers

Counts source: `docs/plans/system-map-2026-10-04.md` lines 251-256 (live counts read 2026-10-04 by the coordinator). Consumers: `git grep` over `fsi-app/src` and `fsi-app/scripts`, excluding tests, fixtures, harness-run JSON and markdown.

| Table | Rows (system-map 10-04) | Status | Consumers found by grep |
|---|---|---|---|
| `regions` | not in the 2026-10-04 inventory; migration 106 seeds 5 (EU, US, ASIA, UK, UAE) and `docs/audits/app-audit-a5b-migrations-001-170-2026-09-30.md` line 145 records "LIVE (5 / 90 rows)" for migration 106 | `[HYPOTHESIS]` for the live count | read: `src/lib/supabase-server.ts:3710` (`fetchOperationsCoverage`), `src/lib/agent/formats/operations-matrix.ts:169`, `src/app/api/ask/route.ts:248`, `scripts/entities/backfill-entities.mjs:166`, producers `run-envelope-producer.mjs:34` and `state-cost-facts-producer.mjs:94` |
| `regional_data_facts` | 90 (line 252) | `[HYPOTHESIS]` (recorded, not re-queried) | read: `supabase-server.ts:3723` (`fetchOperationsCoverage`, called only from `src/app/operations/page.tsx`), `src/app/api/ask/route.ts:250`, `scripts/entities/seed-corridors.mjs:308`, `run-envelope-producer.mjs:51`; write: `run-envelope-producer.mjs:177,181` (guarded) |
| `region_dimension_coverage` | not in the 2026-10-04 inventory | `[HYPOTHESIS]` | read: `supabase-server.ts:3720`, `operations-matrix.ts:197`; kept in sync by trigger `rdf_sync_coverage` on `regional_data_facts` (migration 109 lines 161-164) `[CONFIRMED]` |
| `state_cost_facts` | 13 (line 252) | `[HYPOTHESIS]` | read: `supabase-server.ts:3855` (`fetchStateCostFacts`, called from `src/app/operations/page.tsx`), `src/app/api/ask/route.ts:255`; write: `state-cost-facts-producer.mjs:232,239` |
| `estimated_values` | 0 (line 253) | `[HYPOTHESIS]` | `[CONFIRMED]` no read in `fsi-app/src` (grep returns none); `scripts/lib/table-primary-keys.mjs:65` and `db.mjs` doc comments only. ADR-043 consequence: "`estimated_values` has no registered writer after this change." |
| `statutory_computations` | 0 (line 253) | `[HYPOTHESIS]` | `src/lib/propagation/statutory-rows.ts:342` (writer path) |
| `derived_values` | 22 (line 251) | `[HYPOTHESIS]` | `src/lib/propagation/` only (`drain.ts:321`, `author-edges.mjs:115`, `methods/superseded-notices.ts:101,108`); customers read via the view `derived_values_admissible` and `/api/notices` |
| `emission_factors` | 13 (line 252) | `[HYPOTHESIS]` | `src/app/market/[slug]/page.tsx:201`, `src/app/admin/factors/page.tsx:93`, `src/app/admin/page.tsx:116`, `src/lib/propagation/methods/carbon-intensity.ts:60`, `scripts/propagation/seed-derived-values.mjs:76`, `scripts/gen/emission-factors-common.mjs:180` |
| `market_series` | 2,747, newest 2026-09-16 (lines 251-252) | `[HYPOTHESIS]` | read via `fetchMarketSeriesBoard` in `supabase-server.ts` (~3949) for `src/components/market/MarketSeriesBoard.tsx`; writers: `scripts/producers/market/ecb-fx-producer.mjs`, `eia-v2-petroleum-spot-producer.mjs`, `eu-weekly-oil-bulletin.mjs`; read by `author-market-series-delta.mjs`, `backfill-derivation-edges.mjs`, `seed-corridors.mjs:307` |
| `published_price_statistics` | 10 (line 253) | `[HYPOTHESIS]` | `src/app/market/[slug]/page.tsx:170`, `supabase-server.ts:2568`, writer `refresh-published-price-statistics.mjs` |
| `auxiliary_energy_profiles`, `grid_connection_queues`, `reroute_events`, `oem_tech_roadmaps`, `indexation_clauses` | 0 each (line 255-256) | `[HYPOTHESIS]` | panels: `src/components/operations/AuxiliaryEnergyPanel.tsx:36`, `GridQueuePanel.tsx:22`, `src/components/market/ReroutingPanel.tsx:28`, `OemRoadmapPanel.tsx:38`, `IndexationPanel.tsx:32`; producers under `scripts/spec09/` |
| `obligations`, `item_forward_events` (feeds Operations D1 text only through items; listed because the buildout plan names no other source of jurisdictional requirement counts) | 1,336 and 1,336 (system-map line "Connections") | `[HYPOTHESIS]` | `src/lib/obligations/read-register.mjs`, `src/lib/forward-events/read-upcoming.mjs`; schema in migrations 274 and 290 |

3.1 `[REFUTED]` The claim in `docs/plans/buildout-plan-2026-10-04.md` line 106 and the lane brief, "`regional_data_facts` ... no consumer after ADR-043", as worded. Method: `git grep` (above). `regional_data_facts` has four live read consumers (the Operations matrix and coverage rail through `fetchOperationsCoverage`, `/api/ask`, `seed-corridors.mjs`, and the producers' own idempotency read). What is true `[CONFIRMED]`: no consumer DERIVES a value from it after ADR-043 (the `automate_vs_hire` method and the region-grain edge authorship were removed; the producers now set `edges_authored: null` with the comment "regional_data_facts rows carry no derivation edges (ADR-043)" in `bls-oews-producer.mjs:99`, `eurostat-lc-lci-lev-producer.mjs:201`). `estimated_values` is correctly stated as having no consumer `[CONFIRMED]`.

3.2 `[CONFIRMED]` (reading the file) `state_cost_facts` is read by the list page only to tally sourced states in the "Coverage gaps" rail card (`OperationsLedger.tsx` `coverageGapRows`: `stateCostByCode.size` against `Object.keys(STATE_LABELS).length`) and by `/api/ask`. The page header comment says the "By state" sub-list was removed (UI fix round 2026-09-08, item D3).

3.3 `[CONFIRMED]` (reading the files) Producers that write `regional_data_facts`: `bls-oews-producer.mjs` and `eurostat-nrg-pc-205-producer.mjs` have `const ENABLED = true` ("ARMED 2026-08-30") and are steps in `.github/workflows/producers.yml` (lines 193, 207, 218); `eurostat-lc-lci-lev-producer.mjs` is in the same workflow. The workflow trigger is `workflow_dispatch` only per `docs/audits/wiring-audit-2026-09-04/A1-runtimes.md` line 25 `[HYPOTHESIS]` (audit text, not re-read against the workflow's `on:` block here).

3.4 `[CONFIRMED]` (reading the file) `scripts/producers/regional/state-cost-facts-producer.mjs` has `export const ENABLED = false` (line 56), header "R14 HOLD", and no reference in any file under `.github/workflows` (grep returned none). The brief's "state_cost producers fixture-only" holds.

3.5 `[HYPOTHESIS]` (arithmetic over the producers' code and `docs/ops/session-log.d/2026-10-03-l13.md`, not a query) The lane L13 log records for `regional_data_facts`: 90 rows, 22 in `labor_markets`, `origin_class` NULL on 75, `official` on 14, `derived` on 1; and for `state_cost_facts`: 13 rows, all `labor_markets`, `origin_class` NULL on all. The 14 `official` plus 1 `derived` is consistent with: BLS OEWS 3 occupations (`OEWS_OCCUPATIONS`) times 2 measures (annual and hourly median) = 6 rows; Eurostat `nrg_pc_205` one row per consumption band; Eurostat `lc_lci_lev` one `derived` EU row (mean over six member states). The number of `nrg_pc_205` bands is not in the repo.

3.6 `[HYPOTHESIS]` Earlier records of the 75 legacy rows: `docs/plans/master-execution-plan-2026-08-17.md` line 159 ("75 rows (ASIA/UAE/UK x 5 dims x 5; EU=0, US=0)"); `docs/plans/operations-lane-spec-from-repo.md` lines 30-80 (rows measured 2026-08-30: `value_numeric` 0 of 75, `source_id` 0 of 75, `origin_class` 0 of 75; `status` populated free text, for example "Available" 32 and "Constrained" 16). Not re-queried; the live count has since moved to 90.

---

## 4. What each held structure carries per row (column lists and sample shapes, no values)

4.1 `regional_data_facts` columns. `[CONFIRMED]` by reading migrations 106 and 267 and `git grep "ALTER TABLE regional_data_facts"` (only 106 and 267 alter it).
- From 106: `id uuid`, `region_id uuid` (FK `regions`), `dimension text` (CHECK, six values: `regulatory_feasibility`, `regional_resources`, `labor_markets`, `materials_sourcing`, `infrastructure`, `operational_cost`), `fact_label text`, `value text NOT NULL` (free text), `status text`, `trend text` (CHECK `up`, `down`, `flat`), `source_id uuid` (FK `sources`, nullable), `source_note text`, `last_updated timestamptz`, `created_at timestamptz`; `UNIQUE (region_id, dimension, fact_label)`. RLS enabled, SELECT policy `USING (true)`.
- From 267 (all nullable): `value_numeric numeric`, `unit text`, `currency text`, `derivation text` (CHECK, nine values: `statutory_fixed`, `statutory_formula`, `observed`, `transacted_index`, `assessed`, `calculated`, `interpolated`, `modelled`, `estimated`), `origin_class text` (CHECK, seven values: `community`, `community-corroborated`, `modelled`, `derived`, `partner`, `verified`, `official`), `source_key text` (FK `data_sources(source_key)`), `source_ref text`, `n_observations integer` (CHECK > 0), `method_version text`, `as_at_date date`, `reference_period text`.
- Sample shape of one producer observation (keys only; `bls-oews-parser.mjs` lines 136-152 and `eurostat-nrg-pc-205-parser.mjs` lines 109-125): `region_code`, `dimension`, `fact_label` (a template: region code, a descriptive phrase, a dataset tag), `value_numeric`, `unit` (a currency-per-unit string, for example currency over hour or currency over kWh), `currency`, `derivation`, `origin_class`, `source_key`, `source_ref` (dataset code and coordinates), `method_version`, `as_at_date`, `reference_period`.
- The legacy sample shape (75 rows): `region_id`, `dimension`, `fact_label`, `value` (free text with its unit inside the string), `status` (free text), `trend`, `source_note`; envelope columns all NULL.
- Render gate `[CONFIRMED]` (`src/lib/operations/region-grid.mjs`): `isEnvelopedFact(f)` is true only when `valueNumeric` is a finite number AND `unit` is a non-empty string. A row failing it takes the free-text path. `indexAgainstBase` returns null when units differ or the base is 0.
- The TypeScript read shape is `OperationsFact` in `src/lib/supabase-server.ts` lines 3648-3695: the columns above plus `region_code`, `source_name`, `source_url`, `source_tier` (via `customerSourceTier`, null when unrated or unsourced) and a derived `freshness` (`stalenessOf` with `expected_refresh: "annual"` applied to every fact, line 3784).

4.2 `state_cost_facts` columns. `[CONFIRMED]` by reading migrations 152, 267 (lines 126-129) and 332.
- `id uuid`, `region_id uuid` (FK `regions`), `state_code text` (ISO 3166-2), `state_label text`, `dimension text` (same six-value CHECK), `fact_label text`, `value text NOT NULL`, `unit text`, `trend text` (up, down, flat), `source_id uuid` (FK `sources`), `statute_citation text`, `effective_date date`, `last_updated timestamptz`, `created_at timestamptz`, plus `origin_class text` (267, same seven-value CHECK) and `value_numeric numeric` (332: "NULLABLE, ADDITIVE, no backfill in this migration"). `UNIQUE (state_code, dimension, fact_label)`.
- `[CONFIRMED]` it does NOT carry `derivation`, `source_key`, `source_ref`, `n_observations`, `method_version`, `as_at_date`, `reference_period` (no migration adds them).
- Read shape `StateCostFactRow` (`supabase-server.ts` 3833-3842): `stateCode`, `factLabel`, `value`, `unit`, `trend`, `statuteCitation`, `sourceName`, `effectiveDate`. It does not select `value_numeric` or `origin_class`.
- `[HYPOTHESIS]` Live: 13 rows, one fact label per state, 13 states (`docs/plans/operations-lane-spec-from-repo.md` item 6, measured 2026-08-30); `origin_class` NULL on all 13 (L13 log). Whether `value_numeric` is populated live is not recorded.

4.3 Labour chain. `[CONFIRMED]` (reading `src/lib/operations/labour-chain.ts`, `LabourChain.tsx`, `RegionDimensionMatrix.tsx` line 917). It owns no table. Input: the `facts` array of one matrix cell for dimension `labor_markets`. `extractLabourChainTerms` picks, per term, the first fact whose `factLabel` matches a regex: base wage `/\b(wage|salary|earnings)\b/i`, employer contributions `/\b(employer|non-?wage|social contribution|social security)\b/i`, leave and absence `/\b(leave|absence|sick|holiday)\b/i`, turnover and recruitment `/\b(turnover|recruitment|hiring)\b/i`, shift premium `/\bshift premium\b/i`, productive hours `/\bproductive hours?\b/i`. A match with no finite `valueNumeric` is dropped. Per-term value shape `ChainTermValue`: `valueNumeric`, `unit`, `sourceKey`, `sourceRef`, `originClass`, `derivation`, `referencePeriod`, `asAtDate`, `factLabel`. Output `LabourChainResult`: `terms[]` (key, label, present, value, runningSubtotal), `missingTerms`, `numeratorTotal`, `currencyUnit`, `suppressed`, `finalValue`, `finalUnit`, `gapReason`. Suppression: any of the five numerator terms missing, or productive hours not a positive finite number, sets `suppressed` and `finalValue` null. There is no default for productive hours (file header).
- `[CONFIRMED]` (producer code) Existing producers write only base-wage-shaped labour facts (`bls-oews-producer.mjs`, `eurostat-lc-lci-lev-producer.mjs`); no producer in `scripts/producers/regional/` writes an employer-contribution, leave, turnover, shift-premium or productive-hours fact (L13 log states the same; confirmed against the producer file list).
- `[HYPOTHESIS]` "Suppresses on live data": follows from the two bullets above plus the recorded live shape; the render itself was not observed in this lane.

4.4 `emission_factors` columns. `[CONFIRMED]` by reading migration 258 (and 263 for the `mode` CHECK).
`factor_id uuid`, `tier text` (five values, CHECK), `scope_kind text` (`movement`, `carrier_lane`, `operator_lane`, `modal`), `mode text` (`road`, `rail`, `ocean`, `inland_waterway`, `air`), `vehicle_class`, `energy_carrier`, `jurisdiction` (ISO alpha-2, `EU` or `GLOBAL`), `grid_region`, `operator_key`, `corridor_id` (CHECK pattern `cl:corridor:` plus 16 hex), `movement_ref`, `quantity_basis text` (CHECK), `wtt_co2e`, `ttw_co2e`, `wtw_co2e`, `co2_fossil`, `co2_biogenic`, `ch4`, `n2o` (numeric), `gwp_basis`, `load_factor_pct`, `empty_running_pct`, `source_key` (FK `data_sources`), `source_ref`, `donor`, `n_observations`, `derivation` (nine-value CHECK), `origin_class` (seven-value CHECK), `pedigree` (1-5) with five sub-scores, `method_version`, `as_at_date`, `valid_from`, `valid_to`, `superseded_by`, `created_at`. At least one of the three CO2e totals must be present (CHECK). Sample shape for a row: a tier and scope, a mode and vehicle class, a quantity basis, one or more CO2e numerics, a gas-warming basis, a source key and reference, an origin class and derivation, a pedigree score, validity dates.
- `[CONFIRMED]` `emission_factors` is not an Operations-page table: its readers are the Market item page (`src/app/market/[slug]/page.tsx:201`), two admin pages and the `carbon_intensity_tkm` propagation method.

4.5 `regions` and `region_dimension_coverage`. `[CONFIRMED]` (migrations 106, 109, 185). `regions`: `id`, `code` (unique), `label`, `severity` (critical, high, moderate, low or null), `iso_codes text[]`, `display_order`, `created_at`, `updated_at` (`operations_decisions` dropped by 185). `region_dimension_coverage`: `id`, `region_id`, `dimension` (six-value CHECK), `state` (`populated`, `partial`, `pending`, `missing`), `notes`, `fact_count`, `created_at`, `updated_at` (`last_reviewed_at` dropped by 185); `UNIQUE (region_id, dimension)`.

---

## 5. Operations page blocks that render today, and the tables behind them

Sources: `src/app/operations/page.tsx`, `OperationsLedger.tsx`, `RegionDimensionMatrix.tsx` (header and props), `OperationsDetailSurface.tsx`, `src/app/operations/[slug]/page.tsx`. All `[CONFIRMED]` by reading unless marked.

5.1 List page `/operations` (server component `page.tsx` composes `OperationsLedger`, a client component, inside `Suspense`). Page reads, in parallel (`loadOperationsPageData`): `getPublicOperationsItems()` (RPC `get_operations_items_public` through `runCategoryRpcPublic`, `supabase-server.ts:2443`; table `intelligence_items` with source and citation enrichment), `getPublicResourcesOnly({limit, offset: 0})`, `getPublicSurfaceCounts("operations")`, `fetchOperationsCoverage()` (tables `regions`, `region_dimension_coverage`, `regional_data_facts` joined to `sources`), `fetchStateCostFacts()` (table `state_cost_facts`). Blocks, top to bottom:
1. Masthead and command bar inside `ListSurfaceShell`: title "Operations Intelligence", scope line "N active items, N jurisdictions, six dimensions per region, every fact carries a source and date" (counts from `getPublicSurfaceCounts`; the sentence is static text), date line, search/ask input.
2. Band tiles (urgency bands) from `liveFacetCounts` over the loaded rows and aggregates (`intelligence_items` via the RPC).
3. `aboveRows`: `RegionDimensionMatrix`. Props passed: `regions` (from `regions`), `dimensions` (the six-entry constant `DIMENSIONS` in `OperationsLedger.tsx`), `facts` (`regional_data_facts`), `coverageRows` (`region_dimension_coverage`), `crossRefCountsByRegion` (count of regulation items per region, from `getPublicResourcesOnly` plus the `/api/listings/rest?surface=operations` remainder fetch), `crossRefCountsPending`, `totalRegionCount`, `profileHrefByRegion` (from the operations item rows). Inside: a dimension by region scoreboard table, one selected-cell panel of `FactCard`s (the default selection is the first sourced cell of the first sourced row), compare mode on a row header, and, for dimension `labor_markets` with a region selected, `<LabourChain facts={cell.facts} regionLabel=... />`. D1 `regulatory_feasibility` has no fact rows by design (migration 106 column comment) and renders from the cross-reference counts.
4. Rows by band: the 25 regional profile items (`[HYPOTHESIS]` count taken from the code comment "25 Regional Operations Profile items" and the scope-line comment "25 active items"), each a `ListRow` with `WatchButton` (`user_watchlist`) and `PriorityDropdown`; band cap 5 per band with expand.
5. `belowRows`: `ThemeStrip surface="operations"`, a server component reading `connection_themes` (`fetchThemeChips`, `supabase-server.ts` ~4637); renders nothing when no theme touches the page.
6. Rail: facet groups Region, Dimension (counts of regions holding at least one `regional_data_facts` row per dimension), Mode, and "Workspace tags" (client fetch of `/api/workspace/tags?withItemTags=1`; tables `workspace_tags`, `item_workspace_tags`); `RailCard` "Coverage gaps" (rows from `regional_data_facts` dimension coverage per region and the `state_cost_facts` tally against `STATE_LABELS`, plus the static sentence "A known gap, stated plainly. State-level cost facts are the first fills."); `LegendRailCard`.
7. No block renders a derived or aggregate statement. `[CONFIRMED]` no component under `src/components/operations/` or `src/app/operations/` computes a count, extent or comparison across facts other than: the matrix coverage ledger (`buildRegionGrid` fill rate and per-region coverage), `indexAgainstBase` in compare mode, the labour chain sum, and the Coverage gaps tallies.

5.2 Detail page `/operations/[slug]` (server `page.tsx`, client `OperationsDetailSurface`). Reads: the item, `intelligence_item_sections`, `checkMatrixEligibility` (tables `regions`, `region_dimension_coverage`), related items by jurisdiction then source, connections and cross-page analysis, source rows, `ClaimTierMap`. Blocks: masthead and `ActionCard`; `SectionIndex`; `DetailSection` 01 "Summary"; 02 "Substantive findings" holding the eight agent-written sections (headings: "Operational cost baseline", "Feasibility of operational choices", "Cost vs alternatives", "Cross-regional", "Competitive positioning", "Talking points", "Upcoming changes", "Sources"; keys 3 and 4 are gated by `matrixEligibility` and otherwise show an omit note) and the spec 09 sub-sections `AuxiliaryEnergyPanel` (`auxiliary_energy_profiles`, org-scoped, 0 rows recorded) and `GridQueuePanel` (`grid_connection_queues`, 0 rows recorded); 05 "Sources" (`SourcesGrid`); `CrossPageSection` (connections and themes); `NoticesRail` (page.tsx line 308; `/api/notices`, table `derived_values` through the admissible view); rail cards `AtAGlanceCard`, `ImpactRailCard`, `RelevanceBadgeClient`, `RelatedRegionCard`, `RailLegend`, `InThisListStat`.

5.3 `[CONFIRMED]` (`git grep`) Nothing in `src/app/operations`, `src/components/operations` or `src/lib/operations` reads `market_series`, `emission_factors`, `derived_values` (except `NoticesRail` through the API), `obligations` or `item_forward_events`.

---

## 6. ADR-043: exact scope of what is retired (`docs/decisions/ADR-043-no-typed-input-no-automate-vs-hire.md`, status accepted, date 2026-10-03)

6.1 `[CONFIRMED]` Frontmatter `scope` (line 6): "fsi-app/src/components/operations, fsi-app/src/app/operations, fsi-app/src/lib/operations, fsi-app/src/lib/propagation/methods, fsi-app/scripts/propagation, fsi-app/scripts/producers/regional, fsi-app/supabase/migrations/350_retire_automate_vs_hire_values.sql".

6.2 `[CONFIRMED]` Frontmatter `supersedes` (line 7), verbatim: "docs/specs/04-operations.md section 4, components 6, 7 and 12 (the calculator reading of it) and acceptance criteria 8 and 9; docs/specs/07-page-walkthrough.md Operations items 3 (as a typed scenario) and 4; ADR-024 decision 2's break-even equal-billing consequence for this method (the range-only rule for estimates stays); ADR-042's statement that the typed automate-versus-hire calculator stays; the 2026-09-25 "client override, labelled client-supplied" wording on the carbon-cost card".

6.3 `[CONFIRMED]` The rule (lines 13-21), verbatim: "Operator ruling, 2026-10-03, verbatim, final, reversing the same-day "calculator stays": "I've changed my mind. I don't want to input any outside data to get results from anything in the system, including automate or hire. Also automate and hire seems very non-PC; it would look terrible to say we're going to automate jobs or people are so cheap that we'll just hire them and not pay them enough. It's a bad idea, and we can state the evidence of what wages and stuff cost, but we don't need to blatantly say automate or hire."" and "The rule: no reader-typed input produces a result anywhere in the system, and the surface does not pose "automate or hire". Wage, labour-cost and energy-cost evidence stays, shown as sourced regional figures with no verdict."

6.4 `[CONFIRMED]` "What is removed" (lines 23-38), verbatim list: the Operations calculator (`AutomateVsHireCalculator`, `OperationsCalculatorPageView`, the `/operations/calculator` route, the one link to it on the Operations list, and its command-bar parts entry); the calculator library `src/lib/operations/automate-vs-hire.mjs` and its test (`UNCERTAINTY_PCT` moved to `src/lib/figures/uncertainty.mjs`, consumer: the carbon cost per FEU card; the hourly-wage-unit predicate deleted); the propagation method `automate_vs_hire` (`methods/automate-vs-hire.ts`, its test and registration), the `automate_vs_hire` seed path in `scripts/propagation/seed-derived-values.mjs` (and the region entity mint only it used), the region-grain edge authorship in `run-envelope-producer.mjs`, the state-grain authorship in `state-cost-facts-producer.mjs`, and the region step in `backfill-derivation-edges.mjs`; the rendering-audit mount and spec for the calculator page and the calculator link row; the live `derived_values` rows with method `automate_vs_hire` and the edges into them (migration 350, applied by the coordinator after merge); `propagation_events` is left untouched.

6.5 `[CONFIRMED]` "What stays" (lines 40-46), verbatim list: "The labour chain (`labour-chain.ts`, `LabourChain.tsx`), the Operations matrix and ledger wage figures, every `regional_data_facts` producer and row, `NoticesRail`, `RecalculationNotice`, `EstimatedFigure` and the range-only rule for estimates (ADR-024 decision 2), the carbon-intensity method and its seeding, migration 333." Also: workspace assignment, tags and notes stay (ADR-042); Community is social only (ADR-041) and external data only (ADR-042) are unchanged.

6.6 `[CONFIRMED]` "Operations contract after this decision" (lines 48-52): "Structured jurisdictional cost and feasibility evidence (labour, energy, materials, infrastructure) for the reader's own decisions. The phrase "hire-vs-automate" is no longer the surface's purpose anywhere it appeared as such (spec 04, spec 07, the platform-intent and surface-contract skills)."

6.7 `[CONFIRMED]` Consequences (lines 54-67), verbatim: spec 04 section 4, components 6 and 7, and acceptance criterion 8 are retired; criterion 9 and component 12 stay only as ADR-042 left them; ADR-024 decision 2 stands for estimates ("a range, never a bare point"), its break-even equal-billing clause applied only to the retired method; the "client override, labelled client-supplied" wording is superseded; "`estimated_values` has no registered writer after this change. It is not dropped here; a table with no writer is a separate census question for the fitness gate and the coordinator."; spec 01 components 9 and 10 are not retired by this ADR.

6.8 `[CONFIRMED]` "Design changes owed" (lines 69-72): "Artboard 08 (Operations list) never drew the calculator link (it was logged as a deviation), so removing it needs no artboard change. Claude Design owes nothing for this ruling."

6.9 `[CONFIRMED]` Not stated by ADR-043 anywhere in its text: any replacement for the calculator, any statement class, or any new surface block. The ADR names no successor.

6.10 `[CONFIRMED]` Related rulings in the repo that bear on any derived Operations figure, by file and location only (not interpreted here): ADR-042 (external data only; frontmatter and "Decision" section), ADR-024 decision 2 (range-only for estimates), ADR-035 (aggregate floor: at least 10 contributing organisations and no contributor above 25%; scope in its frontmatter is Community benchmarks and the population view), CLAUDE.md rule 18 (a figure with a source is published with that source's rating), rule 19 (examples are not scope), rule 20 (artboards govern look; the coordinator and operator govern system).
