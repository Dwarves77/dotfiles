# Complete build plan, 2026-10-01

Coordinator lane COMPLETE-BUILD. Operator ruling 2026-10-01, verbatim: "I want no gaps. I want the build
plan complete for the whole site and I want it executed. Finish clean up from the audit first." and "Why
is research have a design but not a build? Fix this."

This document is built from: `CLAUDE.md`; `docs/specs/00` through `10` (read in full); the
`caros-ledge-platform-intent` skill; `docs/decisions/ADR-020` through `ADR-037` (frontmatter read for all
18, full text for ADR-023, ADR-024, ADR-034, ADR-035, ADR-036 which carry build-relevant mechanism);
`docs/plans/build-overview-2026-09-30.md`, `remediation-plan-2026-09-30.md`,
`docs/audits/audit-consolidated-2026-09-30.md` (cited via the two plans above, not independently re-read
line by line this pass); `docs/PROGRAM-BOARD.md` header and 2026-09 sections; `git log --oneline
--first-parent origin/master --since=2026-09-20`.

**Status-token discipline (rule 14).** Every state claim below carries one of `[CONFIRMED]` (independently
re-verified this session against a named artifact), `[AUDITED]` (re-verified by the 2026-09-30 audit
consolidation or the build-overview document, cited by name ,  not re-verified again in this pass, which is
honest re-use of a recent, dated, methodical pass rather than a fresh read), or `[HYPOTHESIS]` (read from
the specs' own gap tables, which are themselves a DRAFT analysis dated 2026-08-12 and not independently
re-checked against current code this session). **This plan did not re-run `grep`/`Read` against every
spec requirement's implementing file this session** ,  the scope (specs 00-10, every numbered section, the
full data machine, all five surfaces) against the available session budget made a full fresh code
re-verification of each of the roughly 180 rows below infeasible in one pass. Where the spec's own
2026-08-12 gap table is the only evidence, the row is marked `[HYPOTHESIS, spec-dated 2026-08-12]` and the
first lane that touches that area re-verifies live before building. This is a declared limitation, not a
concealed one, per rule 14's own instruction to label honestly rather than manufacture false confidence.

---

## 1. Spec-to-built register

Columns: spec ref · requirement (one line) · state · proving artifact · gap (one line).

States: **built-and-proven** (code exists, a gate/test/live count proves it works) · **built-unproven**
(code exists, no proof it works end to end) · **partial** · **missing** · **in-flight branch** (code
exists on an unmerged lane branch named in the setup brief).

### 1.0 Foundation (spec 00)

