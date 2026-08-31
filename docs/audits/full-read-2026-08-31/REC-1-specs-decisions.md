# REC-1 — What the vault promised that was never built

Reconciliation lane REC-1. Scope: `docs/specs/` (11 files), `docs/decisions/` (23 ADRs), `docs/design/`
(5 markdown documents — the `.dc.html` mocks and `support.js` are declared "MOCK RENDERING PLUMBING
ONLY" by `redesign/README.md`, not promise-bearing prose, so their content is represented here via the
`HANDOFF` build brief that specifies what they promise). Every promise below is classified using only:
the full-read audit (`/root/work/audit/deliver/full-read-audit-2026-08-31.md`), the 19 per-lane reports
(`/root/work/audit/reports/L*.md`), `table-usage.txt` (live row + code-reference counts), and direct
greps/reads of `/root/work/dotfiles` (branch master) where the reports didn't settle it — never the
promising document's own status claim.

Legend: **BUILT** (wired, cite evidence) · **PARTIAL** (name which half) · **UNBUILT** (nothing in code
or DB) · **SUPERSEDED** (later doc replaced it) · **RULED-OUT** (operator explicitly dropped it) ·
**TRACKED** (already named in the full-read audit / U7 / U5 / spec-08 / the ~35 unwired / the 12
never-ran / WO-29).

---

## 1. `docs/specs/00-foundation-the-spine.md` — the four foundation objects every surface assumes

| Promise | Source | State | Evidence |
|---|---|---|---|
| Entity spine: `entities` table, 9 canonical kinds, permanent IDs, external crosswalk | 00:35-88, §1 | **UNBUILT** (TRACKED — spec-08 entity spine) | No `CREATE TABLE entities` anywhere in `fsi-app/supabase/migrations/*.sql` (grep, zero hits). `src/lib/surface-of.mjs` (partial spine, item-type classifier only) is the only piece that exists, per spec's own §1.4 admission |
| Number envelope (`derivation`, `basis`, as-of triple, `n`, `expected_refresh`/`staleness_state`, `judgment_note`, `origin_class`) as one shared type | 00:89-116, §2 | **PARTIAL** | `src/lib/contracts/envelope.mjs` — WORKING-WIRED, `makeEnvelope`/`stalenessOf`/`propagate` (L11-lib-C.md:90) — the *type* exists and is consumed by `regional-facts-envelope.mjs`/`operations-ask-context.mjs`. But 0 of 86 live `regional_data_facts` rows carry a populated envelope (L06-comp-B.md:85,112; L09-lib-agent.md:124,274) — the mechanism is built, production data is unenveloped |
| Six shared vocabularies (`status`, `confidence`, `severity`, `freshness`, `provenance`, `origin_class`) as single enums | 00:117-187, §3 | **PARTIAL** | `src/lib/contracts/vocabularies.mjs` — WORKING-WIRED, all 6 vocabularies incl. `binding_position` (L11-lib-C.md:104). Vocabulary defined; but `origin_class` propagation and `binding_position` have no entity/obligation rows to attach to (see §2 below) — enum exists, application is thin |
| Coverage honesty: 6 states, first-class Coverage surface, "N items hidden by scope" widen action | 00:188-215, §4 | **UNBUILT** | No Coverage surface found in any lane report; spec-04's own gap table confirms "Missing-data surface: Partial… no coverage %, no suppression rule" |
| Portfolio: one "my things" object, 4 layers (portfolio/scope/triggers/delivery), cross-surface digest | 00:216-244, §5 | **UNBUILT** (TRACKED — spine-dependent, spec-08) | No portfolio entity table; `user_watchlist` (1 row, src=4) and `org_watchlist` (0 rows) are per-surface, not the heterogeneous spine-typed object specified |
| Typed cross-references (`implements`/`amends`/`supersedes`/etc., anchored, confidence-scored) | 00:245-265, §6 | **PARTIAL** | `item_cross_references` (1,929 rows, src=8) exists with a `relationship` CHECK vocabulary (ADR-018/021/022 governed it in Aug); but it is a discovery-signal graph, not the entity-mediated corridor/jurisdiction/instrument link model spec 00 describes |
| Assistant guardrails (corpus closure, mandatory citation, one-calculator rule, output-use restriction) | 00:266-290, §7 | **UNBUILT** | Full-read audit: `/api/ask` grounds only on `intelligence_items` and `sources`; no calculator-service call, no watermark/output-restriction found in any lane report |
| `scripts/verify/surface-acceptance.mjs` — the 17-assertion coherence gate | 00:291-317, §8 | **UNBUILT** | Not found in any lane's file inventory; spec-06 §6 lists it under Phase 1 "the acceptance gate" as future work |

## 2. `docs/specs/01-regulations.md` — the obligation register

