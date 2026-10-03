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
consolidation or the build-overview document, cited by name, a recent and dated methodical pass), or
`[HYPOTHESIS, spec-dated]` (read from the specs' own 2026-08-12 gap tables). Every row marked
`[HYPOTHESIS, spec-dated]` is re-verified live by its own lane's first acceptance step before that lane
builds anything on top of it; each lane's acceptance test in section 2 states this explicitly as its own
first step where the row it closes carries that token. No row below is treated as final until its lane
has run that step.

**Coordinator rulings folded in, 2026-10-01 (same day, under the operator's delegation).** Five design
questions this plan had carried as "still open" are now closed by `docs/decisions/ADR-039-complete-build-
rulings-2026-10-01.md` (pool-position inference, indexation-clause output format, OEM density basis,
confidence floors, spine scope for v1). Every spec 09 domain extension gets a lane (Wave 7, L21-L28).
Lanes L1, L2 and L4 are deduplicated against the in-flight `lane/w2r-research-assessment` and
`lane/w2r2-assumption-register` branches, which are already building this scope; L3 and L5 are narrowed
accordingly. Lane L18 wires the portfolio scope chip on all five surfaces in its own acceptance test. R14
lift criterion 6 (the fixture-database proof of the autonomous chain) is lane L20.

---

## 1. Spec-to-built register

Columns: spec ref · requirement (one line) · state · proving artifact · gap (one line).

States: **built-and-proven** (code exists, a gate/test/live count proves it works) · **built-unproven**
(code exists, no proof it works end to end) · **partial** · **missing** · **in-flight branch** (code
exists on an unmerged lane branch named in the setup brief).

### 1.0 Foundation (spec 00)

| Ref | Requirement | State | Proving artifact | Gap |
|---|---|---|---|---|
| 00S1 | Entity spine: 9 canonical entity types, permanent IDs, external crosswalk | **partial, in-flight branch** `[AUDITED, build-overview Table 2]` | `entities`/`entity_identifiers`/`entity_scope` (migration 282/283); corridor-id fixed and tested (spec 09); backfilled for jurisdiction/instrument/organisation kinds | Per ADR-039(e), all nine kinds are in scope for v1. Obligation and signpost attribute tables are lanes L17/L6; asset/method/technology/person are lane L19. Live count: `entities=2,880` (coordinator SELECT) |
| 00S1.3 | Composite/atomic hierarchy + alias table with provenance | **missing** `[HYPOTHESIS, spec-dated]` | none found | No alias table exists distinct from `entity_identifiers.asserted_by` |
| 00S2 | Number envelope: derivation, basis, as-of triple, n, method+version | **built-and-proven** `[AUDITED]` | shipped PR #451 per spec 08 S6; `StatutoryFigure`/`EstimatedFigure`/`DerivedFigure` call `admissibleFor()` | Not wired into every surface's every number yet (see per-surface rows) |
| 00S3.1-3.6 | 6 shared vocabularies (status, confidence, severity, freshness, provenance, origin_class) as single frozen enums | **built-and-proven** `[AUDITED]` | PR #451, 35 tests, spec 08 S6 | `origin_class` propagation wired into figures; Community's own origin_class use is spec 05's gap (still open, see 1.5) |
| 00S4 | Coverage honesty: 6-state empty vocabulary, Coverage surface | **partial** `[HYPOTHESIS, spec-dated]` | freshness states (`current/ageing/stale/frozen/unknown`) shipped (spec 08 S3.2); absence-wording lane in flight | No first-class Coverage surface (mode x geography x data class, versioned, exportable) exists. `lane/w2c-absence-wording` addresses per-field absence wording, not the surface |
| 00S5 | Portfolio object: "my things" across surfaces, scope chip, triggers, cross-surface digest | **missing, laned** `[HYPOTHESIS, spec-dated]` | none found | Named S-7 (P0) in spec 06's own gap register. Lane L18 builds it and wires the scope chip on all five surfaces (not a partial-surface build) |
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
| 03S1 | Assessment (not paper) as atomic unit | **in-flight branch** `[CONFIRMED, branch exists: lane/w2r-research-assessment]` | build-overview Table 1 (dated before this branch opened): "Research ,  Built-unproven for format, missing for assessment" | **This is the operator's named complaint, now a build in flight.** `lane/w2r-research-assessment` builds the `research_assessments` table, the deterministic producer, the ledger/detail rendering, the harness family and dispatch workflow, and ADR-038. This plan's lanes L1/L2/L4/part of L5 do not duplicate it (see section 2) |
| 03S2 | Maturity triple (IEA-extended TRL 1-11, ARENA CRI 1-6, DOE ARL 17-dim) | **in-flight branch** `[CONFIRMED, branch exists]` | `lane/w2r-research-assessment` builds the TRL/CRI corridors as columns on `research_assessments` | DOE ARL's 17-dimension vector: confirm scope against the branch's own schema when it lands, not re-specified here |
| 03S3 | Horizon distance: band + named trigger date, R1-R4 derivation cascade | **in-flight branch** `[CONFIRMED, branch exists]` | `lane/w2r-research-assessment` builds the deterministic producer with the R1-R4 horizon ladder | Contract's first clause; was zero implementation, now building |
| 03S4 | Split credibility: evidence×agreement (IPCC-shaped) separate from source-authority distribution | **in-flight branch, partial** `[CONFIRMED, branch exists]` + narrowed scope here | `lane/w2r-research-assessment` builds both credibility scores as columns on the one `research_assessments` table (not a second table); this plan's lane L3 narrows to the OpenAlex/ROR/ORCID authority-client piece feeding the authority-score column | Was a live anti-pattern (raw citation-count chips); the branch replaces it |
| 03S5 | Assumption register (per-tenant), planning-assumption-shift artifact | **in-flight branch** `[CONFIRMED, branch exists: lane/w2r2-assumption-register]` + `assumption_register=0 rows` `[CONFIRMED, coordinator live SELECT]` | `lane/w2r2-assumption-register` builds the table, contract, API, settings editor and reader | Confirmed empty live as of this plan's drafting; the branch closes spec 06 S9's shared-object question (one table, Research and Operations both read it). This plan's lane L4 does not duplicate the table; migration 345 is reserved on that branch only if RLS is needed |
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
| 05S4 | 5-gate promotion state machine | **Superseded by ADR-041** (Community is social only) | the promotion path was removed, not built | ,  |
| 05S5 #9 | Working groups/forums, sector-seeded | **built** `[AUDITED]` | shipped per Workstream B, confirmed by platform-intent skill | ,  |
| 05S5 #10 | Editorial pickup pipeline | **Superseded by ADR-041** (Community is social only) | removed, not built | ,  |
| 05S6 | Acceptance criteria (9 items) | **missing**, 1 partial | antitrust write-time refusal (#3) proven by the migration-287 self-check | ,  |

### 1.6 Flywheel / propagation (spec 08) and domain extensions (spec 09)

| Ref | Requirement | State | Proving artifact | Gap |
|---|---|---|---|---|
| 08S1 | Entity spine (corridor/asset/obligation/signpost/scoping) | **partial**, see 1.0 above | ,  | ,  |
| 08S2 | Outbox + invalidation DAG + governed drain | **built-and-proven** `[AUDITED]` | migrations 284/285; `drain.ts` (306 lines) read in full by A7, judged sound; 2 registered methods (`carbon_intensity_tkm`, `automate_vs_hire`) | Autonomous (clock-fired) drain deliberately unarmed by design (ADR-024); first genuine autonomous chained-fire attempt (2026-09-29) caught mid-flight by the operator, not an automated gate ,  CF-BROKEN-7, remediation Lane 1 |
| 08S3 | Lifecycle x admissibility state machine, computed decay, pollution barrier | **built-and-proven** `[AUDITED]` | `admissible-for.ts`, `effective-confidence.mjs`, F31 import-boundary fitness function | ,  |
| 08S4 | Statutory/estimate 4-layer isolation | **built-and-proven** `[AUDITED]` | migration 286, `assert_statutory_purity()`, type-level barrier with `@ts-expect-error` proof, `StatutoryFigure`/`EstimatedFigure` components | `StatutoryFigure` itself has no consuming page yet in the lane that built it (noted honestly in spec 08's own table) |
| 08S5 | Antitrust/anonymisation safeguards | **built-and-proven**, see 1.5 | ,  | ,  |
| 09S1.1-1.8 | 8 new domains (OEM roadmap, surcharge audit, indexation clauses, DQI, auxiliary energy, grid queue, reroute multipliers, EUDR/custody) | **missing, laned** `[HYPOTHESIS, spec-dated]` | spec 09 itself is the design; "shipped this unit" table lists only the corridor-ID fix and 2 governance records, not any of the 8 domain tables | None of the 8 domain tables confirmed built; corridor ID fix (the prerequisite) is done. Every one of the 8 is lane L21-L28 (Wave 7), each with a write set and acceptance test; the two legal/commercial-sensitive ones (surcharge audit, indexation clauses) build to the ADR-039(a)/(b) rulings |
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

New lanes below are numbered L1-L28, ordered R14 (data machine and integrity first, gates second, surfaces
third, docs last). Each states: spec refs closed, write set, files, acceptance test, size, model,
migrations requested, dependencies on in-flight branches.

**Deduplication against in-flight branches (coordinator ruling, 2026-10-01).** `lane/w2r-research-
assessment` (running now) builds the `research_assessments` table as ONE table carrying both credibility
scores as columns (not a second table), migration 344, the deterministic R1-R4 horizon-ladder producer
with TRL/CRI corridors, the rendering on the Research ledger and detail surface, the harness family and
dispatch workflow, and ADR-038. `lane/w2r2-assumption-register` (running now) builds the assumption
register's table, API, settings editor and reader; migration 345 is reserved on that branch only if RLS
turns out to be needed. This plan therefore does NOT duplicate that scope: L1, L2 and L4 below are
pointers to those branches, not new builds; L3 narrows to the OpenAlex/ROR/ORCID authority client that
feeds the assessment's authority-score column; L5 narrows to the dissent panel, the signposts list and
the assessment-history ledger, the three Research components the in-flight branch does not carry.

**Migration numbering.** 344 (`lane/w2r-research-assessment`) and 345 (`lane/w2r2-assumption-register`, if
RLS needs it) are already assigned to those branches; the coordinator applies them. This plan's own new
migrations start at 346 and are listed per lane below; the coordinator assigns and applies each.

**Write-set disjointness.** Checked against each other, against the remediation plan's 22 lanes, and
against the two in-flight branches above (none of L1-L28 below touch a file named in remediation Lanes
1-22 or in `lane/w2r-research-assessment` / `lane/w2r2-assumption-register`). L6 and L17 share the
`entities`-adjacent migration surface but touch disjoint tables (signposts vs obligations) and are
sequenced serially, not run in parallel, to avoid a migration-numbering race. L21-L28 (Wave 7) are
disjoint from each other and from L1-L20 (each touches its own named spec-09 table set).

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

**L1. Research assessment model, core schema. IN FLIGHT, branch named, not duplicated here.** Spec refs:
03S1-S4, 08S1.2. This scope is built on `lane/w2r-research-assessment` (migration 344: one table
`research_assessments` carrying both credibility scores as columns, not a second table). This plan's own
acceptance step is a verification, not a build: once that branch merges, confirm `research_assessments`
row count > 0 against the 34 live `research_finding` items, and confirm a fixture test asserts
`source_authority_distribution` rejects a scalar mean shape (spec 03S4's own requirement). Size: S
(verification only). Model: Sonnet. Migrations requested: none (344 is the branch's own). Dependencies:
`lane/w2r-research-assessment` merged.

**L2. Research horizon-band + maturity-triple producer. IN FLIGHT, branch named, not duplicated here.**
Spec refs: 03S2-S3. Built on `lane/w2r-research-assessment` (the deterministic producer with the R1-R4
horizon ladder and TRL/CRI corridors). This plan's acceptance step: run the merged producer against the
34 live `research_finding` rows in dry mode and confirm every row gets a horizon band and a
derivation-rule tag (R1-R4), zero rows silently defaulted. Size: S (verification only). Model: Sonnet.
Migrations requested: none. Dependencies: L1.

**L3. Research source-authority client (narrowed).** Spec refs: 03S4 (the authority-score half only;
the evidence x agreement half is `lane/w2r-research-assessment`'s own scope). Write set: a new client
module only, feeding a column the in-flight branch's schema already reserves for it. Files:
`scripts/research/openalex-client.mjs`, `scripts/research/authority-score.mjs` (OpenAlex/ROR/ORCID, free,
no key or polite-pool email only; computes the source-authority distribution per spec 03S4's component
table: role class, topic-scoped institutional/author standing, funding independence, reception via FWCI
with the under-24-months velocity substitute, integrity/retraction check). Acceptance test: for a sample
of 5 live research_finding items with an identifiable DOI/author, the module returns a distribution (not
a mean), suppresses FWCI for works under 24 months and substitutes velocity, and never renders raw
`cited_by_count` as a credibility signal (negative-tested); the output writes to the authority-score
column `lane/w2r-research-assessment`'s schema already carries. Size: M. Model: Sonnet. Migrations
requested: none (writes to the in-flight branch's own column). Dependencies: L1 (the branch's schema must
exist).

**L4. Assumption register. IN FLIGHT, branch named, not duplicated here.** Spec refs: 03S5, 04S6 #12.
Built on `lane/w2r2-assumption-register` (table, contract, API, settings editor, reader; migration 345 on
that branch only if RLS is needed). This plan's acceptance step: once merged, confirm live row count goes
from 0 to N after a seed from the one workspace's existing Operations assumption usage, and confirm both
Operations-derived figures and Research planning-assumption-shift cards stamp the table's version. Size:
S (verification only). Model: Sonnet. Migrations requested: none (345 is the branch's own, if used).
Dependencies: `lane/w2r2-assumption-register` merged.

**L5. Research surface: dissent panel, signposts list, assessment history ledger (narrowed).** Spec refs:
03S7 components 6, 8 and 11 (the horizon-band rail, assessment card and credibility rendering are
`lane/w2r-research-assessment`'s own scope and are not duplicated here). Write set: three new components
only. Files: `src/components/research/DissentPanel.tsx`, `SignpostList.tsx`,
`AssessmentHistoryLedger.tsx`; mounted into the detail page the in-flight branch already extends (a
one-line addition per component, not a page rewrite). Acceptance test: a live research_finding item with
a seeded assessment carrying a dissenting source renders the dissent panel uncollapsed (spec 03S7
component 6's own requirement); a seeded signpost renders in the signposts list once L6 exists; the
history ledger renders at least one prior value after one re-score (append-only, visible). `npx
playwright` smoke on one detail page. Size: M. Model: Sonnet. Migrations requested: none. Dependencies:
L1 (the branch's schema), L6 (for the signposts list to have data), L3 (for the dissent panel to have a
real distribution to render dissent from).

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
requested: 346. Dependencies: L1 (needs assessments to attach signposts to), the existing drain
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
Migrations requested: 347. Dependencies: none (the antitrust guard is already built).

**L16. Superseded by ADR-041 (Community is social only); do not build. The text below is retained as history.** Promotion state machine (5 gates) for Community → product content. Spec refs: 05S4, S5 #6-#7.
Write set: new state column + transition log, no new storage engine. Files: new migration adding
`promotion_state` enum column to the existing Community post table (`community`/`community-corroborated`/
`under-review`/`verified`/`retired`, reusing the `origin_class` vocabulary already shipped in spec 00 S3.6
rather than inventing a parallel one), `src/lib/community/promotion-state.ts` (the gate-2/gate-4 transition
logic: ≥3 independent verified members from ≥3 orgs for corroboration, editor-action + PROV chain for
verified). Acceptance test: a fixture post with 3 corroborating members from 3 distinct orgs transitions
to `community-corroborated` and becomes eligible to render as a Market Intel signal per spec 02's own
gate-2 rule (distribution shown, never a point estimate ,  cross-surface wiring, not a new UI); a lineage
audit finds zero paths from `community` to any export (spec 05 acceptance criterion 1). Size: L. Model:
Sonnet. Migrations requested: 348. Dependencies: none structurally, but sequenced after L15 since both
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
(regression guard, same pattern as L5). Size: L. Model: Sonnet. Migrations requested: 349. Dependencies:
none (the entities table it hangs off is already built).

**L18. Portfolio object: scope chip on all five surfaces, triggers, cross-surface digest.** Spec refs:
00S5, named P0 in spec 06's own gap register as S-7 and never closed since. Write set: new tables, new
global UI chrome. Files: new migration creating `portfolios` (workspace-owned, multiple per user) and
`portfolio_entities` (the heterogeneous entity-typed membership table per spec 00 S5),
`src/components/shell/ScopeChip.tsx` (global header, one-click-clearable, mounted in the existing
`AppShell`, not a new shell), `src/lib/portfolio/triggers.ts` (the per-surface trigger taxonomy named in
spec 00 S5.3, wired to the existing `propagation_events` outbox, reuse, not a second event system).
Acceptance test: adding an entity to a portfolio from any one of the five surfaces produces the same
record (spec 00 S8 assertion 14, directly testable); the scope chip filters a live query on **all five**
surfaces (Regulations, Market Intel, Research, Operations, Community) in this lane's own acceptance run,
one assertion per surface, none left for a later pass. Size: L. Model: Sonnet. Migrations requested:
350, 351. Dependencies: L0.

**L19. Remaining per-kind entity attribute tables (asset, method, technology, person).** Spec refs:
00S1.2, 08S1.2, ADR-039(e) (all nine entity kinds in v1). Write set: one new migration adding the four
remaining attribute tables; obligation (L17) and signpost (L6) already cover two of the nine, corridor
and jurisdiction/instrument/organisation are already built. Files: new migration creating `assets`
(entity_id PK, imo_ship_number, mmsi as a mutable attribute never a key, per spec 00S1.2),
`methods` (entity_id PK, method family, version), `technologies` (entity_id PK, pathway: feedstock x
conversion x region, per spec 00's "HVAC is not an entity, HVAC from used cooking oil EU ISCC EU is"
rule), `persons` (entity_id PK, ORCID/ROR crosswalk). Acceptance test: each of the 4 tables exists, FKs to
`entities`, a fixture row inserts cleanly for each kind; a new fitness function confirms every value of
the `entity_kind` enum now has a backing attribute table (asset/method/technology/person/corridor/
obligation/signpost/jurisdiction/organisation, all nine), closing ADR-039(e) completely rather than
partially. Size: L. Model: Sonnet. Migrations requested: 352. Dependencies: L17 (obligation), L6
(signpost), both already two of the nine.

**L20. Autonomous-chain fixture-database proof (R14 lift criterion 6).** Spec refs: none (this closes a
process gap named in the setup brief's R14 lift criteria, not a product spec). Write set: zero writes
against the production database. Files: `scripts/verify/fixture-chain-proof.mjs`. Mechanism: create a
Supabase branch database via the Supabase MCP `create_branch` tool, dispatch the existing chained-apply
workflow (the same one caught mid-flight in production on 2026-09-29, #828/#829/#831) against that
branch only, read back the branch's own `harness_runs` rows to confirm the full autonomous hop sequence
fired end to end, then delete the branch. Acceptance test: the branch's `harness_runs` table shows every
hop in the chain firing in order with no manual intervention between hops; a `gh api`/Supabase-API check
after teardown confirms zero rows were written to the production database by this lane; the proof
artifact (the branch's run log, exported before teardown) is attached to the lane's own report. Size: M.
Model: Sonnet (operates the Supabase MCP branch tools and reads the hop sequence with judgment). Migrations
requested: none (the branch is ephemeral and carries no production migration numbering). Dependencies:
the chained-dry-guard (#831, already merged).

### Wave 7 ,  the spec 09 domain extensions (all 8, none deferred)

Ordered after Wave 6 per the setup brief's instruction that no item in this plan may read "not yet
lane'd" or "deferred." Each of the 8 domains named missing in section 1.6 of the register above gets its
own lane, write set and acceptance test below. Two (L22, L23) build to the ADR-039(a)/(b) rulings.

**L21. OEM equipment roadmap (TRL 7-9 bridge).** Spec refs: 09S1.1. Decision: ADR-039(c) (density basis
recorded explicitly; `M` emitted when only cell-level is disclosed, never a derived pack estimate). Write
set: new migration creating `oem_tech_roadmaps` per spec 09's own DDL. Files: the migration;
`scripts/research/oem-roadmap-intake.mjs` (sources OEM commercial-stage announcements, cites the
announcement per spec 09's "facts about announcements" framing, `derivation='observed'`,
`origin_class` in `community`/`partner` per the spec's own default). Acceptance test: a live row exists
for at least one named manufacturer and `tech_category` with `density_basis` set explicitly; a fixture
with only cell-level density produces `M` (missing) for the derived payload-penalty field, never a
computed pack estimate (negative test, directly proving ADR-039(c)). Size: M. Model: Sonnet. Migrations
requested: 353. Dependencies: none.

**L22. Carrier surcharge audit and FuelEU pooling arbitrage.** Spec refs: 09S1.2. Decision: ADR-039(a)
(`pool_adjusted_eur` held internal, never customer-facing; only the statutory variance publishes). Write
set: new migration creating `carrier_compliance_pools`, `surcharge_audits` per spec 09's DDL. Files: the
migration; `src/lib/market/surcharge-audit.ts` (computes `variance_eur` as a generated column from
`billed_eur` minus `statutory_eur`); a customer-facing component whose prop type has no field for
`pool_adjusted_eur`, enforced by the same type-level-barrier pattern spec 08 section 4 already shipped
for statutory/estimate isolation. Acceptance test: a fixture invoice line produces `billed_eur`,
`statutory_eur` and the generated `variance_eur`; a static/grep check confirms zero customer-facing
component imports or renders `pool_adjusted_eur`; the code carries a comment citing ADR-039(a). Size: L
(the spec's own "sharpest commercial idea," needs care). Model: Sonnet. Migrations requested: 354.
Dependencies: L12 (carbon-cost-per-FEU rendering, so the surcharge-audit figure has a consistent sibling
figure on the same detail page).

**L23. Dynamic carbon contract indexation clauses.** Spec refs: 09S1.3. Decision: ADR-039(b) (mechanics
and arithmetic only, never drafted clause text). Write set: new migration creating `indexation_clauses`
per spec 09's DDL. Files: the migration; `src/lib/market/indexation-clause.ts` (the generator: index,
base value and date, pass-through percentage, cap, floor, review cadence, one worked numeric example).
Acceptance test: the generator's output contains the 6 mechanical fields and a worked example, and a
negative test confirms the output contains no contract-prose template strings (directly proving
ADR-039(b)); the output states the scope boundary ("mechanics only, not legal advice") on its face per
the spec. Size: M. Model: Sonnet. Migrations requested: 355. Dependencies: none.

**L24. Data Quality Indicator and primary-data share (ISO 14083/GLEC v3).** Spec refs: 09S1.4. Write
set: new migration creating `tce_data_quality` per spec 09's DDL (per transport-chain-element, not per
shipment). Files: the migration; `src/components/operations/DqiRollup.tsx` (renders the roll-up as a
share and a distribution, per the spec's own "never a mean" rule: "62% primary by tonne-km; 4 of 11 legs
primary; weakest leg geographical correlation 4", never a single letter grade). Acceptance test: a
fixture shipment with 11 legs, 4 primary, renders exactly that sentence shape; a negative test confirms
no single-letter-grade render path exists anywhere in the component. Size: M. Model: Sonnet. Migrations
requested: 356. Dependencies: none.

**L25. Auxiliary energy profiles (Operations).** Spec refs: 09S1.5. Write set: new migration creating
`auxiliary_energy_profiles` per spec 09's DDL. Files: the migration; a component joining this to L13's
labour-chain calculator as an additional operations input, rendered distinctly from the per-tonne-km
freight factor (never summed into it silently). Acceptance test: a museum-loan fixture (72-hour
climate-controlled airport hold, per the spec's own worked example) computes an auxiliary-energy
footprint that can exceed the flight leg's own emissions in the fixture's numbers, and the two figures
render as two distinct line items, never one merged number. Size: M. Model: Sonnet. Migrations requested:
357. Dependencies: L13.

**L26. Grid connection queue (Operations feasibility gate).** Spec refs: 09S1.6. Write set: new migration
creating `grid_connection_queues` per spec 09's DDL. Files: the migration; wired into L14's
`FeasibilityGateStrip` as a gate, not a cost line (a region with `queue_months_p50` above a named
threshold renders `BLOCKED` for an electrification-year target regardless of its `EUR/kWh` value).
Acceptance test: a fixture region with `queue_months_p50=30` and cheap power renders `BLOCKED` for a
2027 target (negative test: cheap power does not unblock it, directly proving the spec's own "no amount
of cheap electricity un-blocks it" rule). Size: M. Model: Sonnet. Migrations requested: 358.
Dependencies: L14.

**L27. Geopolitical rerouting multipliers.** Spec refs: 09S1.7. Write set: new migration creating
`reroute_events` per spec 09's DDL, using the already-shipped corridor-id fix so a reroute is a distinct
corridor entity, never a multiplier applied to the same corridor ID. Files: the migration; a propagation
method registered in the existing `methods/index.ts` registry (reuse of the pattern spec 08 section 6
already shipped), computing the bracketed, non-linear chain: reroute to fuel-burn multiplier to FuelEU
compliance balance to EU ETS cost to carbon-per-FEU to indexation clause (L23) to Scope 3 figure.
Acceptance test: a fixture Cape-vs-Suez reroute (`fuel_burn_multiplier` roughly 1.35) propagates through
the existing drain and produces a carbon-per-FEU on the reroute corridor that is NOT a linear scalar
multiple of the baseline corridor's figure, proving the bracketed penalty function fired rather than a
flat multiply, the exact defect spec 09 section 1.7 names and warns against. Size: L. Model: Sonnet.
Migrations requested: 359. Dependencies: L12 (carbon-cost-per-FEU rendering), the propagation drain
(already built), L23 (indexation clause, for the chain's last hop).

**L28. EUDR geo-traceability and book-and-claim custody.** Spec refs: 09S1.8. Write set: new migration
creating `eudr_plot_claims`, `custody_chains` per spec 09's DDL. Files: the migration; an alert
component rendering `hold_risk='border_hold'` as a blocking operational alert in a visually distinct
class from any monetary-exposure component (never sharing the cost-severity vocabulary), and
`double_count_check='conflict_detected'` rendering as a liability exposure visible to both claimant
records. Acceptance test: a fixture consignment with a missing or malformed geometry renders the
border-hold alert in a component-level visual class distinct from the cost-tile component (asserted in
the component test, not merely styled differently by convention); a fixture custody conflict renders on
both claimant records' views. Size: M. Model: Sonnet. Migrations requested: 360. Dependencies: none.

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
| 6 | Chained-apply autonomous firing is proven on a fixture/branch database, not caught mid-flight live, before the next autonomous chain attempt | Lane L20's acceptance test: a Supabase branch database's own `harness_runs` rows show the full hop sequence firing autonomously, zero production writes |
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

**Wave 2 (Research, S/S/M/S/M/M/L/S/M = mostly verification-and-narrowed lanes against the two in-flight
branches, plus 3 new builds).** After this wave: a customer opens Research and sees a horizon band, a
maturity triple, a split-credibility read, a dissent panel, and a planning-assumption-shift card bound to
their own assumption register, on at least the items the research walker's two dispatched runs have
touched, not yet the whole corpus. The bulk of this wave is already running on `lane/w2r-research-
assessment` and `lane/w2r2-assumption-register`; this plan's own new work is the authority client (L3),
the three remaining components (L5), the signposts entity/watcher (L6) and the research walker (L7-L9).
This directly answers the operator's "why is research have a design but not a build" complaint with a
build, not a further design pass.

**Wave 3 (Market Intel, 1L+2M... actually M/M/S).** After this wave: the Unverified-chip inversion is
fixed, a lead-time chart exists (even if thin on data at first), SBTi and EIA data flow, and the carbon-
cost-per-FEU figure is confirmed rendering end to end on the detail page.

**Wave 4 (Operations, M/M).** After this wave: a customer sees the labour chain and feasibility gates for
at least the regions with live producer data (gated honestly behind the existing R14-held EU/US producer
work, not faked ahead of it), and the materials-PPWR join exists for the confirmed-numeric regulation.

**Wave 5 (Community, M/L).** After this wave: the house-seeded benchmark poll exists. (The 5-gate
promotion machine named here earlier, L16, is Superseded by ADR-041: Community is social only.)

**Wave 6 (spine, L/L/L/M).** After this wave: Regulations has a real obligation register (at least 4
instruments deep) with the binding-position distinction live, a portfolio object lets a customer's "my
things" follow them across **all five** surfaces (not a partial-surface build), all nine entity kinds
carry a real attribute table, and the autonomous-chain fixture-database proof exists so the next
production chain attempt is proven before it runs live, not caught mid-flight.

**Wave 7 (the 8 spec 09 domain extensions, M/L/M/M/M/M/L/M).** After this wave: the OEM equipment
roadmap bridges Research's TRL ladder to Market Intel's spot signals with an explicit `M` rather than a
fabricated pack-density estimate; the carrier surcharge audit gives a customer a defensible, statutory-
only overcharge claim without the product making an unsupportable commercial accusation; the indexation-
clause generator hands a customer mechanics they can take to their own counsel; the DQI roll-up gives a
tender-competitiveness read an auditor can actually interrogate leg by leg; auxiliary energy profiles
surface a real cost blind spot for the art/live-events/pharma verticals; the grid-connection-queue gate
stops a cheap-power region from looking falsely attractive for electrification; the rerouting-multiplier
chain proves five surfaces move together from one geopolitical event, the exact bet the whole spine
design rests on; and EUDR/custody risk renders as the operational border-hold alert it actually is,
never disguised as a later fine.

**After all seven waves:** every P0 gap named in spec 06 S2-S5 is either closed or has a lane with an
acceptance test; the R14 lift criteria in S3 above are the gate for population to proceed; nothing in this
plan is deferred as "design later," "not yet lane'd," or "fast-follow" per the operator's own standing
instruction and the coordinator's 2026-10-01 ruling, every design question that specs 03/04/05/08/09 had
left open (assumption-register ownership, corridor identity granularity, confidence floors per use, OEM
density basis, pool-position-inference disclosure, indexation-clause format, spine scope for v1) is
closed by ADR-039 and built as a lane above, not carried forward as open.

---

## 5. Explicitly removed or superseded

Per the operator's 2026-10-01 ruling ("superseded by newer items are out of scope. Remove them"), restated
here for the whole-product plan, not only the remediation plan's own scope. **Every design question this
plan previously carried as "still open" is now closed: see `docs/decisions/ADR-039-complete-build-
rulings-2026-10-01.md` for the five sub-decisions (pool-position inference, indexation-clause format,
OEM density basis, confidence floors, spine scope for v1), each of which is built as a lane in section 2
above.** Nothing below is open; it is removed from scope, not deferred.

- **Market Intel corridor rate board (spec 02 row 2, spec 07's "the band is the product" section).**
  RETIRED by the 2026-09-25 ruling (decision 1, rule 20), operator verbatim: "people already have systems
  for this and it changes so often without an api from their systems this is too much work and not what
  our system should focus on." Not carried into any lane above. The carbon-cost overlay (row 3) stands
  alone as the differentiator per the same ruling.
- **Community "not your name, not your company" default (spec 05 S2, spec 07's original item 1).**
  SUPERSEDED by spec 07's own 2026-09-25 amendment (R8.7): identity is shown by default, anonymity is
  opt-in per-post or per-user. L16 above (itself now Superseded by ADR-041) was to build to the amended rule, not the superseded one.
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
- **Pool-position inference disclosure (spec 09 S1.2, `pool_adjusted_eur`).** CLOSED by ADR-039(a): held
  internal, never customer-facing; only the statutory variance publishes. Built as lane L22.
- **Indexation-clause output format (spec 09 S1.3).** CLOSED by ADR-039(b): mechanics and arithmetic
  only, never drafted clause text. Built as lane L23.
- **OEM density basis (spec 09 S1.3, open decision 3).** CLOSED by ADR-039(c): `M` (missing) when only
  cell-level density is disclosed, never a derived pack estimate. Built as lane L21, which also closes
  the domain itself (previously deferred, now laned).
- **Confidence floors per use (`FLOOR[use]` in `admissibleFor()`).** CORRECTED, not open: ADR-024
  decision 3 already set `{analysis: 0.50, calculation: 0.75, filing: 0.90}`, live in
  `fsi-app/src/lib/entities/decisions.mjs` (confirmed by direct read this session). ADR-039(d) records
  the correction; the prior draft of this plan's row calling the floors "still unset" was wrong and is
  fixed in place per rule 14.
- **Spine scope for v1 (spec 06 S9 open question 1).** CLOSED by ADR-039(e): all nine entity kinds.
  Obligation (L17) and signpost (L6) build first because they gate the most other work; the remaining
  four (asset, method, technology, person) are lane L19, with its own acceptance test confirming all
  nine kinds have a backing attribute table. Not a scope narrowing; a build-order choice within full
  scope.

---

## 6. Memory and discipline conformance

- INDEX.md gains a line for this doc, same commit.
- No em dashes or section glyphs used in this document's authored prose (rule 022).
- Every state claim above carries a status token (`[CONFIRMED]` / `[AUDITED]` / `[HYPOTHESIS, ...]`) per
  rule 14; none is stated bare.
- `scripts/verify/audit-finding-status.mjs` was not run against this file in this pass (the script targets
  `docs/audits/`, and this is a `docs/plans/` planning document, not an audit register) ,  noted so the
  coordinator can decide whether the checker's scope should extend here.
