# Caro's Ledge system map, 2026-10-04

Built from the vault, not from memory. Evidence tokens: `[V date]` = stated in a vault doc of that date and
not re-checked by me today; `[C]` = I checked it in code today; `[DB]` = live count from today's read-only
inventory (pending where blank). Nothing below is a proposal. Section 15 lists every element in the repo
and where it sits in this map; section 16 lists what I could not place.

Sources read in full for this map: stage audit 2026-09-18 (s1 to s6), audit-consolidated-2026-09-30,
architecture-review-2026-09-30, system-review-2026-09-01, wiring-audit C1 loop map, supabase integrity
audit 2026-09-25, complete-build-plan-2026-10-01, build-overview-2026-09-30, data-machine-tool-gaps,
learning-loop-design + ADR-036, CORPUS-TURN / POPULATION-TURN / PROPAGATION-DRAIN runbooks, MAINTENANCE
runbook sections 2, 13 to 16, 46, 46a, PROGRAM-BOARD head, lane logs 2026-09-28 to 2026-10-03, specs 00
to 10, the skills, ADRs 016 to 042.

Standing constraints that bound everything below
- R14 (operator, 2026-09-25): tools first, no live data population until the tools are complete.
- Rule 16: no schedules during build; every runtime by dispatch or by event chain.
- Rule 17: nothing runs alone; a mint is not done until connected and recorded.
- Rule 18: find the source and rate it; never refuse a figure for a low tier.
- ADR-041 Community is social only. ADR-042 external data only. ADR-043 (in flight) no typed input.
- Everything is free: session Haiku and Sonnet lanes, never the metered API.

---

## 1. Sources and tiers

Designed: source-credibility-model skill (six elements, base_tier and effective_tier, discovery loop,
promotion at 2.5 / 0.65 / 3+ citations, demotion, bias tags, reputation audit trail).

Built
- Registry: `sources`, `institutions`, `source_tier_opinions`, `source_bias_tags`, `source_trust_events`,
  `source_citations`, `provisional_sources`, `canonical_source_candidates`.
- Class table (SC-13 + D14 residue ruling): `src/lib/sources/host-authority.ts` `classTierForHost`, eight
  deterministic rules incl. the `company` class at T7. Free, no model. [V 09-13]
- Tier rating by class: `scripts/lib/rate-source-by-class.mjs` (used by state-cost, ETS-proxy and research
  walker producers). [V 10-02]
- Tier opinions: `scripts/maintenance/tier-opinions.mjs`, 371 rows written 2026-09-05; chained in
  `downstream-chain.yml`. Opinions never write base_tier. [V 09-18]
- Institution canonicalisation: `institution-canonicalize.mjs` Part C (T4 standards-body override applied).
- Provisional resolver: `scripts/maintenance/resolve-provisional-sources.mjs` (rules a, b, d; free; shares
  `promote-provisional.ts` with the admin promote route). [V 09-13]
- Bias tags: Haiku recommendation cached at classify, written to `source_bias_tags` at candidate approval
  (`bias-tag-pipeline.mjs`, PR 834); confirm/reject route for low-confidence tags. [V 09-29]
- Trust score: `src/lib/trust.ts` computed live; `/api/admin/recompute-trust`; `trust-recompute.yml`
  (dispatch only, cron disarmed).
- Admin: Sources tab, provisional review card/table, canonical source review, tier override, tier
  opinions, bulk import, pause, visibility.

Connected: class table feeds heal STEP SOURCE, attach-found-sources, tier-opinions, resolver, producers.

Not connected / not run
- Source growth from briefs: `registerCitedSources` (`source-growth.ts`) is called only from the retired
  paid generate path in `canonical-pipeline.ts`. The free record-briefs path does not call it. [C]
- `evaluatePromotion` / `evaluateDemotion` (`trust.ts`): no caller outside recompute-trust admin route. [C]
- 489 `provisional_sources` pending since April-June; the resolver has dry-run evidence (run 34724257806,
  34728958591) and no recorded apply. PROGRAM-BOARD Unit 1 is still QUEUED. [V 09-13, DB pending]