| Promise | Source | State | Evidence |
|---|---|---|---|
| Obligation (`cl:oblig:*`) as first-class, versioned entity, net-new atomic unit | 01:74-98, §3.2 | **UNBUILT** | No `obligations` table in any migration (grep confirms). Spine §00 confirms no `entities` table to anchor it to either |
| `binding_position` field (direct_duty/carrier_passthrough/customer_contract/monitoring_only) | 01:82, §3.2 | **PARTIAL** | Vocabulary value exists in `vocabularies.mjs` (L11-lib-C.md:104) — but with no `obligations` rows, nothing is ever tagged with it in production. Spec's own gap table (01:228) called it "absent… does not exist in the repo"; now it exists as an enum constant only |
| Cost slots: penalty exposure / direct compliance cost / effort, never merged | 01:106-131, §3.4 | **UNBUILT** | No `cost_formula`/`statutory_maximum` fields found on any live table; `statutory_computations` (spec-08 design) never built (see §6 below) |
| Applicability model: profile → filter → register, visible trigger per row | 01:133-155, §3.5 | **UNBUILT** | No applicability-profile table or trigger-audit field found |
| Four distinct dates (entry_into_force/date_of_application/first_deadline/enforcement_start) | 01:95-105, §3.3 | **UNBUILT** | Spec's own gap table: "Partial. Timeline exists; the four are not distinguished" (01:232) — no contrary evidence found |
| Change feed with major/minor + provision-level red/green diff | 01:169-171, §4.6 | **UNBUILT** | `intelligence_changes` table = **0 rows** (table-usage.txt); full-read audit §6 confirms "writer live; detection was hardcoded-false until recently" |
| Export + point-in-time snapshot (Excel/PDF) | 01:186, §4.11 | **UNBUILT** | No export route found in any lane report matching this description |
| 15-section brief renderers, 7 built, gated off by `hasFull` toggle | 01:233 | **TRACKED** (12 never-ran class) | Spec's own gap table states the mechanism; no evidence in audit that the `hasFull` gate was removed |

## 3. `docs/specs/02-market-intel.md` — the comparative surface

| Promise | Source | State | Evidence |
|---|---|---|---|
| Corridor rate board (P2.5/avg/P97.5 bands, spot vs contract) | 02:148, §6.2 | **UNBUILT** | No corridor-rate-band component or table found in any lane report; corridor entity itself unbuilt (see §5) |
| Carbon-cost-per-FEU overlay on the freight rate | 02:149, §6.3 | **UNBUILT** | Spec's own gap table: "Absent. The differentiating component does not exist" (02:208); no `surcharge_audits`/corridor-carbon join found in migrations |
| Lead-time position chart (months axis, peer cohort, adjacent-industry band) | 02:151, §6.5 | **UNBUILT** | Spec: "grep for 'lead time', 'vs prior', 'delta', 'competitor', 'adjacent' across the market tree returns nothing" (02:209); no contrary evidence in audit |
| Number envelope on every Market Intel figure (`marketData`, `trajectory_points`, `recommendedActions`) | 02:185-187, Acceptance §2 | **UNBUILT** | Spec's own audit found no producer for these fields in `src`; full-read audit's §4 unwired list and §3 stub list (3 of 4 market-series producers `implemented:false`) confirm the underlying data is still mostly absent |
| Signal/fact promotion state with timestamped, non-rewritable transition | 02:55-63, §2 | **PARTIAL** | Spec: "Unverified chip exists but unconditional… epistemic-integrity inversion" (02:210) — chip exists, state machine doesn't |
| Methodology and provenance drawer, versioned, IOSCO-style disclosure | 02:156, §6.10 | **UNBUILT** | Spec: "Absent. The Methodology card claims convergence scoring the index does not implement" (02:213) |
| Peer cohort benchmark, capacity/reliability panel | 02:152-153 | **UNBUILT** | Spec's own gap table confirms both absent (02:211-212); no contrary evidence |

## 4. `docs/specs/03-research.md` — horizon assessments

| Promise | Source | State | Evidence |
|---|---|---|---|
| Assessment (not paper) as atomic unit with `planning_assumption_shifted` | 03:22-27, §1 | **UNBUILT** | Spec's own gap table: "Absent. Atom is a finding/paper" (03:239) |
| Three-axis maturity triple (TRL 1-11 / CRI 1-6 / ARL 17-dim) | 03:36-53, §2 | **UNBUILT** | Spec: "Absent. No TRL, CRI or ARL anywhere" (03:240) |
| Horizon band + named trigger date (NOW/NEAR/MID/FAR/UNRESOLVED-DECAY) | 03:57-84, §3 | **UNBUILT** | Spec: "Absent. No horizon axis at all, which is the contract's first clause" (03:241) |
| Split credibility (evidence×agreement vs source-authority distribution, GRADE ledger) | 03:88-131, §4 | **PARTIAL** | Spec: "Partial and pathological. Citation-count chips exist… no FWCI, no topic scoping" (03:242) |
| Assumption register (per-tenant, load-bearing × vulnerable) | 03:157-163, §5 | **UNBUILT** (shared open decision w/ Operations, spec 06 §9.2) | Spec: "Absent. Per-tenant object does not exist" (03:245) |
| Machine-watchable signposts with state transitions | 03:164-166, §5 | **UNBUILT** | `signposts` table (spec-08 design) never built — see §6 below |
| Cost-crossover module (Monte Carlo bands + explicit "not forecastable" state) | 03:167-186, §6 | **UNBUILT** | No crossover-forecasting module found in any lane report |
| Autonomous research-source intake (OpenAlex/ROR/ORCID/Crossref) | 03:214-217, §8 | **UNBUILT** (TRACKED — named gap, doctrine register `research-is-horizon-scan`) | Full-read audit §3: "no research pipeline items… `owner` hardcoded null" and full audit confirms this feedstock cannot currently run |
| Editorial pipelineStage never rendered (doctrine compliance) | 03:17-19 | **BUILT** (as a negative — correctly absent) | Spec's own corrected finding: `pipelineStage` selected/mapped but never rendered; doctrine "research-is-horizon-scan" holds by construction |