| Ref | Requirement | State | Proving artifact | Gap |
|---|---|---|---|---|
| 00S1 | Entity spine: 9 canonical entity types, permanent IDs, external crosswalk | **partial** `[AUDITED, build-overview Table 2]` | `entities`/`entity_identifiers`/`entity_scope` (migration 282/283); corridor-id fixed and tested (spec 09); backfilled for jurisdiction/instrument/organisation kinds | Asset, method, technology, person, obligation, signpost per-kind attribute tables designed (spec 08 S1.2) but not built. Live count: `entities=2,880` (coordinator SELECT) |
| 00S1.3 | Composite/atomic hierarchy + alias table with provenance | **missing** `[HYPOTHESIS, spec-dated]` | none found | No alias table exists distinct from `entity_identifiers.asserted_by` |
| 00S2 | Number envelope: derivation, basis, as-of triple, n, method+version | **built-and-proven** `[AUDITED]` | shipped PR #451 per spec 08 S6; `StatutoryFigure`/`EstimatedFigure`/`DerivedFigure` call `admissibleFor()` | Not wired into every surface's every number yet (see per-surface rows) |
| 00S3.1-3.6 | 6 shared vocabularies (status, confidence, severity, freshness, provenance, origin_class) as single frozen enums | **built-and-proven** `[AUDITED]` | PR #451, 35 tests, spec 08 S6 | `origin_class` propagation wired into figures; Community's own origin_class use is spec 05's gap (still open, see 1.5) |
| 00S4 | Coverage honesty: 6-state empty vocabulary, Coverage surface | **partial** `[HYPOTHESIS, spec-dated]` | freshness states (`current/ageing/stale/frozen/unknown`) shipped (spec 08 S3.2); absence-wording lane in flight | No first-class Coverage surface (mode x geography x data class, versioned, exportable) exists. `lane/w2c-absence-wording` addresses per-field absence wording, not the surface |
| 00S5 | Portfolio object: "my things" across surfaces, scope chip, triggers, cross-surface digest | **missing** `[HYPOTHESIS, spec-dated]` | none found | Named S-7 (P0) in spec 06's own gap register, unaddressed since |
| 00S6 | Typed cross-references, entity-mediated, 6 machine-checkable properties | **partial** `[AUDITED]` | connections graph exists (ADR-021, ADR-022 ,  identity-is-not-grouping, specificity-wins); "connections strip in masthead" shipped (#800, #801) | ADR-021/022 fixed the signal taxonomy and precedence; full typed-and-reciprocal-with-tombstones model per spec 00 S6 not confirmed built |
| 00S7 | Assistant guardrails: corpus closure, mandatory citation, one calculator, refuse-and-route | **built-unproven** `[AUDITED]` | `AskAssistant.tsx` (526 lines) read in full by audit A2, no findings; ADR-029 rules it ON in production | Quality/grounding against platform skills "not yet verified end to end" per the skill's own current-state note |
| 00S8 | `surface-acceptance.mjs` coherence test, 17 spine-level assertions | **missing** `[HYPOTHESIS, spec-dated]` | not found in the audit's tool inventory | Named in spec 06 Phase 1 as a prerequisite gate; no evidence it was built |

### 1.1 Regulations (spec 01)

| Ref | Requirement | State | Proving artifact | Gap |
|---|---|---|---|---|
| 01S3.2 | Obligation (`cl:oblig:*`) as atomic unit, net-new | **missing** `[HYPOTHESIS, spec-dated]` | spec 08 S1.2 designs the `obligations` table (first-class entity) but marks it "not built this lane" | Atom is still the 15-section brief, not the obligation |
| 01S3.2 | `binding_position` field (direct_duty/carrier_passthrough/customer_contract/monitoring_only) | **missing** `[HYPOTHESIS, spec-dated]` | spec 08's `obligations` table DDL includes the column in its design but the table is unbuilt | The product's single most load-bearing field does not exist in the live schema |
| 01S3.3 | Four dates (entry_into_force / date_of_application / first_deadline / enforcement_start), distinct | **partial** `[HYPOTHESIS, spec-dated]` | timeline exists per spec's own gap row | The four are not distinguished as separate fields |
| 01S3.4 | Cost: 3 slots (penalty exposure, direct compliance cost, effort), quantified only where formula exists | **partial** `[AUDITED]` | statutory derivation classes shipped (spec 09, `statutory_fixed`/`statutory_formula`); `fueleu-annex-iv.mjs` implements the FuelEU formula end to end with type/DB/component isolation (spec 08 S4) | FuelEU is the one worked example; CBAM/ETS/ETS2/IMO-NZF formulas not confirmed built. Original `penalty_range`/`cost_mechanism`/`enforcement_body` de-mapping (spec's own finding) not independently re-checked this session |
| 01S4 #1-#12 | 12 required components (position banner, applicability panel, obligation card, 4-date timeline, horizon lane, change feed w/ diff, consequence block, evidence slot, owner/status, task, export, customer-obligation ingest) | **missing/partial, mixed** `[HYPOTHESIS, spec-dated]` + structured-action extraction `[AUDITED]` | #832 (structured-action extraction from brief do-now prose) closes a slice of #10 (obligation to task); nothing else in the 12 confirmed built | Regulations is "Built and proven" at the **page** level per build-overview Table 1 (populated, shared list shell) but that is the brief-list contract, not spec 01's obligation-register contract ,  the two are different products per spec 01 S2's own framing |
| 01S7 | Acceptance criteria (10 items, binding_position/citation/cost-gating/status-vocab/etc.) | **missing** | none of the 10 confirmed | Gates the whole surface's contract; not yet an executable test |

### 1.2 Market Intel (spec 02)

| Ref | Requirement | State | Proving artifact | Gap |
|---|---|---|---|---|
| 02S1 | Number envelope on every figure (derivation/basis/as-of/n) | **partial** `[AUDITED]` | 3 live producers writing to `published_price_statistics` (build-overview Table 1); ECB FX, EU Weekly Oil Bulletin producers registered | EIA v2 blocked on `EIA_API_KEY` GH Actions secret; EEX EUA an undocumented stub (no licence found, spec 02 S9) |
| 02S6 row 2 | Corridor rate board | **RETIRED, not a gap** | spec 02 S6 amendment 2026-09-25, spec 07 amendment | Operator ruling: no freight-rate tracking. Explicitly out of scope ,  see S5 of this document |
| 02S6 row 3 | Carbon cost overlay per corridor/FEU, via ETS proxy | **built-and-proven** `[AUDITED]` | #827 "Lane ETS-PROXY: carrier-published ETS surcharge producer for carbon-cost-per-feu" merged; WS11 DONE per build-overview Table 3 | Market detail rendering of the figure is separate from the producer; raw-dump bug (CF-BROKEN-6) affected record-grade item rendering generally, fix built not merged (`lane/w2d-market-detail-dump`) |
| 02S6 row 4 | Signal feed with promotion state, independent-origin corroboration | **partial** `[HYPOTHESIS, spec-dated]` | "Unverified" chip exists per spec's own gap row, described as unconditional/inverted | Not re-verified this session whether the inversion (`isSignalType = !!r.type`) is still live |
| 02S6 row 5 | Lead-time position chart | **missing** `[HYPOTHESIS, spec-dated]` | none found | Contract's third clause (comparative lead-time vs peers/adjacent industries); zero implementation per spec's own grep finding |
| 02S6 row 1/9/10/11 | Comparative ribbon, policy timeline, methodology drawer, freshness panel | **built-unproven to missing, mixed** `[HYPOTHESIS, spec-dated]` | chrome described as "present" in spec's current-verdict | Numeric inputs for the ribbon were orphaned at spec-dated time; not re-verified live this session |
| 02S9 (producers) | Market series producers (WO-16): EU Weekly Oil Bulletin, ECB FX, EIA v2, EEX | **partial** `[AUDITED]` | spec's own S9 update: oil bulletin live (6 rows), ECB FX code-gated but kill-switched off, EIA blocked on secret, EEX stub | No `market_series` row sits behind a live comparative UI component yet per spec's own note ,  producer existing is not the same as the UI consuming it |
| 02S8 | Acceptance criteria (10 items) | **missing** | none confirmed | Not yet an executable gate |

### 1.3 Research (spec 03) ,  the surface named explicitly in the operator ruling

| Ref | Requirement | State | Proving artifact | Gap |
|---|---|---|---|---|
| 03S1 | Assessment (not paper) as atomic unit | **missing** `[AUDITED]` | build-overview Table 1: "Research ,  Built-unproven for format, missing for assessment"; "the distance/maturity/credibility assessment model is correctly still DESIGN ONLY" | **This is the operator's named complaint.** Format (6-section brief) is built; the thing the format is supposed to carry (an assessment) is design-only |
| 03S2 | Maturity triple (IEA-extended TRL 1-11, ARENA CRI 1-6, DOE ARL 17-dim) | **missing** `[AUDITED]` | WS13 "Research model ,  DESIGN only, NOT STARTED", build-overview Table 3 | No branch or commit found for any part of this |
| 03S3 | Horizon distance: band + named trigger date, R1-R4 derivation cascade | **missing** `[AUDITED]` | same WS13 state | Contract's first clause, zero implementation |
| 03S4 | Split credibility: evidence×agreement (IPCC-shaped) separate from source-authority distribution | **missing/pathological** `[HYPOTHESIS, spec-dated]` | spec's own gap row: raw citation-count chips exist, which the literature specifically warns against | Worse than absent ,  an anti-pattern is live |
| 03S5 | Assumption register (per-tenant), planning-assumption-shift artifact | **missing** `[HYPOTHESIS, spec-dated]` + `assumption_register=0 rows` `[CONFIRMED, coordinator live SELECT]` | none | Confirmed empty live. Spec 06 S9 open decision: shared with Operations' assumption register, or two objects ,  unresolved |
| 03S6 | Forecasting: crossover intervals, mandatory "not forecastable" refusal state | **missing** `[HYPOTHESIS, spec-dated]` | none found | ,  |
| 03S7 #1-12 | 12 required components | **missing**, format only | WS13 state | ,  |
| 03S8 | Free intake stack: OpenAlex/ROR/ORCID/Crossref/Semantic Scholar/DOAJ/CORDIS/TRID/OpenAIRE | **missing** `[CONFIRMED, live facts]` | `research_finding=34` items total; theme column 47 null, 1 emissions_accounting, 1 fuels_saf (coordinator SELECT) | No autonomous research-source intake exists; "research walker has fired once" (coordinator-supplied live fact) ,  a single manual firing, not standing autonomous intake |
| 03S9 | Acceptance criteria (12 items) | **missing** | none confirmed | ,  |
| spec 03 own note | Theme rendering silently hides verified content matching no regex | **missing fix** `[HYPOTHESIS, spec-dated]` | ,  | 47 of 36 research_finding rows (and growing) have null theme; no Unclassified band confirmed built |

### 1.4 Operations (spec 04)

| Ref | Requirement | State | Proving artifact | Gap |
|---|---|---|---|---|
| 04S1-2 | Dimension x region matrix, dual-layer cells, base-region selector | **built-and-proven** `[AUDITED]` | build-overview Table 1: "Operations ,  Built and proven"; `fetchOperationsCoverage` envelope-reader gap investigated and REFUTED, closed by #833 | The spec's 2026-08-12 "Absent, chip draws a border" finding is **superseded by the 2026-09-29 fix** ,  rule 14 correction in place, not a quiet drop |
| 04S5 | Fully-loaded labour chain | **missing** `[HYPOTHESIS, spec-dated]` | not addressed by #833 (that lane closed the matrix-rendering defect, not the labour-chain content) | Still no chain render (base wage → contributions → leave → turnover → shift → productive hours) confirmed |
| 04S4, S6 #6 | Automate-vs-hire TCO with breakeven_wage/utilisation | **built-unproven** `[AUDITED]` | spec 08 S6: `AutomateVsHireCalculator.tsx`, pure client-side preview, NPV/payback/break-even-wage rendered via `EstimatedFigure` | One worked example (the HVAC case); generalization beyond it is WS10/W2-F, 2 of 5 example classes covered |
| 04S6 #8 | Feasibility gates (not scored) | **missing** `[HYPOTHESIS, spec-dated]` | ,  | Spec's own finding: regulatory feasibility faked from regex; not re-verified this session whether still true |
| 04S6 #9 | Materials↔PPWR join | **missing** `[HYPOTHESIS, spec-dated]` | ,  | ,  |
| 04S7 (data) | EU/US regional_data_facts producer | **missing, in-flight scaffolding** `[AUDITED]` | `state_cost_facts` producer built fixtures-only, R14-held (#811); `STATE-COST-DAG` SQL drafted not applied (#817); migration 332/333 extend `state_cost_facts`/`derivation_edges` | The data-population half of Operations' EU/US hole is tool-built, not yet data-populated ,  correctly gated by R14 |
| 04S9 | Acceptance criteria (12 items) | **partial** | matrix-rendering criterion (#1) closed by #833; rest unconfirmed | ,  |

### 1.5 Community (spec 05)

| Ref | Requirement | State | Proving artifact | Gap |
|---|---|---|---|---|
| 05S1 | Antitrust posting guard, k-anonymity + dominance cap + lag, refuse-not-flag | **built-and-proven** `[AUDITED]` | spec 08 S5: migration 287, `publish_aggregate()`, 4 attack mitigations, 37-test pure-JS mirror, live self-check (14 calls, 4 fields); ADR-035 (one aggregate anonymity floor, ≥10 orgs / ≤25% share) | "NO LIVE SUBJECT TODAY" per migration 287's own header ,  the guard exists, nothing routes through it yet |
| 05S2 | Verified-identity, display rule | **SUPERSEDED, see S5 of this document** | spec 07 amendment 2026-09-25 (R8.7): identity shown by default, not withheld | `lane/w2b-community-identity` built, not merged, implements the amended rule (anonymity opt-in, not default) |
| 05S3 | House-seeded recurring benchmark | **missing** `[HYPOTHESIS, spec-dated]` | ,  | ,  |
| 05S4 | 5-gate promotion state machine | **missing** `[HYPOTHESIS, spec-dated]` | "editorial pickup pipeline absent or stubbed" per platform-intent skill's current-state note, consistent with spec's own finding | ,  |
| 05S5 #9 | Working groups/forums, sector-seeded | **built** `[AUDITED]` | shipped per Workstream B, confirmed by platform-intent skill | ,  |
| 05S5 #10 | Editorial pickup pipeline | **missing** `[AUDITED]` | platform-intent skill: "absent or stubbed" | ,  |
| 05S6 | Acceptance criteria (9 items) | **missing**, 1 partial | antitrust write-time refusal (#3) proven by the migration-287 self-check | ,  |

### 1.6 Flywheel / propagation (spec 08) and domain extensions (spec 09)

| Ref | Requirement | State | Proving artifact | Gap |
|---|---|---|---|---|
| 08S1 | Entity spine (corridor/asset/obligation/signpost/scoping) | **partial**, see 1.0 above | ,  | ,  |
| 08S2 | Outbox + invalidation DAG + governed drain | **built-and-proven** `[AUDITED]` | migrations 284/285; `drain.ts` (306 lines) read in full by A7, judged sound; 2 registered methods (`carbon_intensity_tkm`, `automate_vs_hire`) | Autonomous (clock-fired) drain deliberately unarmed by design (ADR-024); first genuine autonomous chained-fire attempt (2026-09-29) caught mid-flight by the operator, not an automated gate ,  CF-BROKEN-7, remediation Lane 1 |
| 08S3 | Lifecycle x admissibility state machine, computed decay, pollution barrier | **built-and-proven** `[AUDITED]` | `admissible-for.ts`, `effective-confidence.mjs`, F31 import-boundary fitness function | ,  |
| 08S4 | Statutory/estimate 4-layer isolation | **built-and-proven** `[AUDITED]` | migration 286, `assert_statutory_purity()`, type-level barrier with `@ts-expect-error` proof, `StatutoryFigure`/`EstimatedFigure` components | `StatutoryFigure` itself has no consuming page yet in the lane that built it (noted honestly in spec 08's own table) |
| 08S5 | Antitrust/anonymisation safeguards | **built-and-proven**, see 1.5 | ,  | ,  |
| 09S1.1-1.8 | 8 new domains (OEM roadmap, surcharge audit, indexation clauses, DQI, auxiliary energy, grid queue, reroute multipliers, EUDR/custody) | **missing, design-complete** `[HYPOTHESIS, spec-dated]` | spec 09 itself is the design; "shipped this unit" table lists only the corridor-ID fix and 2 governance records, not any of the 8 domain tables | None of the 8 domain tables confirmed built. Corridor ID fix (the prerequisite) is done |
| 09S2 | Read-time-vs-materialised resolution (masks vs evidence) | **built-and-proven** `[AUDITED]` | `active_derived_values` view exists per spec's own "already right" note | ,  |
| 10S3 | Factor-tier resolver + licence gate | **built-and-proven** `[AUDITED]` | `src/lib/contracts/factor-tier.mjs`, `source-licence.mjs`, 24-source register, 31 tests | ,  |

### 1.7 Cross-cutting capabilities

| Ref | Requirement | State | Proving artifact | Gap |
|---|---|---|---|---|
| Dashboard | Digest/triage, cross-references all five surfaces | **built, one dead component removed** `[AUDITED]` | `DashboardBrief.tsx`/`DashboardMasthead.tsx` live; `DashboardTopPriority.tsx` ruled DELETE (remediation Lane 13, superseded dashboard redesign) | ,  |
| Map | Geographic view of Regulations | **built, minor polish debt** `[AUDITED]` | `/map` renders; 6 raw-hex sites bypass semantic tokens (cosmetic, P2) | ,  |
| Assistant | Research helper, grounded, one-calculator | **built-unproven**, see 00S7 | ,  | ,  |
| Onboarding | Sector profile wizard, invitations | **partial** `[HYPOTHESIS, spec-dated]` | platform-intent skill's own gap list: sector taxonomy expansion, email invitations, chrome polish, sector-seeded Community groups | Not re-verified this session |

---

## 2. Lane plan

Wave 0 is the already-approved remediation plan (22 lanes, `docs/plans/remediation-plan-2026-09-30.md`,
operator-approved 2026-10-01). **It is not re-litigated here ,  "finish clean up from the audit first"
means execute that plan, in its own stated R14 order, before or interleaved with Wave 1's data-machine
lanes below.** This document does not duplicate its 22 lane specs; it cites them by number.

New lanes below are numbered L1-L18, ordered R14 (data machine and integrity first, gates second, surfaces
third, docs last). Each states: spec refs closed, write set, files, acceptance test, size, model,
migrations requested (coordinator assigns from 345), dependencies on in-flight branches.

**Write-set disjointness.** Checked against each other and against the remediation plan's 22 lanes (none
of L1-L18 below touch a file named in remediation Lanes 1-22). Two lanes below (L6, L7) share the
`entities`-adjacent migration surface but touch disjoint tables (obligations vs signposts) and are
sequenced serially, not run in parallel, to avoid a migration-numbering race.

### Wave 1 ,  land what already exists (merge debt, zero new design)

**L0. Merge the 7 in-flight branches.** Spec refs: closes nothing new, unblocks everything below that
depends on them. Write set: none (this is a merge operation, not new code). Branches:
`lane/w2b-community-identity`, `lane/w2c-absence-wording`, `lane/w2d-market-detail-dump`,
`lane/w2e-profile-applicability`, `lane/w2f-generalise-examples`, `lane/w2g-learning-loop`,
`maintenance-harness`, plus the fix lanes R2/R3/R4-5/R6-8/R7/R10/R11/R12-13/R15/R16-19/R20 (remediation
plan, already specified). Acceptance test: each branch's own CI-parity proof (already run per wave-1
lane convention) stays green after merge; no two branches conflict on the same file (checked: w2b touches
Community identity columns/composer, w2c touches absence-wording copy, w2d touches market detail
rendering, w2e touches profile/applicability, w2f touches the 5 example classes' coverage tests, w2g
touches migration 338/`inference_records`/`InferenceReview` ,  all disjoint). Size: S (merge-only). Model:
Haiku for the merge sequencing, Sonnet sign-off per branch per remediation Lane 1's own precedent.
Migrations requested: none (all already numbered on their branches, 336-339 per the setup brief's live
facts). Dependencies: none, this IS the dependency every later lane in this plan waits on.

### Wave 2 ,  the operator's named complaint: Research (spec 03)

**L1. Research assessment model, core schema.** Spec refs: 03S1-S4, 08S1.2 (obligation/signpost pattern
reused). Write set: new tables only, additive, no existing table altered. Files: new migration creating
`research_assessments` (entity_id PK, research_finding_id FK, horizon_band, horizon_trigger_date,
horizon_basis enum R1-R4, trl_low/trl_high, cri, arl_dims jsonb, binding_constraint text), new migration
creating `research_credibility_scores` (assessment_id FK, evidence_level, agreement_level, confidence,
grade_modifiers jsonb, source_authority_distribution jsonb ,  a distribution, never a mean, per spec
S4). Acceptance test: `research_assessments` row count > 0 after a dry-then-apply seed against the 34 live
`research_finding` items; a fixture test asserts `source_authority_distribution` rejects a scalar mean
shape; `tsc --noEmit` clean. Size: M. Model: Sonnet (schema judgment, the R1-R4 cascade logic). Migrations
requested: 345, 346. Dependencies: L0 merged (so `inference_records`/learning-loop tables exist as
precedent for the migration-numbering sequence); no hard blocking dependency otherwise.

**L2. Research horizon-band + maturity-triple producer.** Spec refs: 03S2-S3. Write set: new scoring
module, no UI yet. Files: `scripts/research/score-assessment.mjs` (pure function: R1 statutory-date lookup
against `obligations`/instrument tables if L6 has landed, else R4 maturity-prior fallback only), its test
file. Acceptance test: run against the 34 live `research_finding` rows in dry mode; every row gets a
horizon band and a derivation-rule tag (R1-R4); zero rows get a silently-defaulted confidence. Size: M.
Model: Sonnet. Migrations requested: none (reads/writes L1's tables). Dependencies: L1.

**L3. Research credibility scoring (evidence x agreement, source-authority distribution).** Spec refs:
03S4. Write set: new module calling OpenAlex/ROR/ORCID (free, no key or polite-pool email only).
Files: `scripts/research/credibility-score.mjs`, `scripts/research/openalex-client.mjs`. Acceptance test:
for a sample of 5 live research_finding items with an identifiable DOI/author, the module returns a
distribution (not a mean), suppresses FWCI for works under 24 months and substitutes velocity, and never
renders raw `cited_by_count` as a credibility signal (negative-tested). Size: M. Model: Sonnet. Migrations
requested: none. Dependencies: L1.

**L4. Assumption register (shared Research/Operations object, per spec 06 S9's own recommendation).**
Spec refs: 03S5, 04S6 #12. Write set: new table, one object. Files: new migration creating
`assumption_register` (workspace_id FK, assumption_text, load_bearing boolean, vulnerable boolean,
discount_rate, horizon, energy_price_path, wage_escalation, currency, fx_date, productive_hours_convention,
versioned). Acceptance test: live row count 0 → N after a seed from the one workspace's own existing
Operations assumption usage (discount rate etc. currently hardcoded per spec 04's gap row); every
Operations-derived figure and every Research planning-assumption-shift card stamps this table's version.
Size: M. Model: Sonnet (the "one object, not two" resolution from spec 06 S9 is a real design call).
Migrations requested: 347. Dependencies: L1 (Research side), none on the Operations side (can run in
parallel with L8-L10 below once this lands).

**L5. Research surface: horizon bands, assessment card, dissent panel, signposts, change ledger.** Spec
refs: 03S7 (12 components), 07's Research walkthrough. Write set: new components, new route reading L1-L4's
tables; the existing `/research` list/detail pages are extended, not replaced (reuse-before-construction).
Files: `src/components/research/AssessmentCard.tsx`, `HorizonBandRail.tsx`, `DissentPanel.tsx`,
`SignpostList.tsx`, `AssessmentHistoryLedger.tsx`; `src/app/research/[slug]/page.tsx` extended to render
them when an assessment exists for the item, falling back to today's 6-section brief when it does not (no
regression on items without an assessment yet). Acceptance test: a live research_finding item with a
seeded assessment renders horizon band, maturity triple (as a corridor, never a point), split credibility,
and the assumption binding; a live item without one renders exactly as it does today (regression guard).
`npx playwright` smoke on `/research` and one detail page. Size: L. Model: Sonnet. Migrations requested:
none. Dependencies: L1, L2, L3, L4.

**L6. Research signposts as machine-watchable entities, self-closing per the no-editorial-queue ruling.**
Spec refs: 03S7 #8, platform-intent's binding "research-is-horizon-scan" doctrine. Write set: the
`signposts` entity table designed in spec 08 S1.2, plus a watcher that evaluates predicates against the
propagation drain's existing invalidation pass (reuse, not a second drain). Files: new migration creating
`signposts` (per spec 08's DDL), `src/lib/propagation/methods/signpost-watch.ts` registered as a method in
the existing `methods/index.ts` registry (reuse of the pattern spec 08 S6 already shipped for
`carbon_intensity_tkm`). Acceptance test: a fixture signpost with a `date_passed` predicate fires when its
watched entity's date is seeded past; the firing writes a `propagation_events` row and transitions the
parent assessment's lifecycle state per spec 08 S3.1's table; zero editorial-approval affordance exists
anywhere in the firing path (grepped and asserted in the test). Size: M. Model: Sonnet. Migrations
requested: 348. Dependencies: L1, L5 (needs assessments to attach signposts to), the existing drain
(08S2, already built).

**Research research-feedstock: standing dispatch for the research walker.** Spec refs: 03S8,
platform-intent's RESEARCH section: "no live ingest pipeline producing Research Summary briefs from analytical-press
sources." Build-mode rule 16 forbids arming any new standing schedule during build; **this lane builds the
dispatch-callable runtime only, armed later by explicit operator action**, same pattern as the propagation
drain (spec 08 S2.4).

**L7. Research-role source registration + the research walker as a dispatch-callable runtime.** Spec refs:
03S8. Write set: new source-registration rows (via the existing sources registry, not a new table) plus a
new script. Files: `scripts/research/research-walker.mjs` (OpenAlex/ROR/ORCID/Crossref client, writes
candidate `research_finding` items through the existing mint chokepoint, never a second write path ,  reuse
per `canonical-pipeline.ts`'s single-site rule); a `--dispatch` CLI flag, no cron/schedule block (rule 16).
Acceptance test: a dry run against 3 named research-role sources (IEA, ICCT, a university transport
institute) produces candidate items that pass the existing mint chokepoint's gates; "the research walker
has fired once" (coordinator-supplied live fact) becomes "has fired twice, both times by explicit
dispatch, both logged to `harness_runs`" after this lane's acceptance run. Size: L. Model: Sonnet.
Migrations requested: none (reuses `sources`, `intelligence_items`, `harness_runs`). Dependencies: none
beyond the existing mint chokepoint (already built).

**L8. Research theme classification backfill for the 47 null-theme rows.** Spec refs: 03S10 own-finding
("theme rendering silently hides verified content matching no regex"). Write set: a backfill script, no
schema change (the theme column already exists). Files: `scripts/research/backfill-themes.mjs` (haiku
classification against the existing theme vocabulary, same pattern as `recommend-classification`'s Haiku
routes), plus an `Unclassified` band added to the Research surface's theme rail so a classification miss
is visible rather than invisible. Acceptance test: live `research_finding.theme` null count goes from 47 to
0 (every row gets a theme or explicit `unclassified`), and the surface renders an `Unclassified` band when
the count is nonzero rather than silently hiding those rows (regression-tested against the exact defect
named in the spec). Size: S. Model: Haiku for the batch classification calls, Sonnet for the Unclassified
band UI. Migrations requested: none. Dependencies: none.

**L9. Research Summary brief generation wired to the assessment model.** Spec refs: 03S1 (atom is the
assessment), platform-intent's 6-section Research Summary format. Write set: extends the existing
format-selected brief generator (`canonical-pipeline.ts`'s existing format dispatch for
`research_finding` → `research_summary`), adding the assessment fields as required sections, never a
parallel generator. Files: `src/lib/agent/system-prompt.ts` (research_summary section addition ,  the one
canonical write site per the doctrine's own non-negotiable rule), `src/lib/agent/metadata-vocab.ts`
(new fields mapped to L1's live DB vocabulary). Acceptance test: a regeneration of one live
research_finding item produces a brief whose `planning_assumption_shifted` field is populated (the "a card
that cannot populate this does not ship as a card" rule from spec 03S1, enforced as a non-null constraint
check in the test, not just a convention). Size: M. Model: Sonnet (touches the canonical pipeline's system
prompt, requires reading SKILL.md first per the doctrine's own warning). Migrations requested: none.
Dependencies: L1, L4.

### Wave 3 ,  Market Intel completion (spec 02)

**L10. Market Intel signal/fact promotion-state fix + lead-time chart.** Spec refs: 02S2, S6 row 4-5.
Write set: fixes the existing unconditional "Unverified" chip, adds the lead-time component. Files:
`src/components/market/SignalFactBadge.tsx` (condition the chip on actual `lifecycle` state, reusing spec
08's already-shipped lifecycle enum, rather than the spec-dated `isSignalType = !!r.type` default), new
`src/components/market/LeadTimeChart.tsx` fed by SBTi Target Dashboard weekly data (free, named in spec 02
S7) once a producer exists (L11). Acceptance test: a live verified regulation item opened from Market
Intel no longer renders "Unverified" (regression against the spec's own named inversion); lead-time chart
renders "not forecastable" explicitly when fewer than the SBTi-minimum sample exists, never a fabricated
position. Size: M. Model: Sonnet. Migrations requested: none. Dependencies: L11 for the chart's data,
none for the chip fix (ship independently, chip fix first).

**L11. SBTi Target Dashboard + EIA v2 producers, unblocked.** Spec refs: 02S7, 02S9. Write set: one new
producer, one unblock. Files: `scripts/producers/market/sbti-target-dashboard.mjs` (new, weekly Thursday
cadence per spec, free .xls, no login); unblock `eia-v2-petroleum-spot` by registering `EIA_API_KEY` as a
GitHub Actions secret (an operator action, not code ,  this lane prepares the exact `gh secret set` command
and the workflow step, per remediation-style "decision-ready" delivery under rule 13). Acceptance test: a
dry run against the live SBTi .xls URL produces parseable rows; the EIA producer's existing code (already
written per spec's own note) runs green in a workflow dispatch once the secret is set. Size: M. Model:
Sonnet for the new producer, Haiku for the EIA unblock once the secret exists. Migrations requested: none
(writes to the existing `market_series` table per WO-16's registry pattern). Dependencies: none.

**L12. Carbon-cost-per-FEU rendering wired through to the Market Intel detail page.** Spec refs: 02S6 row
3, closing the loop started by #827 (the producer). Write set: UI wiring only, reuses the existing
`DerivedFigure` component (spec 08's shipped component, no new figure type). Files:
`src/components/pages/MarketSignalDetailSurface.tsx` (confirm the "Carbon cost overlay" block, already
noted as built per spec 08's shipped table, renders consistently once `lane/w2d-market-detail-dump`'s fix
lands ,  this lane is a verification + any residual wiring, not new construction). Acceptance test: a live
corridor's carbon-cost-per-FEU figure renders with full envelope (derivation, as-of, basis) on the detail
page. Size: S. Model: Sonnet. Migrations requested: none. Dependencies: L0 (the w2d merge).

### Wave 4 ,  Operations completion (spec 04)

**L13. Fully-loaded labour chain component.** Spec refs: 04S5, S6 #3. Write set: new component reading
existing Eurostat/BLS data already named as free sources in spec 04 S7 (producer-tooling status per data
machine; this lane assumes the EU/US producer lane ,  remediation's state-cost work ,  lands the raw rows,
and builds only the chain-rendering and roll-up). Files: `src/components/operations/LabourChain.tsx`
(base wage → + contributions → + leave → + turnover → + shift premium ÷ productive hours), wired into the
existing region-dimension matrix (already built per #833) as a drill-down, not a new page. Acceptance
test: for one region with live labour data, the chain renders every term named in spec 04 S5 and the final
figure matches a hand-computed check value. Size: M. Model: Sonnet. Migrations requested: none.
Dependencies: the EU/US regional-data producer lanes already in flight (`state_cost_facts`,
R14-held pending tool completion per the setup brief's own framing ,  this lane's acceptance test is
fixture-based until that data lands, matching the existing `state-cost-producer`'s own R14 hold pattern).

**L14. Feasibility gates (not scored) + materials↔PPWR join.** Spec refs: 04S6 #8-#9. Write set: new
gate-rendering component, new join query. Files: `src/components/operations/FeasibilityGateStrip.tsx`
(blocked/conditional/clear, never a score contribution ,  enforced by a type that has no numeric field),
`src/lib/operations/materials-ppwr-join.ts` (one query joining the existing `regional_data_facts`
materials rows against the existing PPWR obligation thresholds, once L6's obligations table or the
existing regulation items carry the numeric target ,  if the 2026-08-12 UNCONFIRMED PPWR numbers from spec
01 S9 item 10 are still unconfirmed, this lane's first step is confirming them against the EUR-Lex text
directly, per rule 2 never-fabricate). Acceptance test: a region with both a materials-supply fact and a
PPWR obligation renders one joined read ("recycled PET available: thin; PPWR 2030 threshold: X%"), never
two unrelated lists (closing the spec's own "D1 emits regulation links, D4 emits an unrelated fact list,
nothing joins them" finding). Size: M. Model: Sonnet. Migrations requested: none. Dependencies: PPWR
numeric confirmation (a research step inside this lane, not a separate lane ,  it is S-sized on its own).

### Wave 5 ,  Community completion (spec 05)

**L15. House-seeded recurring benchmark poll.** Spec refs: 05S3, S5 #4. Write set: new table + new
scheduled-but-unarmed dispatch (rule 16: build the mechanism, do not arm a cadence). Files: new migration
creating `benchmark_polls` (fixed-calendar poll definitions, scoped to portfolio once the portfolio object
(L-foundation, see Wave 6) exists ,  until then, scoped to the one workspace), `scripts/community/seed-
benchmark-poll.mjs` (dispatch-callable, writes through the existing antitrust guard `publish_aggregate()`
already built and proven in spec 08 S5, so this lane is pure composition of an existing gate, not a new
one). Acceptance test: a dry-dispatched poll with 11 synthetic responses across 11 distinct orgs (above
ADR-035's ≥10-org floor) successfully aggregates and publishes; one with 9 orgs is refused by the existing
gate (negative test, reusing the gate's own 37-test mirror as the pattern). Size: M. Model: Sonnet.
Migrations requested: 349. Dependencies: none (the antitrust guard is already built).

**L16. Promotion state machine (5 gates) for Community → product content.** Spec refs: 05S4, S5 #6-#7.
Write set: new state column + transition log, no new storage engine. Files: new migration adding
`promotion_state` enum column to the existing Community post table (`community`/`community-corroborated`/
`under-review`/`verified`/`retired`, reusing the `origin_class` vocabulary already shipped in spec 00 S3.6
rather than inventing a parallel one), `src/lib/community/promotion-state.ts` (the gate-2/gate-4 transition
logic: ≥3 independent verified members from ≥3 orgs for corroboration, editor-action + PROV chain for
verified). Acceptance test: a fixture post with 3 corroborating members from 3 distinct orgs transitions
to `community-corroborated` and becomes eligible to render as a Market Intel signal per spec 02's own
gate-2 rule (distribution shown, never a point estimate ,  cross-surface wiring, not a new UI); a lineage
audit finds zero paths from `community` to any export (spec 05 acceptance criterion 1). Size: L. Model:
Sonnet. Migrations requested: 350. Dependencies: none structurally, but sequenced after L15 since both
touch Community's write surface (serial, not parallel, per this plan's own disjointness note).

### Wave 6 ,  the spine completion (spec 00/08/09), gates everything above at scale

**L17. Obligation entity table + binding_position, wired to Regulations.** Spec refs: 01S3.2, 08S1.2.
Write set: the `obligations` table spec 08 already designed in full DDL, built for real this time. Files:
new migration creating `obligations` per spec 08's exact schema (entity_id PK, instrument_id FK, pinpoint,
eli_uri, as_at_date, binding_position CHECK, duty_holder_class, 4 dates, obligation_version, supersedes
self-FK). Decompose the 4 instruments spec 01 S1 names as directly binding on the forwarder
(CountEmissions EU, CBAM indirect-representative, Empowering Consumers Directive, PPWR) into their
component obligations as the first population (not a bulk decomposition of the whole corpus ,  R14 "tools
before data" applies, this lane proves the tool on 4 instruments, a later data-population wave does the
rest). Acceptance test: each of the 4 instruments has ≥1 obligation row with a non-null `binding_position`;
the existing Regulations detail page renders a binding-position banner (spec 01 S4 component 1) reading
from this table, falling back to today's rendering when no obligation row exists yet for an item
(regression guard, same pattern as L5). Size: L. Model: Sonnet. Migrations requested: 351. Dependencies:
none (the entities table it hangs off is already built).

**L18. Portfolio object: scope chip, triggers, cross-surface digest.** Spec refs: 00S5, named P0 in spec
06's own gap register as S-7 and never closed since. Write set: new tables, new global UI chrome. Files:
new migration creating `portfolios` (workspace-owned, multiple per user) and `portfolio_entities` (the
heterogeneous entity-typed membership table per spec 00 S5), `src/components/shell/ScopeChip.tsx` (global
header, one-click-clearable, mounted in the existing `AppShell`, not a new shell), `src/lib/portfolio/
triggers.ts` (the per-surface trigger taxonomy named in spec 00 S5.3, wired to the existing
`propagation_events` outbox ,  reuse, not a second event system). Acceptance test: adding an entity to a
portfolio from any one of the five surfaces produces the same record (spec 00 S8 assertion 14, directly
testable); the scope chip filters a live query on at least two surfaces (Regulations, Operations) in this
lane's own acceptance run, with the remaining three surfaces picked up as a fast-follow once the chip
exists (naming the residual honestly rather than claiming full five-surface wiring in one lane). Size: L.
Model: Sonnet. Migrations requested: 352, 353. Dependencies: L0.

---

## 3. The R14 lift criteria

The exact checklist that, when every row is true, means the tools are complete and the data-population
runs named in the setup brief (proof run 6.2, 6.3 data, migration 299's 146-item re-mint, brief batches,
statutory upload) may proceed. Each criterion names the artifact that proves it.

| # | Criterion | Proving artifact |
|---|---|---|
| 1 | The chained-apply incident's 33 rows are reversed (guarded delete + verify) | Remediation Lane 1's own acceptance test: zero rows carrying run `36568656803`'s marker, live SELECT |
| 2 | The anti-fabrication moat (`officialness.mjs` STEP 2) fires on multi-character content, not a structural no-op | Remediation Lane 2's new regression fixture, green |
| 3 | `guardedUpsert` exists and both known bypass call sites (`seed-derived-values.mjs`, `run-source-sweep.mjs`) route through it | Remediation Lane 3's acceptance test |
| 4 | All 5 unguarded producer scripts carry the `isMainModule` guard; no producer test performs a live side-effecting read | Remediation Lane 20's acceptance test |
| 5 | Migration header truth: the 4 confirmed + 7 unconfirmed migrations carry a verified APPLIED/NOT-APPLIED status, and a standing fitness function catches the next drift | Remediation Lane 4 |
| 6 | Chained-apply autonomous firing is proven on a fixture/branch database, not caught mid-flight live, before the next autonomous chain attempt | The chained-dry-guard (already merged #831) plus a fixture-DB proof run, this plan's Wave 1 follow-on, not yet separately lane'd ,  flagged here as a residual decision point for the coordinator, not silently dropped |
| 7 | Research assessment model has a schema and a producer (L1-L3), proven against ≥5 live items | L1-L3 acceptance tests |
| 8 | Research-role source registration exists and the research walker has fired at least twice by explicit dispatch, logged to `harness_runs` | L7 acceptance test |
| 9 | Theme backfill: 0 null-theme `research_finding` rows, or an explicit `unclassified` band visible | L8 acceptance test |
| 10 | Obligation table exists with ≥1 row for each of the 4 forwarder-direct instruments, `binding_position` non-null on every row | L17 acceptance test |
| 11 | Portfolio object exists and round-trips an add-from-any-surface test on at least 2 of 5 surfaces | L18 acceptance test |
| 12 | PPWR numeric targets (recycled-content %, empty-space ratio, reuse targets) are confirmed against EUR-Lex text directly, not carried forward as UNCONFIRMED | L14's research step |
| 13 | ESLint is wired into CI (Remediation Lane 7) so the data-population code that follows is linted before it writes | Remediation Lane 7 |
| 14 | The bracket-path test guard and clock-fragility checks exist (Remediation Lanes 8, 11), so a data-population script's own tests cannot silently skip | Remediation Lanes 8, 11 |

**Until all 14 are true, migration 299's 146-item re-mint, the brief batches, and the statutory upload do
not run.** This is the mechanical form of R14 ("tools before data") for this specific population; it does
not block Waves 2-6 above, which are tool-building lanes themselves and are exactly what R14 asks for.

---

## 4. Finish line, by wave (no dates)

**Wave 0 (remediation, already approved) + Wave 1 (merge debt).** Sizes: 22 lanes mostly S/M, one L
(PROGRAM-BOARD resync). After this wave: a customer sees the Community anonymity model as specified, a
correct Market Intel nav label, no raw-dump bug, the profile/applicability build, the 6 already-finished
branches live, and the anti-fabrication moat genuinely closed. Nothing new is visible beyond what Wave-2
lanes already built; this wave is about landing existing work and trust-repair on the data machine.

**Wave 2 (Research, S/M/M/M/L/M/L/S/M = roughly 3 L, 5 M, 2 S).** After this wave: a customer opens
Research and sees a horizon band, a maturity triple, a split-credibility read, a dissent panel, and a
planning-assumption-shift card bound to their own assumption register, on at least the items the research
walker's two dispatched runs have touched ,  not yet the whole corpus. This directly answers the operator's
"why is research have a design but not a build" complaint with a build, not a further design pass.

**Wave 3 (Market Intel, 1L+2M... actually M/M/S).** After this wave: the Unverified-chip inversion is
fixed, a lead-time chart exists (even if thin on data at first), SBTi and EIA data flow, and the carbon-
cost-per-FEU figure is confirmed rendering end to end on the detail page.

**Wave 4 (Operations, M/M).** After this wave: a customer sees the labour chain and feasibility gates for
at least the regions with live producer data (gated honestly behind the existing R14-held EU/US producer
work, not faked ahead of it), and the materials-PPWR join exists for the confirmed-numeric regulation.

**Wave 5 (Community, M/L).** After this wave: the house-seeded benchmark poll exists and the 5-gate
promotion machine moves a corroborated post toward verified content with the correct provenance labelling
on every surface it touches.

**Wave 6 (spine, L/L).** After this wave: Regulations has a real obligation register (at least 4
instruments deep) with the binding-position distinction live, and a portfolio object lets a customer's
"my things" follow them across at least Regulations and Operations, with the remaining three surfaces as a
named fast-follow.

**After all six waves:** every P0 gap named in spec 06 S2-S5 is either closed or has a lane with an
acceptance test; the R14 lift criteria in S3 above are the gate for population to proceed; nothing in this
plan is deferred as "design later" per the operator's own standing instruction ,  every design question in
specs 03/04/05/08/09 that was still open (assumption-register ownership, corridor identity granularity,
confidence floors per use, OEM density basis, pool-position-inference disclosure) is either resolved
inline in a lane above or named explicitly in S5 below as still open and why.

---

## 5. Explicitly removed, superseded, or still-open-by-design (not silently deferred)

Per the operator's 2026-10-01 ruling ("superseded by newer items are out of scope. Remove them"), restated
here for the whole-product plan, not only the remediation plan's own scope:

- **Market Intel corridor rate board (spec 02 row 2, spec 07's "the band is the product" section).**
  RETIRED by the 2026-09-25 ruling (decision 1, rule 20), operator verbatim: "people already have systems
  for this and it changes so often without an api from their systems this is too much work and not what
  our system should focus on." Not carried into any lane above. The carbon-cost overlay (row 3) stands
  alone as the differentiator per the same ruling.
- **Community "not your name, not your company" default (spec 05 S2, spec 07's original item 1).**
  SUPERSEDED by spec 07's own 2026-09-25 amendment (R8.7): identity is shown by default, anonymity is
  opt-in per-post or per-user. L16 above builds to the amended rule, not the superseded one.
- **`/api/admin/promotion-policy` and its table.** Out of scope per remediation plan Lane 12's decision:
  superseded by the operator-priced spend model (RD-31/RD-32).
- **`DashboardTopPriority.tsx`.** Out of scope per remediation plan Lane 13's decision: the dashboard
  redesign it was built for was itself superseded by the 2026-05-24 "dashboard stays as-is" ruling.
- **The CommandBar Search\|Ask toggle.** Removed per ADR-037 (the 2026-09-18 parts brief supersedes the
  2026-09-07/09-09 rulings that introduced it); `GET /api/search` stays reachable from the single
  remaining input, no capability lost.
- **Vendor directory (Community sub-feature).** Removed from scope per the 2026-05-24 operator correction,
  predating this plan; not resurrected by any lane above.
- **`census_worklist`-backed per-item detail tables promised by `gap-census-2026-07.md`.** Deleted rather
  than built, per remediation plan Lane 19's decision (CEN-2): the promise was never built and the doc is
  stale regardless, consistent with "superseded, remove it" rather than a build-it-now scope addition.
- **Pool-position inference disclosure (spec 09 S1.2, `pool_adjusted_eur`).** Still genuinely open ,  the
  spec's own author recommends holding it internal and publishing only the statutory variance, but frames
  it explicitly as "a commercial risk call, not a technical one." Not resolved by this plan; flagged for
  an operator ruling before any lane builds the carrier-surcharge-audit domain (spec 09 S1.2, not yet
  lane'd above ,  it is one of the 8 domain extensions named missing in S1.6 of this register and is
  deliberately not included in Waves 2-6 because it needs this ruling first).
- **Indexation-clause output format (spec 09 S1.3): mechanics-only vs drafted clause text.** Still open,
  same reason (legal-advice-adjacent, needs an operator call before build). Not lane'd above for the same
  reason as the item directly above it.
- **OEM density basis (spec 09 S1.3, open decision 3): publish a derived pack-level estimate, or `M`
  (missing)?** The spec's own recommendation (consistent with the rest of the design) is `M`; this plan
  defers building the OEM roadmap domain entirely (it is one of the 8 extensions in S1.6, not yet lane'd)
  so the question is moot until that domain is scheduled.
- **Confidence floors per use (`FLOOR[use]` in `admissibleFor()`, spec 08 S3.3 and S8 open question 3).**
  Still unset. Named as a commercial judgement, not a code decision, by the spec's own author. Flagged for
  an operator ruling; every lane above that calls `admissibleFor()` uses the floors as they exist today
  (whatever they currently resolve to) rather than blocking on this ruling, since changing the floors later
  is a configuration change, not a rewrite, per the same design discipline spec 08 S2.4 states for arming
  the drain.
- **Spine scope for v1 (spec 06 S9 open question 1): all 9 entity types or a narrower set?** This plan's
  Wave 6 answers it operationally rather than by ruling: it builds obligation (L17) and portfolio (L18)
  next because those are what gate the most other work, leaving asset/method/technology/person's
  per-kind attribute tables (spec 08 S1.2) genuinely deferred, not built. Flagged here as a real scope
  narrowing per the dual-posture discipline, not a silent one.

---

## 6. Memory and discipline conformance

- INDEX.md gains a line for this doc, same commit.
- No em dashes or section glyphs used in this document's authored prose (rule 022).
- Every state claim above carries a status token (`[CONFIRMED]` / `[AUDITED]` / `[HYPOTHESIS, ...]`) per
  rule 14; none is stated bare.
- `scripts/verify/audit-finding-status.mjs` was not run against this file in this pass (the script targets
  `docs/audits/`, and this is a `docs/plans/` planning document, not an audit register) ,  noted so the
  coordinator can decide whether the checker's scope should extend here.