- Reputation audit insert rejected by `source_trust_events_created_by_check` and swallowed. [earlier this
  session, C]
- Research walker rejects an OpenAlex candidate whose publisher is not registered as `unsourced` instead
  of registering and rating the publisher (rule 18 gap). [V 10-02]
- Bias tags have a writer now but no customer-facing reader. [earlier this session, C]
- `sources.reliability_score` dead column (2,572 rows at default). [V 09-30]
- No loop hop covers source discovery, promotion or demotion. [C, 11 hop files]

## 2. Collection

Designed: spec 08 Loop A stage A1; scrape-and-build plan 2026-07-19 (B1 to B4).

Built
- `source-sweep.yml` -> `run-source-sweep.mjs`: walkers register-eurlex, register-federal-register, feed,
  research, sitemap; writes `portal_link_candidates`; coverage columns on `sources` (migration 304).
- `fetch-drain.yml` (chained off Source sweep).
- Access-wall detector `access-wall.mjs`; API transports for federalregister.gov and ecfr.gov; EUR-Lex
  TXT/HTML rewrite.
- Change detection: `/api/worker/check-sources`, `/api/worker/reconcile`, `change-detection.yml`,
  `source-monitoring.yml`. Held off by rule 16 (expected).
- Research walker `research-walker.yml` (dispatch only; two dry fixture runs). [V 10-03]
- Producers (structured data): `producers.yml`, 11 producer steps (ECB FX, EIA v2, EU oil bulletin,
  carrier ETS surcharge, BLS OEWS, Eurostat LC and NRG, DESNZ and EPA factors, state cost, SBTi dry-only).

Not run / not connected
- Sitemap backfill: 2,201 of 2,572 sources never walked. [V 09-18, DB pending]
- Feed walker failed its only run (403); research sweep walker never dispatched. [V 09-18]
- EIA blocked on a secret; EEX no licence; SBTi apply refused on licence. [V 10-03]

## 3. Intake and mint

Built
- One chokepoint: `src/lib/intake/mint-item.ts` `mintIntelligenceItem` (inline discovery, forward events,
  entity linking, timeline). `apply-staged-update.ts`, `run-intake-cycle.ts`, `portal-harvest.ts`.
- `ledger-consume.yml`: free session-verdict classification (`ledger-verdicts-NNN.json`), max-promote cap,
  record-only mint. Apply arms only with a named verdicts file.
- `population-turn.yml`: census export -> mint batch -> apply -> reconcile -> mandatory flywheel step ->
  outcomes. THE GATE refuses a new batch while a prior one is unconnected.
- `census_worklist`, `corpus_turn_requests` (trigger-filled ticket queue).

Not run
- Candidates promoted: 3 of ~57,000; `would_mint` 3,461. [V 09-18, DB pending]
- Migration 299 (146-item re-mint) unapplied; held by R14.
- 2026-09-29 chained-apply incident: 33 items + side rows; reversal script built, execution status to
  confirm. [V 09-30, DB pending]

## 4. Grounding and provenance

Built: `canonical-pipeline.ts` ground stage, `ledger-apply.mjs` (non-destructive), `validate_item_provenance`
(7 criteria), `item_type_required_slots` (48), Gate A scanner + `item_gate_a_state`, quarantine with
dwell audit and deferrals, `heal-provenance.mjs`, `attach-found-sources.mjs`, `agent_run_searches` pool,
`section_claim_provenance`, `claim_versions`.

Not finished
- Gate A two versions live (2,088 old / 602 new); `gate-a-rescan.yml` exists, never fired. [V 09-18]
- 746 orphan tokens across 120 items; attach-found-sources ran once. [V 09-18]
- 7 verified items with zero FACT claims. [V 09-18]
- 4 quarantined items genuinely past dwell. [V 09-28]

## 5. Briefs

Built: record-briefs free fleet (`scripts/turns/record-briefs/`, `apply-record-briefs.mjs`,
`brief-export.yml`, `brief-apply.yml`), pre-write slot validator, `checkBriefContent`, structured-action
extraction (PR 832), format dispatch per item type (`system-prompt.ts`, `agent/formats/`), Research Summary
planning-assumption line (L9).