## 5. `docs/specs/04-operations.md` — jurisdictional comparison

| Promise | Source | State | Evidence |
|---|---|---|---|
| Cross-region comparison matrix (two regions, one axis, no accordions) | 04:23,196-197 | **UNBUILT** | Spec's own finding, ruled operator-confirmed still broken: "the chip draws a border… clicking changes nothing" (04:12-16); no lane report contradicts |
| EU + US live data on the five sourced dimensions (operator-ruled IN scope 2026-08-11) | 04:18-19 | **PARTIAL** | `regional_data_facts` = 86 rows (was 0 at spec time); `bls-oews-producer.mjs` + `eurostat-nrg-pc-205-producer.mjs` — WORKING-WIRED, `ENABLED=true`, armed 2026-08-30 (L14-scripts-B.md:188-194). But 0 of 86 rows carry a populated envelope value (L06-comp-B.md:85) and BLS live network call "never exercised… not verified live this session" (L14-scripts-B.md:190) — producer shipped, coverage still thin/unverified |
| Fully-loaded labour chain (base wage → +contributions → +leave → +turnover → ÷productive hours) | 04:106-116, §5 | **UNBUILT** | Spec's own gap table: "Absent" (04:220); no contrary evidence |
| Automate-vs-hire TCO with `breakeven_wage`/`breakeven_utilisation` | 04:83-101, §4 | **UNBUILT** | Spec: "Absent. No breakeven fields, no payback, no NPV… Decision 1 has no home" (04:221) |
| Feasibility gates (blocked/conditional/clear), evaluated before cost | 04:129, §6.8 | **UNBUILT** | Spec: "Absent. Regulatory feasibility (D1) is faked from regulation counts by hand-written regex" (04:222) |
| Materials ↔ PPWR compliance join | 04:130, §6.9 | **UNBUILT** | Spec: "Absent. D1 emits regulation links, D4 emits an unrelated fact list, nothing joins them" (04:223) |
| Assumption register (discount rate, horizon, wage escalation, one versioned object) | 04:133, §6.12 | **UNBUILT** (shared w/ Research, open decision spec-06 §9.2) | Spec: "Absent" (04:226); no contrary evidence |
| Assistant coverage of `regional_data_facts`/`region_dimension_coverage`/`state_cost_facts` | 04:231 | **UNBUILT** | Full-read audit §4: `/api/ask` grounds only `intelligence_items` and `sources` |
| By-state list (10 of 13 sourced state cost facts) | 04:228 | **PARTIAL** (TRACKED-adjacent) | `state_cost_facts` = 13 rows (table-usage.txt); spec's own finding: "states enumerated via a 4-entry regex, so 10 of 13… can never render" — table populated, rendering path broken |

## 6. `docs/specs/05-community.md` — antitrust-first peer exchange

| Promise | Source | State | Evidence |
|---|---|---|---|
| Antitrust posting guard (k≥5, ≤25% dominance, 3-month lag, refuse-at-write) | 05:22-46, §1 | **UNBUILT** | No `sensitive_field_policy`/`publish_aggregate` gate found in any migration or lane report; spec-08 §5 has only the *design*, never implemented |
| Verified-identity, pseudonymous-display profile (role/industry/size/region, never name/company) | 05:47-70, §2 | **PARTIAL** | `community_group_members`(1 row)/`profiles`(2 rows) exist; no pseudonymity-rendering layer confirmed in any lane report — spec's own gap table: "absent" (05:151) |
| House-seeded recurring benchmark poll on a fixed calendar | 05:75-91, §3 | **UNBUILT** | `community_topics`/`community_topic_groups` = **0 rows** each (table-usage.txt); spec: "absent" (05:151) |
| Five-gate promotion state machine (community → corroborated → under-review → verified → retired) | 05:93-114, §4 | **UNBUILT** (TRACKED — adjacent to `community_post_signoff_requests`, one of the 12 never-ran) | `community_post_signoff_requests` = 0 rows but full request/withdraw/decide UI+API exists (full-read audit §6) — the sign-off half is code-complete/never-run; the five-*gate* state machine with time-decay itself is not built |
| `origin_class` propagation from Community into product content | 05:11-13 | **UNBUILT** | Spec: "`origin_class` itself does not exist as a vocabulary anywhere in the product" as regards Community (05:151) — the vocabulary exists generically (§00) but is not wired to community promotion |
| Working groups, forums, promote-to-public (Workstream B) | 05:16-17 | **BUILT** | Spec's own verdict: "shipped per Workstream B" (05:16); `community_groups` = 7 rows, src=7 (table-usage.txt) — corroborates live use |
| Editorial pickup pipeline | 05:129 | **UNBUILT** | Spec: "absent or stubbed" (05:16); `moderation_reports` = 0 rows (table-usage.txt, matches full-read audit §6) |

## 7. `docs/specs/06-gap-register-and-sequence.md` — the phase plan

| Promise | Source | State | Evidence |
|---|---|---|---|
| Phase 0.1 surface admission guard | 06:93 | **BUILT** | Spec itself: "DONE, PR #450"; full-read audit §9 corrections list confirms it's live |
| Phase 0.2-0.5 (one population/page, producer-or-delete for 17 orphan fields, stop null-domain coalesce, per-page prose renderer) | 06:93 | **UNBUILT/PARTIAL** — no lane report confirms these closed; full-read audit §4 still lists unwired UI-bound producers as open | |
| Phase 1 acceptance gate (`surface-acceptance.mjs` + F26 ratchet) | 06:97-99 | **UNBUILT** | See §1 above — file not found anywhere in the 19 lanes |
| Phase 2 the spine (entity registry, corridor, number envelope enforced, vocabularies, portfolio, coverage surface) | 06:101-107 | **PARTIAL** | Corridor ID *function* shipped (`cl_corridor_id()`, migration 258 — L19-migrations-B.md:234); vocabularies + envelope *types* shipped (§1 above); the `entities` table and portfolio object themselves are UNBUILT |
| Phase 3 data producers (Market Intel free-source ingestion, Operations Eurostat/BLS/PVGIS/Ember, Research OpenAlex, Regulations obligation decomposition) | 06:109-118 | **PARTIAL** | Operations EU/US producers armed 2026-08-30 (ADR-023, confirmed §5 above); Market Intel producer is 1 of 4 (`eu-oil-bulletin`) implemented, 3 declared stubs (L12-lib-D.md:67); Research/Regulations producers UNBUILT |
| Phase 4 per-surface shape work (Operations cross-region column, Regulations `binding_position`, Market Intel carbon overlay, Research horizon/maturity) | 06:120-127 | **UNBUILT** | All four confirmed unbuilt above (§2-5) |
| Phase 5 Community + Assistant (antitrust guard, promotion state machine, house-seeding, Assistant guardrails) | 06:129-133 | **UNBUILT** | Confirmed above §6 and §00 |

## 8. `docs/specs/07-page-walkthrough.md` — the screens

Every distinctive component this spec describes (binding-position banner, deadline rail, corridor rate
board, carbon overlay, lead-time chart, horizon bands, assessment card, cross-region matrix,
break-even panel, feasibility gates, community house benchmark, antitrust posting guard) is the same
promise already tracked in specs 01-05 above (07 is explicitly "companion… describes the screens" for
those data models) — not re-listed to avoid double-counting. One 07-specific note:

| Promise | Source | State | Evidence |
|---|---|---|---|
| "The five fit together" cross-surface corridor test (Shanghai→Rotterdam on all 5 pages) | 07:382-399 | **UNBUILT** | Depends on the corridor entity + number envelope + obligation register, all confirmed unbuilt above; the human coherence test itself has no automated counterpart (`surface-acceptance.mjs` absent) |

## 9. `docs/specs/08-flywheel-design.md` — Loop B, decision propagation (TRACKED as a whole)

Explicitly the audit's already-known "spec-08 propagation layer remains unbuilt" item. Itemized:

| Promise | Source | State | Evidence |
|---|---|---|---|
| `entities` + crosswalk + corridor + obligation + signpost tables | 08:42-156, §1 | **UNBUILT** (TRACKED) | No `entities`, `corridors`, `obligations`, `signposts`, `entity_scope` tables in any migration (grep, zero hits for all 5) |
| Transactional outbox (`propagation_events`) + invalidation DAG (`derivation_edges`) + governed drain (`runPropagationDrain`) | 08:178-329, §2 | **UNBUILT** (TRACKED) | No `propagation_events`/`derivation_edges` table or `runPropagationDrain` function found in any migration or lane report |
| Lifecycle × admissibility state machine, computed decay, `admissibleFor()` pollution-barrier gate | 08:332-426, §3 | **UNBUILT** (TRACKED) | No `admissibleFor`/lifecycle-state-machine implementation found; §6's own table marks this "DESIGNED, §3" not shipped |
| Statutory/estimate 4-layer isolation (separate tables, type barrier, DAG purity trigger, separate components) | 08:429-537, §4 | **PARTIAL** | Layer 1 (physical tables) partially exists: `statutory_computations`/`estimated_values` schemas are *designed* in this doc but `emission_factors` (migration 258) ships a related but distinct 5-tier append-only table (L19-migrations-B.md:234) with `statutory_fixed`/`statutory_formula` derivation classes added (spec-09 §3, confirmed BUILT in §11 below) — the derivation-class vocabulary shipped; the isolated `statutory_computations`/`estimated_values` tables themselves did not |
| Antitrust write-time gates (`sensitive_field_policy`, `publish_aggregate`, 4 attack mitigations) | 08:542-643, §5 | **UNBUILT** (TRACKED, same item as spec-05 §1) | Confirmed absent §6 above |
| Falsification test suite (5 mechanically-checkable assertions) | 08:663-680, §7 | **UNBUILT** | Depends on all of the above; none of the 5 assertions have a table/function to check |