State: 1,577 of 2,766 items carry stub briefs [earlier this session]; brief-apply last ran 2026-09-17.
Held by R14.

## 6. Connections (Loop A)

Built: `src/lib/connections/` (44 files): `discover.mjs`, `write-edges.mjs`, signal candidates and
auto-adoption, `anticipate.mjs`, gap detection; `item_cross_references` (one row per ordered pair);
`analyze-corpus.mjs`; tags (`tag-proposals`, `tag-ratification auto`); forward events
(`item_forward_events`); obligations (`derive-obligations`, `classify-binding-position.mjs` 16 rules);
5-axis classification (`propose/apply-classifications`); entity spine (`entities`, `entity_identifiers`,
`entity_refs`, `entity_scope`); corridor seeds; connections strip in the masthead (PR 800).

State: 23,715 edges, 23,709 untyped `related`; 181 scenario-tagged and 287 compliance-tagged items
[earlier this session, DB pending]. Typed, entity-mediated references per spec 00 S6 are not built.

## 7. Themes

Built: `connection_themes`, `connection_theme_runs`, `generate-theme-brief` maintenance step,
`/api/admin/themes`, `/api/admin/intersections`, ThemesView, IntersectionDetectionView.
State: 18 themes, 4 cross-surface, 9 theme briefs, shown on Research only. [earlier this session]

## 8. Propagation (Loop B)

Built: outbox trigger, `derivation_edges`, `derived_values`, `drain.ts`, `admissibleFor`, FLOOR, methods
registry (`carbon_intensity_tkm`, `automate_vs_hire` being retired, `signpost-watch`,
`infer-from-question`), `propagation-drain.yml` with the depth-4 explicit-dispatch workaround (F60),
statutory writer + admin rows route, `StatutoryFigure` / `EstimatedFigure` / `DerivedFigure`,
`/api/notices`, RecalculationNotice.

State: 22 derived values, 24 edges, 776 undrained events, 0 `market_series` edges, 0 statutory rows, 0
estimated rows; 8 drain runs, 1 with a real recompute. All 11 loop hops `enforceFired:false`. [C + V]

## 9. Learning loop (the part that makes the flywheel grow)

Designed: learning-loop-design-2026-09-25 (six steps), ADR-036.
Built (W2-G, merged): `src/lib/learning/` trigger-question generator wired as a step in
`run-population-flywheel.mjs` [C]; `seekAnswerForQuestion` in `seek-more.mjs`; `inference_records`
(migrations 338, 339) as a DAG participant; drain Pass 2 dispatches inferences; `/admin/inferences`.
Built (L6): `signposts` table and `signpost-watch` method.
Not built: prediction outcome scoring; `source_reliability_ledger`; any customer-facing inference render;
any step that proposes a NEW entity, material, theme or vocabulary term from repeated mentions.
Live rows: [DB pending].

Conflicts to rule
- ADR-036 decision 1 words acquisition as "operator-priced"; the standing ruling is that acquisition is
  free through session lanes.
- ADR-036 decision 3 makes reliability reweights ratification-gated; ADR-025 says deterministic
  derivations auto-adopt with no human gate.

## 10. Research assessment machine

Built (W2-R, L3, L5, L6, L8, L9, RA-WF): `research_assessments` (344), deterministic producer, OpenAlex
authority client, dissent panel, signposts list, history ledger, theme backfill script (apply disabled),
`research-assessment.yml` (one live dry dispatch: 10 candidates, 4 assessed, 6 refused, 0 written).
Planning-assumption register (345) was built and then removed by ADR-042.

## 11. The five pages and shared surfaces

- Regulations: list, detail, register (`/regulations/register`), obligations API. Obligation entity and
  binding_position as data: not built (L17).
- Market Intel: list, detail, series board, carbon cost overlay (list page only), lead-time chart (empty),
  corridor resolver (L-CORRIDOR). Record-grade items hide the findings section on detail.
- Research: list, detail with assessment rail.
- Operations: region x dimension matrix, labour chain (suppresses on live data), detail. Calculator being
  removed.