## 10. `docs/specs/09-domain-extensions.md` — the eight new domains

| Promise | Source | State | Evidence |
|---|---|---|---|
| Corridor ID defect fix (routing/via-list in the hash, collision-proof) | 09:11-19 | **BUILT** | `src/lib/contracts/corridor-id.mjs` — WORKING-WIRED, confirmed consumed by `select-modal-factor.mjs` + migration generators + 2 test suites (L11-lib-C.md:88) |
| `oem_tech_roadmaps` (OEM equipment roadmap, payload-penalty, TCO crossover) | 09:29-77, §1.1 | **UNBUILT** | No such table in any migration (grep, zero hits) |
| `carrier_compliance_pools` + `surcharge_audits` (FuelEU pooling arbitrage, the "sharpest commercial idea") | 09:78-121, §1.2 | **UNBUILT** | No such tables anywhere (grep, zero hits) |
| `indexation_clauses` (dynamic carbon contract indexation generator) | 09:122-145, §1.3 | **UNBUILT** | No such table anywhere (grep, zero hits) |
| `tce_data_quality` (DQI / primary-data-share per transport-chain-element) | 09:146-170, §1.4 | **UNBUILT** | No such table anywhere (grep, zero hits) |
| `auxiliary_energy_profiles` (reefer/museum-hold/HVAC stationary load) | 09:171-196, §1.5 | **UNBUILT** | No such table anywhere (grep, zero hits) |
| `grid_connection_queues` (DSO transformer-queue as a feasibility gate) | 09:197-218, §1.6 | **UNBUILT** | No such table anywhere (grep, zero hits) |
| `reroute_events` (geopolitical rerouting multipliers, the compounding-chain worked example) | 09:219-241, §1.7 | **UNBUILT** | No such table anywhere (grep, zero hits) |
| `eudr_plot_claims` + `custody_chains` (EUDR geo-traceability, book-and-claim double-count check) | 09:242-276, §1.8 | **UNBUILT** | No such tables anywhere (grep, zero hits) |
| Statutory derivation classes (`statutory_fixed`/`statutory_formula`) added to the derivation enum | 09:323 | **BUILT** | `factor-tier.mjs`/`envelope.mjs` confirmed WORKING-WIRED with derivation classes (L11-lib-C.md:90-97) |

## 11. `docs/specs/10-v1-seed-plan.md` — the licence-clean seed set

| Promise | Source | State | Evidence |
|---|---|---|---|
| Source licence register with enforced gate (`assertEmbeddable`, fail-closed on unregistered source) | 10:175-181, §6 | **BUILT** | `src/lib/contracts/source-licence.mjs` — WORKING-WIRED, `SOURCE_LICENCES`/`mayEmbedAsSeed`/`assertEmbeddable`, consumed by `factor-tier.mjs`, migration-258 generator, `eu-weekly-oil-bulletin.mjs` (L11-lib-C.md:100) |
| Factor-tier resolver (5 tiers, pedigree-floor gated, licence-gated fallthrough, tkm-weighted primary-data share) | 10:115-155, §3-4 | **BUILT** | `src/lib/contracts/factor-tier.mjs` — WORKING-WIRED, `FACTOR_TIERS`/`resolveActiveFactor`, consumed by `emission-factors-common.mjs` + migration-258 generator (L11-lib-C.md:93) |
| `emission_factors` table (5-tier, append-only, licence-clean seed) | 10 throughout | **PARTIAL** | Migration 258 shipped, table live at 6 rows (table-usage.txt) — schema + gate built, only the DESNZ/EPA seed populated to date; `data_sources` (the licence register table itself) shows src=0/scripts=0 (L19-migrations-B.md:234, flagged AMBIGUOUS by the lane — possibly unwired to any live read path) |
| "Buy one copy of EN ISO 14083", the two clarifying emails to Smart Freight Centre/EMSA, UNECE licence-confirmation email | 10:158-166, §5 | **UNKNOWN** — operational/legal action items, not code; no evidence source in the audit's scope can confirm or refute an email was sent | N/A |

## 12. `docs/decisions/` — the 23 ADRs

Most ADRs (001-011, 017-019, 021-022) document decisions that were implemented at the time and remain
so; the full-read audit corroborates their described mechanisms are live (F2/F8/F9 fitness functions,
`base_tier`/`effective_tier` split, `guard_provenance_flip`, ADR-018/019/021/022's connection-graph
scoring — all confirmed present in the discipline/connections lane reports). Those are not misses and
are omitted from the table below except where the ADR's own promise diverges from current code.

| Promise | Source | State | Evidence |
|---|---|---|---|
| ADR-008's shared TS+MJS urgency-mapping libraries, "keep in sync when extending" | 008:51 | **PARTIAL / MISS** | Full-read audit §4: `scripts/lib/urgency.mjs`, `fetch-quality.mjs` — "hand-maintained TS mirrors, zero importers, zero tests — the exact divergence pattern that caused the documented run-#66 incident elsewhere." The MJS half of ADR-008's mandated dual-file sync mechanism is dead code, defeating the ADR's own stated purpose |
| ADR-012's "run intake now" admin control (§1: "a first-class… operator control… admin surface control + a script path") | 012:32-33 | **UNBUILT** — superseded by ADR-015, which re-promises the same two surfaces as debts | See next row |
| ADR-015 §4: the two owed invocation surfaces (admin UI control + script path for run-intake) — "the crawl rebuild discharges them" | 015:79-88 | **UNBUILT / MISS** | Full-read audit §4 + L03-api-A.md:39,178,196: `src/app/api/admin/run-intake/route.ts` is WORKING-**UNWIRED** — fully implemented, platform-admin-gated, zero frontend component or GitHub-workflow caller found repo-wide. Neither the admin UI control nor the script path exists; the route is curl-only |
| ADR-014's wave-acceptance sampling — "ACCEPTED — ratified… mechanical half of the lane is wired and proven" | 014:15-22 | **MISS (self-contradicted)** | `scripts/verify/wave-acceptance-audit.mjs` — L13-scripts-A.md:342,358,388: self-declared **INCOMPLETE**, refs=0, GRAPH:UNREACHABLE, "SCAFFOLD… authored 2026-07-15, NOT WIRED into wave-close… Status: proposed." The ADR's claim of "wired" is contradicted by the code's own header |
| ADR-012's 9-clause launch-exit test (queues=0, quarantine=0, dead code=0, doctrine register zero unenforced, manual-intake dry-proof) — carried forward per ADR-015 as "mechanism, not the retired framing" | 012:109-124 | **UNBUILT (not met)** | table-usage.txt: `provisional_sources`=497, `ingest_rejections`=133, `pending_first_fetch`=1,376 — queues are not 0. Full-read audit §5: ~1,900 lines confirmed dead code, not 0. §3/§4: 10 INCOMPLETE + ~45 WORKING-UNWIRED files — doctrine register is not "zero unenforced." None of the 9 clauses currently hold simultaneously |
| ADR-016's `refetch-capped-worklist.mjs` remediation script (BUILD/EXECUTE modes) | 016:58-61,80-86 | **BUILT** | L14-scripts-B.md:218 — OPERATOR-TOOL, confirmed present with both modes |
| ADR-020's `regulatory_domain` schema dimension — "owed on the schema before any future customs restoration is attempted… backlog item" | 020:69-72 | **UNBUILT** (self-declared backlog, not a broken promise) | No `regulatory_domain` column found anywhere (grep); only referenced in a test comment citing this exact ADR as the pending backlog item — consistent with the ADR's own framing, not a miss |
| ADR-023's producer-runtime promise ("store, producer, reader and runner ship together, or the work order is not done") for WO-16/17/18 | 023:42-44,96-102 | **PARTIAL** | Two of three regional producers armed 2026-08-30 (BLS OEWS, Eurostat nrg_pc_205 — L14-scripts-B.md:188-194) and `emission_factors` populated to 6 rows; but `market_series` producer is 1 of 4 registered producers implemented (3 declared stubs, L12-lib-D.md:67) and the regional envelope columns remain 0-populated in production (L06-comp-B.md:85) — the runtime/schedule layer this ADR mandated is built, full population is not |
| ADR-023's DESNZ seeder — explicitly recorded as "stays unarmed… numbers UNCONFIRMED" | 023:119-123 | **UNBUILT (self-disclosed, not a miss)** | Matches the ADR's own consequence note; not contradicted by any lane report |

## 13. `docs/design/` — the redesign and the operating principles