- Community: social only.
- Shared: dashboard, map, watchlist, search, Ask assistant, settings, onboarding, profile, org profile +
  applicability (W2-E), workspace tags, overrides, personal state, notifications, portfolio (not built,
  L18), RecordGradeBadge (regressed to zero live mounts as of 09-18, re-check).

## 12. Admin

Tabs and routes: attention, coverage, corpus-turn requests, forward events, integrity flags (resolve,
regenerate), intersections, themes, sources (all actions above), canonical sources, triage, users, scan,
run-intake, spot-check, statutory rows, b2 progress, factors page, inferences page, parts gallery.

## 13. Discipline engine and harness

`.discipline/`: fitness (F2 to F60), governance (invariants, doctrine register, loop manifest, closure
gate, execution wiring), rules, consistency checks, rendering and layout guard, hooks. Harness: 25 families
under `scripts/harness-runs/`, `harness_runs` table. Workflows: discipline, bug-class-guard, build-proof,
data-audit-lane, date-chain, spot-check-monthly, uptime-probes. Memory hooks and the ledger skill.

## 14. Tenancy

orgs, memberships, invitations, workspace settings, RLS. Two count RPCs lack a membership check; no
cross-org attack test. [earlier this session]

## 15. Element placement (mechanical inventory, 2026-10-04)

`src/lib`: sources, credibility, classification, coverage -> 1; intake, llm -> 3; agent -> 4 and 5;
connections, tags, forward-events, obligations, entities -> 6; propagation, statutory, figures, regional,
market, contracts -> 8; learning, research -> 9 and 10; operations, spec09 -> 11; community -> 11;
dashboard, detail, map, watchlist, workspace, profile, applicability, urgency, notifications, nav,
url-params, hooks, d3 -> 11; admin -> 12; auth, orgs, account, api -> 14; cache, perf, telemetry, health,
email, db, text, csv, jurisdictions -> infrastructure.
`scripts`: sources, turns (sweep, drain, consume) -> 2; mint, turns (population) -> 3; maintenance (61
steps) -> 1, 4, 6 by step; connections, forward-events, obligations, entities, classification -> 6;
producers, gen, propagation -> 8; research -> 10; spec09 -> 11; review -> 1; verify -> 13; harness-runs
-> 13.

## 16. Not yet placed or not yet read at line level

- `src/lib/urgency`, `applicability`, `coverage`, `learning` internals: placed by name, files not opened.
- `scripts/review/` (24 files) and `scripts/remediation`, `scripts/coordinator`: placed, not opened.
- Six open PRs (288, 341, 370, 391, 410, 454): not assessed.
- `/admin/factors`, `/api/admin/b2-progress`, `/api/admin/scan`: purpose not confirmed.
- MAINTENANCE runbook: 12 of 61 sections read in full.

## 17. Live counts, read-only inventory 2026-10-04 (replaces every "DB pending" above)

Source: the coordinator's read-only inventory of 2026-10-04. The inventory lists 110 public tables with exact counts. Its own
summary line says 160 tables and 36 empty, which contradicts its table (110 listed, 30 empty named); the
per-table rows are used here, the summary totals are not. Functions (235), item-type breakdown and flag
breakdown came back as samples, not complete, and are not used.

- Sources: 2,572. Active 1,989, of which 203 have ever been checked. Provisional 561. Suspended 22.
  `provisional_sources` 497 (newest row 2026-06-01). `source_tier_opinions` 371. `source_bias_tags` 2,895.
  `source_citations` 742. `source_trust_events` 908 (newest 2026-09-18). `source_verifications` 1,414
  (newest 2026-05-04). `canonical_source_candidates` 331 (newest 2026-04-28). `institutions` 462.
- Collection: `portal_link_candidates` 57,472. `pending_first_fetch` 1,388. `monitoring_queue` 580
  (newest 2026-06-28). `raw_fetches` 679 (newest 2026-07-21). `system_state.scrape_cadence` off.
- Intake: `intelligence_items` 2,766, newest created 2026-09-04 (no mint in a month). `census_worklist`
  21,609. `staged_updates` 38. `corpus_turn_requests` 1,757.