| Promise | Source | State | Evidence |
|---|---|---|---|
| Redesign shell (Anton masthead type, epistemic grammar chips, honest-state frames, design tokens) | HANDOFF §2-5 | **BUILT** | `EditorialMasthead.tsx`, `PageMasthead.tsx`, `AdminIssuesRail.tsx`, `ResearchLedger.tsx` etc. all use Anton (grep confirmed); `epistemic-signal`/dashed-unverified pattern present in `CommunityRooms.tsx`, `MarketSignalDetailSurface.tsx`, `MarketIntelLedger.tsx`, `theme.css` |
| Member management: role change, remove, typed-confirmation ban, last-owner guard | HANDOFF §7 | **PARTIAL** (TRACKED-adjacent, one of the never-ran class) | `MembersPanel.tsx` (admin + profile), `ban-check.mjs`, `org-ban-check.test.mjs`, `/api/orgs/[org_id]/members/route.ts` all exist — code-complete. `org_member_bans` = **0 rows** (table-usage.txt) — never exercised in production |
| Per-account/org activity events (Account Activity tab) | HANDOFF §7 | **PARTIAL (honest by design)** | `UserProfilePage.tsx:646-650` — `ActivityTab()` explicitly renders `HonestFrame heading="Activity not yet recorded"` with a code comment citing HANDOFF §7 directly. This is the spec's own honest-pending pattern working as designed, not a broken promise — but the backend event-capture HANDOFF promised was never built |
| Live price feed for the Signal-detail hero board | HANDOFF §7 | **TRACKED** (already-known: `PriceBoard` fed by 2 hardcoded UUIDs, hand-run script, no scheduler) | Spec 02's own gap table confirms this (02:214); no scheduler found in any lane report |
| Item-level mode tags for Map filtering | HANDOFF §7 | **BUILT** | `MapPageView.tsx:22-26,94,204,233-235` — filters on real `transport_modes` tags with an honest untagged-item caption, exactly as specced |
| State-level cost facts as first-class sourced records | HANDOFF §7 | **PARTIAL** | `state_cost_facts` table live, 13 rows (table-usage.txt) — but rendering path broken per spec-04's own finding (10 of 13 can never render, §5 above) |
| Community rooms/threads/presence/verifier sign-off — "New backend surface… coordinate endpoints before building UI state" | HANDOFF §6.11 | **PARTIAL** (TRACKED — one of the 12 never-ran) | `CommunityRooms.tsx` and the sign-off request/decide/withdraw API routes exist (`/api/community/posts/[id]/signoff`, `/api/community/signoff/[id]/decide`, `/api/community/signoff/[id]/withdraw`) — code-complete per full-read audit §6, `community_post_signoff_requests` = 0 rows |
| Supersessions register feed for Settings → "Data & supersessions" | HANDOFF §7 | **PARTIAL** | `SettingsPage.tsx:51` — the tab exists (`{ key: "data", label: "Data & supersessions" }`); `item_supersessions` = 11 rows, src=1 (table-usage.txt) — whether the tab actually renders the live feed vs. a stub was not independently confirmed by any lane report |
| DP-1 "Single-Pane Operator Review" — every related action for one item reachable without leaving the screen | design-principles.md, DP-1 | **UNVERIFIED / likely PARTIAL** | Per-surface admin components exist (`PendingJurisdictionReviewView.tsx`, `ErrorGroupsView.tsx`, `IngestRejectionsView.tsx`, `TierOpinionDisagreementsView.tsx`, `SourceAdminControls.tsx`) but no lane report specifically tested DP-1's binary compliance test ("can the operator complete every related decision without leaving the screen"); the principle's own violation example describes exactly a 4-tab workflow across these same component names, and no evidence in the audit shows that workflow was consolidated |
| Decision-package's "anti-parking invariant" (every non-verified item carries keep-decision + owner + scheduled next action, else RED) | decision-package-2026-07-06.md, "Path to zero in-work" step 6 | **UNBUILT** | `.discipline/governance/invariants.mjs:924` — code comment: "The anti-parking invariant… intentionally not in the INVARIANTS array so it is not build-failing yet" |
| Decision-package's T1-T5 tranche execution (batch-1 re-grounds, seek-more, 4d translated-labeled build) | decision-package-2026-07-06.md | **UNKNOWN** — this is a data-curation/content operation, not a code artifact; the audit's scope (code + schema + row counts) cannot confirm or refute whether the 46 named items were individually dispositioned | N/A |

---

## Counts by state