- Grounding: `section_claim_provenance` 34,025. `agent_run_searches` 6,597. `item_gate_a_state` 2,690.
  `claim_versions` 949. `integrity_flags` 11,223.
- Connections: `item_cross_references` 23,715. `item_forward_events` 1,336. `obligations` 1,336.
  `entities` 2,880. `entity_scope` 8. `connection_themes` 18. `theme_briefs` 9.
- Propagation: `propagation_events` 2,782. `derived_values` 22. `derivation_edges` 24. `market_series`
  2,747 (newest 2026-09-16). `emission_factors` 13. `regional_data_facts` 90. `state_cost_facts` 13.
  `statutory_computations` 0. `estimated_values` 0. `published_price_statistics` 10.
- Learning and research: `inference_records` 0. `signposts` 0. `research_assessments` 0.
- Spec 09: `oem_tech_roadmaps`, `grid_connection_queues`, `reroute_events`, `auxiliary_energy_profiles`,
  `indexation_clauses` all 0.
- Workspace: `organizations` 1, `org_memberships` 2, `workspace_tags` 0, `item_workspace_tags` 0,
  `user_item_state` 0, `workspace_item_overrides` 4, `user_watchlist` 1, `org_watchlist` 0,
  `notifications` 0.
- Community: `community_groups` 7, `community_posts` 0.
- Harness: `harness_runs` 40 (newest 2026-10-03). No pg_cron jobs.

## 18. Addendum after the line-by-line pass (2026-10-04, later)

Section 16 is closed: urgency, applicability, coverage, learning, scripts/review, scripts/coordinator, all
61 MAINTENANCE runbook sections plus appendices, and the six old PRs are read.

Corrections to this map and to my human-gate list
- ADR-030 rider (2026-09-12) already removed several gates: tag-ratification auto decides every proposal;
  apply-classifications decides every proposal incl. scope_topics and jurisdiction_iso; resolve-signals
  closes every signal flag; canonical-autoverify rules every canonical candidate with no human outcome.
  These are NOT human gates today.
- Human gates that remain, confirmed in code or runbook: review-apply-provisional-sources,
  review-apply-portal-links, review-apply-coverage-gaps (operator-ruled JSON files, `ruling.mjs`);
  unknown-host worklist ("coordinator rules host classes, never delegated to a model");
  census-off-vertical ruling R-A open (1,655 off-vertical rows, archive or park);
  arg tokens on origin-class-backfill, w1-dispositions, refetch-capped (GUARD-1), provenance-heal
  `+strip-unprovable`; ratify-flag-to-census (operator marker); ledger-consume apply arming (named verdicts
  file); low-confidence bias tag confirm; tier opinions never move base_tier; trigger-question acquisition
  (`QUESTION_ACQUISITION = "operator-priced-only"`, flag text "for operator review, never auto-answered").

New facts
- Typed connections exist as a capability (`classifyRelationship` / `planLinkWrites`, PR 481) and a free
  whole-corpus backfill exists (`backfill-lineage-edges`), never run to completion. That is why 23,709 of
  23,715 edges are `related`.
- `origin_class` NULL on 1,222 items (2026-09-05); the backfill is a re-dispatch.
- `source_role` NULL on 874 sources (2026-09-06); `source-role-cleanup` is the free fix.
- `record-hollow-sweep` would wrongly archive 5 oil-bulletin series items; flagged 2026-09-05, fix status
  unverified.
- Coverage Index (`src/lib/coverage/index-data.ts`): a catalogued-pointer layer over `census_worklist`
  would_mint rows, mounted inside the surfaces. Region coverage rollup (`coverage-gaps.ts`) feeds the map.
- Applicability gate (`compute-applicability.mjs`) is pure and built; it needs obligations to carry
  roleScope / sizeThreshold, which nothing produces yet.
- Trigger questions fire on mint only; the six propagation event types are reserved, not wired.
- Deadlines: legacy-remediation deferrals and the layout-guard baseline both expire 2026-10-15.
- Old PRs 288, 341, 370, 391, 410, 454: content already on master by other commits; all six are stale.