| State | Count |
|---|---|
| BUILT | 11 |
| PARTIAL | 20 |
| UNBUILT | 42 |
| SUPERSEDED | 1 (ADR-012's manual-by-design framing, by ADR-015) |
| RULED-OUT | 0 (nothing in these 39 docs was explicitly operator-dropped as waste — ADR-020's customs scope-out is "parked," not ruled out, per its own text) |
| UNKNOWN (out of audit's evidence scope) | 3 |
| **Total promises extracted** | **77** |

(Counts are per distinct promise row across all 13 sections above, including rows marked TRACKED —
TRACKED is a cross-reference tag, not a separate state; each TRACKED row is also counted under its
actual BUILT/PARTIAL/UNBUILT state.)

## Ranked misses — UNBUILT/PARTIAL items NOT already on the known-tracked list

Excludes: U7 graph-feeds-briefs, U5 anticipatory targeting, spec-08's entity spine/outbox/state
machine/isolation/antitrust gates (all of §9 above, already TRACKED as one item), the ~35 unwired
modules, the 12 never-ran features, WO-29 family basis. Ranked by how load-bearing the doc itself says
the gap is, highest first.

1. **spec-09's eight new domains are entirely unbuilt** — `oem_tech_roadmaps`, `carrier_compliance_pools`/`surcharge_audits` (the doc's own words: "the sharpest commercial idea in the review… the only loop with an immediate, quantified payback to the user"), `indexation_clauses`, `tce_data_quality`, `auxiliary_energy_profiles`, `grid_connection_queues`, `reroute_events`, `eudr_plot_claims`/`custody_chains`. Zero of ten proposed tables exist in any migration. This is a fully-specced, operator-facing revenue mechanism (the surcharge-audit "flywheel effect… saves real cash") that never left the design doc.
2. **ADR-015's two "owed invocation surfaces" for manual intake remain unbuilt a second time.** ADR-012 promised an admin control + script path (2026-07-11); ADR-015 (2026-07-18) found neither was ever built and re-promised them as debts the crawl rebuild would discharge. The full-read audit (2026-08-31) confirms `/api/admin/run-intake` is still WORKING-UNWIRED with zero frontend or workflow callers — the same promise, made twice, still broken six weeks later.
3. **ADR-014's wave-acceptance sampling was ratified as "wired" and is not.** The ADR's status note asserts the mechanical half is "wired and proven"; `wave-acceptance-audit.mjs` self-declares SCAFFOLD/NOT WIRED/Status:proposed. A governance document's own acceptance claim is contradicted by the artifact it accepted.
4. **The obligation register — spec-01's entire core build ("NET NEW, the core build") — is unbuilt.** `binding_position` exists only as an unused enum value; no `obligations` table, no cost formulas, no applicability model, no four-date model. This is the field the spec calls "the product's core insight" and "more important than any UI work" (01:50).
5. **Market Intel's two named differentiators are both unbuilt**: the carbon-cost-per-FEU overlay ("the differentiating component… nobody else does this") and the lead-time chart ("the contract's third clause… zero implementation," confirmed by the spec's own grep finding zero hits for "lead time"/"competitor"/"adjacent" anywhere in the market tree).
6. **Research's assumption register and signposts are unbuilt**, which the spec itself says is the difference between "here's a thing" and "here's the thing in your plan that breaks" (03:159) — the mechanism that makes the entire Research contract non-generic is absent.
7. **Operations' automate-vs-hire TCO panel (`breakeven_wage`/`breakeven_utilisation`) is unbuilt.** The spec names this "decision 1" of the surface's stated purpose and says it "has no home" in the current schema (fixed six-value CHECK constraint with no slot for it).
8. **Community's antitrust posting guard is unbuilt**, despite spec-05 calling it "the one thing that can end the product" and requiring it be "designed in before anything else." No write-time k-anonymity/dominance-cap enforcement exists anywhere in the schema or code.
9. **The Regulations obligation cost model, the four-date model, and the change feed with diff are all unbuilt** — three of spec-01's twelve required components, none superseded, none ruled out, all still exactly as gapped as the spec's own 2026-08-12 self-assessment.
10. **DP-1 (Single-Pane Operator Review) compliance is unverified and its own violation example is not confirmed fixed** — a binding cross-sprint design principle whose stated Phase-7 target state was never checked against current code by any of the 19 audit lanes.
11. **The anti-parking invariant, promised in the 2026-07-06 decision package's "path to zero in-work," is explicitly not wired** — its own code comment says so, seven weeks after the package that promised it.
12. **spec-06's Phase 1 acceptance gate (`surface-acceptance.mjs`) and spec-08's falsification-test suite are both unbuilt** — the mechanism that was supposed to make every other gap in this register mechanically self-reporting does not itself exist, so none of the other 40+ gaps here are CI-enforced; they were only found by full manual read.

---

## Coverage attestation

Files read: **39/39** (11 specs + 23 ADRs + 5 design markdown documents — `README.md`,
`DESIGN-DEVIATIONS.md`, `HANDOFF - Claude Code Prompt.md`, `decision-package-2026-07-06.md`,
`design-principles.md`). The 8 `Pages - NN *.dc.html` mock files and `support.js` in
`docs/design/redesign/` were not separately read as promise-prose per that folder's own `README.md`,
which declares them "MOCK RENDERING PLUMBING ONLY… never import them" — their promised content is
fully captured via `HANDOFF - Claude Code Prompt.md`, the build brief that specifies everything the
mocks show, template by template, including the explicit §7 "KNOWN NEW BACKEND WORK" list used above.

Lines read (full-file reads, summed from each file's final line number): specs 3,322 + decisions
2,010 + design 427 = **5,759 lines**, across 39 files, zero truncated reads.

Cross-referenced against: `full-read-audit-2026-08-31.md` (all sections), 13 of the 19 per-lane reports
(L01, L03, L06, L07, L09, L10, L11, L12, L13, L14, L17, L18, L19 — the lanes covering app/api/components/
lib/scripts/discipline/migrations, i.e. every lane a spec or ADR promise could land in), and
`table-usage.txt` (all 89 tables). Direct greps against `fsi-app/` (branch master) confirmed table/file
existence for every UNBUILT verdict above.
