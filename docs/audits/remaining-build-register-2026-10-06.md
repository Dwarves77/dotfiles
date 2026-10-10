# Remaining build register and proof status, 2026-10-06

> Landed in docs/audits/ on 2026-10-08 by the coordinator disposition lane DISPO-3 from the register's scratch copy (source path: fsi-app/scripts/tmp/remaining-build-register-2026-10-06.md). The body below is the register verbatim; only disposition tokens were appended where the rule 13 checker required them. Statements below about a scratch location or a gitignored copy describe where the file lived before it landed.

Read-only compile. Master tip read: origin/master after `git fetch` on 2026-10-06 (tip b1e7d083 plus later merges 958, 960, 961 per `gh pr list`). Written to the gitignored scratch path (`git check-ignore -v` returned `.gitignore:25:fsi-app/scripts/tmp/`).

Status tokens (rule 14): `[C: method]` = confirmed by the named method in this pass. `[H]` = hypothesis, not verified in this pass. Nothing is stated without one.

Proof ladder: L0 none. L1 unit or fixture tests in CI. L2 runtime fired once in CI in dry mode with an artifact. L3 ran against a branch copy of the database. L4 ran against live data. L5 result visible on the live site and checked by the live smoke gate.

Bottom line, unflattering: of 48 tracked items, 0 are at L3 and 0 are at L5. 24 are at L1 (tests only), 1 at L2, 2 at L4, and 21 are L0 (nothing built or nothing run). Every Stage 1 to 7 lane was "fixture-proven and dry" by design; none has touched a branch database. The branch-database proof (lane L20, Stage 9 item 1) has no file in the tree. [C: `git ls-tree -r origin/master` search for fixture-chain-proof returned nothing]

---

## 1. Summary counts

Item = one row of the section 2 stage table (plan bullets, with Stage 5, 7, 8 and 9 split into their named lanes or ordered steps). Total 48.

| State | Count | Rows |
|---|---|---|
| Built, merged | 24 | S0-1 to S0-4, S1-A to S1-E, S2-1 to S2-3, S3-1, S3-2, S4-1 to S4-4, S6-1 to S6-3, S7-1, S7-2, S8-6 |
| Built, merged, partial | 1 | S8-7 (obligation) |
| Built, open PR | 2 | S5-1 G5-TERMS (PR 959), S7-3 G7-UI (PR 962) |
| In progress (code being written) | 0 | none |
| Briefed or ruled, not executed | 1 | S6-4 trust-recompute retirement |
| Not started | 20 | S2-4, S5-2, S5-3, S5-4, S8-1 to S8-5, S8-8 to S8-10, S9-1 to S9-8 |

[C: counts derived from the section 2 table; merged and open PR status from `gh pr list --state merged --limit 140` and `--state open`]. Open PRs on 2026-10-06: 959 (G5-TERMS, migration 355) and 962 (G7-UI). [C: gh pr list --state open]

Proof-level histogram (48 items):

| Level | Items | Meaning here |
|---|---|---|
| L0 | 21 | not started, or ruled and not executed |
| L1 | 24 | merged with tests only; nothing fired |
| L2 | 1 | S1-E source-resolution dry dispatch |
| L3 | 0 | nothing has run against a branch database |
| L4 | 2 | S0-1 (migration 350 applied and in list_migrations), S8-7 (obligations table populated, 1,336 rows per 2026-10-04 inventory) |
| L5 | 0 | no built item has a result checked on the live site by the live smoke gate |

Caveat on L4: migrations 351 to 356 are applied live (section 6), so the schema half of Stages 3, 4, 6 and 7 is at L4, but the code that uses those tables has never run against live data; each item is scored at its code level. [H: scoring is mine, applied uniformly]

Other counts:
- Workflows: 31 under `.github/workflows`. Never run: 3 (layout-baseline-renewal, question-answers, theme-briefs). [CONFIRMED: gh run list per workflow, section 5] [WORK: DORMANT-1]
- Loop hops in `loop-hops.d`: 13. `enforceFired` true: 2 (hops 01 and 04). `enforceFired` false: 11 (hops 02, 03, 05, 06, 07, 08, 09, 10, 11, 12, 13). [C: grep of `enforceFired` in `fsi-app/.discipline/governance/loop-hops.d/*.json` on origin/master]
- Migrations: every migration file on master numbered 351 and above is applied; 355 is applied live but its PR (959) is not merged. See section 6.
- Design changes owed: one request file, 16 artboard sections, 69 numbered or lettered items, about 21 lines tagged LOGGED and 9 DERIVED. [C: grep counts on `fsi-app/scripts/tmp/claude-design-request-2026-10-06.md`; the file is untracked on master]

---

## 2. Stage table, stages 0 to 9

Columns: bullet | state | PRs | proof | what is unproven | blocker. Plan source: `docs/plans/buildout-plan-2026-10-04.md`.

### Stage 0 tidy

| Id | Bullet | State | PRs | Proof | Unproven | Blocker |
|---|---|---|---|---|---|---|
| S0-1 | Migration 350 applied; six stale PRs closed | merged | 922, 923 | L4 [C: 350 present in list_migrations] | that no live row still carries automate-vs-hire values after 350 (no post-apply read in the logs) | none |
| S0-2 | Exempt series items from hollow-record sweep | merged | 925 | L1 | sweep never run live against the 5 oil-bulletin series items [H: "fix status unverified" per system map] | none |
| S0-3 | Chain manifest in line with what has fired | merged | 934, 936, 938, 940 | L1 | 11 of 13 hops still `enforceFired:false`; hops 01 and 04 only are enforced fired [C: grep] | hops need chained firings with `harness_runs` evidence, which build mode (rule 16) prevents |
| S0-4 | Layout-baseline expiry and deferral expiry 2026-10-15 | merged tool, event unfired | 927 | L1 | `layout-baseline-renewal.yml` never run [C: gh run list empty]; renewal task due 2026-10-08, hard expiry 2026-10-15; closure-gate registration for it not added (S0-B log open item) | date; needs write-set expansion to `closure-gate.mjs` |

### Stage 1 source loop

| Id | Bullet | State | PRs | Proof | Unproven | Blocker |
|---|---|---|---|---|---|---|
| S1-A | Free brief path registers and rates every cited source; reputation audit label accepted | merged | 926 | L1 | no live apply; pending marker `brief-apply/pending/2026-10-04-s1a-source-register.md` owes the next brief-apply run | population gate |
| S1-B | Host verdict batches; bias tags on machine promotion; tier override respected | merged | 928 | L1 | no real verdict batch authored; no live run; `ProvisionalReviewCard.tsx` copy still says 0.65 to 0.79 band proposed on approval | population gate |
| S1-C | Promotion and demotion on effective tier; recompute as maintenance step and chain link | merged | 929, 955 | L1 | `maintenance:recompute-tiers` never dispatched (closure gate NEVER-RUN eligible) [H: not re-read in the gate today]; citer-weight feedback loop untested | population gate |
| S1-D | Research walker registers and rates unknown publisher | merged | 931 | L1 | research-walker last ran 2026-10-03, before 931 merged on 2026-10-04 [C: gh run list], so the new behaviour has not run in CI | none, a dry dispatch would move it to L2 |
| S1-E | Discovery, promotion, demotion as chain links; bias and tier shown to customers on every item | merged | 948 (chain), 944 (display), 947 (grade chip) | L2 for the chain link: `source-resolution.yml` dry dispatch success 2026-10-06 [C: gh run list]. L1 for display | chained firing off Brief apply or Research walker never exercised on a real event; hops 12 and 13 `enforceFired:false`; per-claim tier matching against live rows unverified (P1 log); sources other than the item's own show no bias | needs chained firing; display needs a live read |

### Stage 2 typed connections

| Id | Bullet | State | PRs | Proof | Unproven | Blocker |
|---|---|---|---|---|---|---|
| S2-1 | Relationship typing at mint and in the free brief path | merged | 933 | L1 | record-grade `full_brief` alone yields 0 typed edges in fixtures (S2-A log); never run live | none |
| S2-2 | Store the strongest signal discovery computes instead of generic type | merged | 933 | L1 | [H: S2-A log line 37 says the strongest signal is the highest-weight entry; not verified end to end] | none |
| S2-3 | Named absent parent instrument becomes a discovery target | merged | 933 | L1 | `planLineageGapTargets` is pure code; consumer wiring (G5-NEED lineage-gap-targets) not written | G5-NEED |
| S2-4 | Whole-corpus typing backfill | not started (held to stage 9) | none | L0 | 23,709 of 23,715 edges untyped as of 2026-10-04 [V 10-04 inventory] | stage 9 order |

### Stage 3 cross-page analysis

| Id | Bullet | State | PRs | Proof | Unproven | Blocker |
|---|---|---|---|---|---|---|
| S3-1 | Intersection detection across the four intelligence pages | merged | 937 | L1 | no live run, no migration | none |
| S3-2 | Theme briefs for every theme, shown on every page a theme touches | merged (mechanism) | 939, 941, 942 | L1 | no real brief authored; `theme-briefs.yml` never run; 9 theme briefs live, pre-contract; Research reader selects only exact-id brief row; no live-data check of the section; workflow not chained | population stage; `.tsx` change not in lane file |

### Stage 4 learning loop

| Id | Bullet | State | PRs | Proof | Unproven | Blocker |
|---|---|---|---|---|---|---|
| S4-1 | Questions fire on value change as well as mint | merged | 943 | L1 | chained firing runs dry while `scrape_cadence=off`; outbox rows from market_series and regional_data_facts carry no entity so reach no item | design of single-entity outbox for those two tables |
| S4-2 | Answers from held pools; residue to session lane | merged | 946 | L1 | no real answer authored; `question-answers.yml` never run [C: gh run list empty]; not chained to the drain | chaining decision |
| S4-3 | First inference written from an answered question, cited and shown | merged | 946, 947 | L1 | `inference_records` was 0 rows on 2026-10-04; inference read sits inside a 300 s cached bundle; citation titles print as text | none |
| S4-4 | Predictions scored; reliability ledger adjusts weighting; outcome-driven tier movement | merged | 950 | L1 (migration 353 applied, L4 for schema only) | `signposts` 0 rows; lifecycle transition not retried (needs `signposts.lifecycle_applied_at`); never run | next migration lane |

### Stage 5 growth

| Id | Bullet | State | PRs | Proof | Unproven | Blocker |
|---|---|---|---|---|---|---|
| S5-1 | G5-TERMS: repeated unknown mentions counted, proposed, adopted by rule | built, open PR | 959 (migration 355 applied live before merge) | L1 | not merged; never run | PR 959 merge |
| S5-2 | G5-READ: readers honour adopted terms; migration 357 entity_kind material and theme CHECK to registry | not started | none | L0 | everything | coordinator brief "to write" [C: coordinator state file] |
| S5-3 | G5-NEED: term-need namespace, walker wiring, `--holdings-needs`, lineage-gap-targets consumer | not started | none | L0 | everything | brief to write |
| S5-4 | G5-SEARCH: session URL batch for needs including flywheel-gap; joins drain kinds | not started | none | L0 | everything | after G6-DRAIN (merged) |

### Stage 6 remaining gates removed

| Id | Bullet | State | PRs | Proof | Unproven | Blocker |
|---|---|---|---|---|---|---|
| S6-1 | Three ruling-file queues decide by rule or lane verdict | merged | 956 | L1 | no live run; `apply-deferrals` default path only chains inside one run | none |
| S6-2 | Acceptance tokens off maintenance steps | merged | 956 | L1 | GUARD-1 token (ADR-016 item b) still open; provenance-heal `+strip-unprovable` opt-in still owed [C: coordinator state "Owed: GUARD-1 token ... strip-unprovable opt-in"] | owed work |
| S6-3 | Scheduled judgement drain built with kill switch, off | merged | 958 | L1 (migration 354 applied live, switch off, L4 for schema) | production deps (`runExporter`, lease client) proven only on injected fakes; no network or db run; ledger-candidate export needs session egress | switch stays off by ruling |
| S6-4 | Retire `trust-recompute.yml` (ruled Option 1) | ruled, not executed | none | L0 | workflow file still present on master [C: ls-tree listing shows trust-recompute.yml]; closure-gate entry unchanged | execution lane |

### Stage 7 admin override

| Id | Bullet | State | PRs | Proof | Unproven | Blocker |
|---|---|---|---|---|---|---|
| S7-1 | Every automatic tier writer respects tier override | merged | 955 | L1: attack tests `tier-override-attack.npmtest.mjs`, 10 tests, control plus attack per writer (rule 15 shape, but against fakes, not the database) | no attack against a branch or live database | none |
| S7-2 | Correction layer for item data, preserved through re-runs, audit trail | merged | 957 (migration 356 applied) | L1 (schema L4) | SQL never ran on a database before apply; apply-time self-check NOTICE output not recorded in the log; unmatched fact corrections are reported (`orphaned`), not repaired | none |
| S7-3 | Admin screen for corrections (G7-UI) | built, open PR | 962 | L1 [H: CI state not read] | not merged | PR 962 merge |

### Stage 8 workspace and pages (detail in section 3)

| Id | Bullet | State | PRs | Proof | Unproven | Blocker |
|---|---|---|---|---|---|---|
| S8-1 | Private per-workspace notes at bottom of any item | not started | none [C: no notes table or route found in tree search] | L0 | everything | needs lane |
| S8-2 | Multi-person assignment with notification | not started | none [C: no assignment files found; notification code is Community only] | L0 | everything | needs lane |
| S8-3 | Tag attribution | not started | none [H: `workspace_tags` migration 313 and tables exist, 0 rows 2026-10-04; attribution field not checked] | L0 | everything | needs lane |
| S8-4 | Membership checks on the two count RPCs | not started | none [H: system map section 14 says two lack a check; not re-read] | L0 | everything | needs lane |
| S8-5 | Cross-organisation attack test | not started | none [C: no such file found] | L0 | everything | needs lane |
| S8-6 | Grade chip restored on live list and detail | merged | 947 | L1 | chip on live pages never checked by the live smoke gate (it checks overflow and admin gate, not content) | none |
| S8-7 | Obligation first-class with binding position | merged, partial | pre-existing (migration 290, derive-obligations, classify-binding-position, register page and API) | L4 for the table: 1,336 obligation rows [V 10-04 inventory] | [H: 4-instrument decomposition and the detail-page binding banner not verified]; applicability gate lacks roleScope inputs | needs verification pass |
| S8-8 | Portfolio | not started | none [C: no portfolio file in tree] | L0 | everything | needs lane (L18) |
| S8-9 | Five public-data domains | not started (tables only) | tables from migrations 296 to 298 | L0 | all five spec 09 tables were 0 rows on 2026-10-04 [V]; no producers found [H] | needs lanes |
| S8-10 | Industry-level statements replace removed calculator | not started | calculator removed in 922 | L0 | everything | needs design and lane |

### Stage 9 prove, then populate

| Id | Bullet | State | PRs | Proof | Unproven | Blocker |
|---|---|---|---|---|---|---|
| S9-1 | Fire whole chain end to end on a branch database | not started | none [C: no fixture-chain-proof.mjs in tree] | L0 | the only autonomous chain attempt (2026-09-29) was caught mid-flight in production | needs L20 lane and all prior layers |
| S9-2 | Switch on the drain | not started | none | L0 | everything | after S9-1 and build complete |
| S9-3 | Sitemap walk | not started | none | L0 | 2,201 of 2,572 sources never walked [V 09-18] | order |
| S9-4 | Gate A rescan | not started | none | L0 | `gate-a-rescan.yml` last ran 2026-09-29 | order |
| S9-5 | Source promotion | not started | none | L0 | 497 provisional sources, resolver never applied [V] | order |
| S9-6 | Candidate promotion | not started | none | L0 | 3 of about 57,000 promoted [V 09-18] | order |
| S9-7 | Typing backfill | not started | none | L0 | same as S2-4 | order |
| S9-8 | Record-to-brief upgrades | not started | none | L0 | 1,577 of 2,766 items carry stub briefs [V earlier this session] | order |

---

## 3. Stage 8 spec requirement register

Reference: `docs/plans/complete-build-plan-2026-10-01.md` section 1 (54 requirement rows). Plan states are as of 2026-10-01 and carry the plan's own tokens; the "now" column is my 2026-10-06 reading from merged PR titles, session logs and file searches. Proof level uses the ladder above.

| Ref | Requirement | Plan state 10-01 | Now (10-06) | Level | Evidence for "now" |
|---|---|---|---|---|---|
| 00S1 | Entity spine, nine kinds, crosswalk | partial | partial: entities 2,880 (10-04); asset, method, technology, person tables (L19) not found | L4 partial | [C: no PR for L19; H: attribute tables] |
| 00S1.3 | Composite hierarchy and alias table | missing [H] | still unverified | L0 | [H] |
| 00S2 | Number envelope | built-and-proven [AUDITED] | built; not wired into every number | L1 | plan |
| 00S3 | Six vocabularies | built-and-proven [AUDITED] | built | L1 | plan |
| 00S4 | Coverage honesty, six-state vocabulary, Coverage surface | partial [H] | partial; Coverage Index exists (system map section 18); first-class surface unverified | L1 | [H] |
| 00S5 | Portfolio object | missing, laned | not started | L0 | [C: no file] |
| 00S6 | Typed cross-references | partial | typing at mint merged (933); 23,709 of 23,715 live edges untyped | L1 | [C: PR 933; V inventory] |
| 00S7 | Assistant guardrails | built-unproven | unchanged; grounding "not verified end to end" | L1 | plan |
| 00S8 | `surface-acceptance.mjs` coherence test | missing [H] | no evidence built | L0 | [H] |
| 01S3.2 | Obligation as atomic unit | missing [H] | table, derivation, register page and API exist; plan row stale [C: file listing] | L4 | [C: tree search] |
| 01S3.2 | `binding_position` field | missing [H] | classifier with 16 rules and DB column used by register; stale plan row [C: classify-binding-position.mjs exists] | L4 [H] | needs live read of non-null rate |
| 01S3.3 | Four distinct dates | partial [H] | unverified | L0 | [H] |
| 01S3.4 | Three cost slots, formula only | partial | FuelEU only; others unconfirmed | L1 | plan |
| 01S4 #1 to #12 | 12 regulation components | missing or partial | #10 structured actions (832); rest unconfirmed; PPWR gate strip reverted (917) | L1 partial | [C: PR list] |
| 01S7 | 10 acceptance criteria | missing | not an executable test | L0 | plan |
| 02S1 | Envelope on every figure | partial | ECB, oil bulletin producers; EIA blocked on secret; EEX no licence; SBTi apply refused on licence [V 10-03] | L4 partial | system map |
| 02S6 r2 | Corridor rate board | RETIRED | retired | n/a | ruling |
| 02S6 r3 | Carbon cost overlay per corridor and FEU | built-and-proven [AUDITED] | producer 827, verify 903, corridor resolver 912; detail-page figure not checked live | L1 | [C: PR list] |
| 02S6 r4 | Signal feed promotion state, chip inversion | partial [H] | chip fix in L10 (904 merged) | L1 | [C: PR 904] |
| 02S6 r5 | Lead-time chart | missing [H] | chart merged (904) and empty: SBTi producer dry-only | L1 | system map "lead-time chart (empty)" |
| 02S6 r1/9/10/11 | Ribbon, policy timeline, methodology drawer, freshness panel | mixed [H] | unverified | L0 | [H] |
| 02S9 | Market series producers | partial | producers.yml last dispatch 2026-09-05; market_series 2,747 rows newest 2026-09-16 [V] | L4 | [C: gh run list] |
| 02S8 | 10 acceptance criteria | missing | not a gate | L0 | plan |
| 03S1 | Assessment as atomic unit | in-flight | merged 887; `research_assessments` 0 rows on 2026-10-04; one live dry dispatch: 10 candidates, 4 assessed, 6 refused, 0 written | L2 | [C: gh run list research-assessment 10-03 success; V counts] |
| 03S2 | Maturity triple | in-flight | in 887; DOE ARL 17-dim scope unconfirmed | L2 | plan |
| 03S3 | Horizon band and R1 to R4 | in-flight | in 887 | L2 | plan |
| 03S4 | Split credibility, authority client | in-flight | authority client merged (891) | L1 | [C: PR 891] |
| 03S5 | Assumption register | in-flight | built (877, 894), then removed by ADR-042 (planning-assumption register 345 removed); the Research planning-assumption line in L9 | superseded [H] | system map section 10 |
| 03S6 | Forecasting refusal state | missing [H] | unverified | L0 | [H] |
| 03S7 #1 to #12 | 12 research components | missing | L5 components merged (897: dissent panel, signposts list, history ledger); others unverified | L1 partial | [C: PR 897] |
| 03S8 | Free intake stack | missing | research walker merged (898); two dry runs; no standing intake by design | L2 | [C: gh run list 10-03 x2 success] |
| 03S9 | 12 acceptance criteria | missing | not a gate | L0 | plan |
| 03 note | Theme hides unmatched content; Unclassified band | missing fix | backfill merged (896, apply disabled); 47 null themes live on 10-01 [V] | L1 | [C: PR 896] |
| 04S1-2 | Dimension by region matrix | built-and-proven | built; EU and US data hole remains | L1 | plan |
| 04S5 | Labour chain | missing | merged (906); "suppresses on live data" [V system map] | L1 | system map section 11 |
| 04S4, S6 #6 | Automate-vs-hire TCO | built-unproven | RETIRED by ADR-043 (922) | n/a | [C: PR 922] |
| 04S6 #8 | Feasibility gates | missing | built in 911, then page-local gate strip reverted in 917; not live | L0 | [C: PR 917 title] |
| 04S6 #9 | Materials to PPWR join | missing | built in 911, reverted in 917 | L0 | [C: PR 917 title] |
| 04S7 | EU and US data producer | in-flight scaffolding | state_cost producers fixture-only; `regional_data_facts` 90 rows, no consumer after ADR-043 [V] | L1 | plan |
| 04S9 | 12 acceptance criteria | partial | #1 closed by 833 | L1 | plan |
| 05S1 | Antitrust guard | built-and-proven | migration 287 plus floor 347 applied; "no live subject today"; benchmarks removed by ADR-042 so nothing routes through it | L4 | [C: 915, 920] |
| 05S2 | Identity display rule | superseded | identity opt-in anonymity (336, 879) | L1 | list_migrations |
| 05S3 | House-seeded benchmark | missing | removed by ADR-042 (920) | n/a | [C: PR 920] |
| 05S4, S5 #10 | Promotion machine, editorial pickup | superseded by ADR-041 | removed (918) | n/a | [C: PR 918] |
| 05S5 #9 | Working groups | built | built; community_posts 0 rows [V] | L1 | system map |
| 05S6 | 9 acceptance criteria | missing | one partial | L1 | plan |
| 08S1 | Entity spine attribute tables | partial | see 00S1 | L4 partial | plan |
| 08S2 | Outbox, DAG, governed drain | built-and-proven | 22 derived values, 24 edges, 8 drain runs, 1 with real recompute [V]; clock-fired drain unarmed | L4 | system map section 8 |
| 08S3 | Lifecycle by admissibility, decay | built-and-proven | built | L1 | plan |
| 08S4 | Statutory and estimate isolation | built-and-proven | `statutory_computations` 0, `estimated_values` 0 | L1 | system map |
| 08S5 | Antitrust safeguards | built-and-proven | see 05S1 | L4 | plan |
| 09S1.1 | OEM equipment roadmap | missing, laned | table exists (296 to 298), 0 rows; no producer found [H] | L0 | [V inventory] |
| 09S1.2 | Carrier surcharge audit, pooling | missing, laned | table exists, 0 rows | L0 | [H] |
| 09S1.3 | Indexation clauses | missing, laned | `indexation_clauses` 0 rows; public-source intake owed | L0 | [V; buildout open items] |
| 09S1.4 | DQI and primary-data share | missing, laned | unverified | L0 | [H] |
| 09S1.5 | Auxiliary energy profiles | missing, laned | 0 rows; intake owed | L0 | [V] |
| 09S1.6 | Grid connection queue | missing, laned | 0 rows | L0 | [V] |
| 09S1.7 | Reroute multipliers | missing, laned | 0 rows | L0 | [V] |
| 09S1.8 | EUDR geo-traceability, book and claim | missing, laned | unverified | L0 | [H] |
| 09S2 | Read-time versus materialised | built-and-proven | view exists | L1 | plan |
| 10S3 | Factor-tier resolver and licence gate | built-and-proven | built; `emission_factors` 13 rows | L1 | plan |
| Dashboard | Digest and triage | built | built | L1 | plan |
| Map | Geographic view | built | built | L1 | plan |
| Assistant | Grounded research helper | built-unproven | unchanged | L1 | plan |
| Onboarding | Sector wizard, invitations | partial [H] | AUTH-1, AUTH-2 merged (952, 960): onboarding redesign, profile-only heal; repair script not run | L1 | [C: PR list; AUTH-2 log] |
| Lanes L17 to L28 | obligation, portfolio, entity tables, chain proof, eight spec 09 domains | laned | no PR for L18 to L28 in the last 140 merged PRs; L20 file absent | L0 | [C: gh pr list; tree search] |

Counts: 70 rows. Retired or superseded: 8. At L0: 20. At L1 or L1 partial: 33. At L2: 4. At L4: 6. At L5: 0. [H: tallied by hand from the table]

---

## 4. Spec 06 gap register status

Spec 06 states only one gap as closed (B-1). Everything else carries "Open" or no status in the file itself; statuses below are from the build plan, board and logs. Spec 06 is dated 2026-08-12.

| Gap | Sev | Status | Evidence |
|---|---|---|---|
| S-1 No entity spine | P0 | partial: 2,880 entities, nine kinds scoped; four attribute tables not found | [C: system map; tree search] |
| S-2 No corridor entity | P0 | partial: resolver and per-FEU wiring merged (912); `entity_scope` 8 rows | [C: PR 912; V inventory] |
| S-3 External identifier crosswalk | P1 | partial [H: `entity_identifiers` exists] | system map |
| S-4 No number envelope | P0 | closed in code (PR 451 per plan), not wired to every figure | [H, plan AUDITED] |
| S-5 No shared vocabularies | P0 | closed in code (PR 451) | [H, plan AUDITED] |
| S-6 No PROV derivation chain | P1 | open [H: no evidence found] | none |
| S-7 No portfolio object | P0 | open | [C: no file] |
| S-8 No typed cross-reference model | P1 | partial: typing at mint (933); 23,709 of 23,715 untyped live | [C; V] |
| S-9 No coverage surface | P1 | partial [H: Coverage Index exists] | system map |
| B-1 No surface guard on detail routes | P0 | CLOSED, PR 450 | spec 06 |
| B-2 Counts and rows from two classifiers | P0 | status unknown, no closing evidence read | [H] |
| B-3 About 17 UI fields bound to missing producers | P0 | status unknown; audit triage 823 dispositioned dead columns and UI-orphan fields (docs only) | [C: PR 823 title] |
| B-4 `domain: row.domain or 1` laundering | P1 | status unknown | [H] |
| B-5 Market and Operations use a prose renderer with no tables | P0 | status unknown; P4 (961) fixed wide tables overflow (GfmSection), which suggests table support exists | [H: inferred from PR 961 title] |
| Regulations P0s | P0 | obligation and binding_position partial (S8-7); cost clause, applicability, four dates unverified | section 3 |
| Market Intel P0s | P0 | overlay and chip fix built; ribbon inputs, methodology disclosure unverified; lead-time chart empty | section 3 |
| Research P0s | P0 | assessment, horizon, maturity, credibility, signposts merged; all tables 0 rows live on 2026-10-04 | section 3 |
| Operations P0s | P0 | matrix built; EU and US zero data; feasibility gate reverted (917); labour chain suppresses live | section 3 |
| Community P0s | P0 | superseded or removed by ADR-041, 042; guard built | section 3 |
| D-1 Research intake | P0 | tool built (898), two dry dispatches, no standing intake | [C] |
| D-2 `regional_data_facts` producer | P0 | scaffolding, fixtures only; table has no consumer after ADR-043 | buildout open items |
| D-3 Price and index ingestion | P0 | ECB and oil bulletin live; EIA blocked on secret; EEX no licence; SBTi apply refused | system map |
| D-4 Obligation decomposition | P0 | 1,336 obligations derived; instrument decomposition unverified | [H] |
| D-5 16 UNCONFIRMED regulatory facts | P1 | status unknown; PPWR join reverted (917) | [H] |
| D-6 Emission factor store | P1 | built (13 rows) | system map |
| Phase 1 acceptance gate `surface-acceptance.mjs` | gate | no evidence built | [H] |
| Phase 5.4 Assistant guardrails | | built, unverified end to end | plan |

---

## 5. Workflow fire table (31 workflows)

Last-run data: `gh run list --workflow <file> --limit 3` on 2026-10-06 (UTC dates run to 2026-10-07). [C: gh run list]. Trigger kinds read from the `on:` block on origin/master; commented cron lines are build mode (rule 16), not active. "Push failure, workflow file issue" runs on 2026-10-02 and 2026-09-20 were on lane branches (885, 756), not master [C: gh run view]; they are listed in the conclusion column only where they are the latest run, with the last dispatch result beside it.

| Workflow | Last run | Conclusion | Trigger kinds |
|---|---|---|---|
| brief-apply | 2026-09-18 | success (dispatch) | dispatch, push |
| brief-export | 2026-09-29 workflow_run success; latest 2026-10-02 push failure on branch | success, branch failure | dispatch, workflow_run (Population turn) |
| bug-class-guard | 2026-10-07 | success | push, pull_request (CI) |
| build-proof | 2026-10-07 | success | push, pull_request (CI) |
| change-detection | 2026-09-04 | success | dispatch (cron commented) |
| corpus-turn | 2026-09-29 | success (one skipped) | dispatch, push, workflow_run |
| data-audit-lane | 2026-08-11 | success dispatch; latest scheduled run failure | dispatch (cron stopped) |
| date-chain | 2026-09-12 | success | dispatch |
| discipline | 2026-10-07 | success on master push | push, pull_request (CI) |
| downstream-chain | 2026-09-29 | success | dispatch, workflow_run |
| fetch-drain | 2026-09-29 | success | dispatch, workflow_run (Source sweep) |
| gate-a-rescan | 2026-09-29 | success | dispatch, workflow_run |
| layout-baseline-renewal | never run | none | dispatch |
| ledger-consume | 2026-09-29 workflow_run success; 2026-10-02 push failure on branch | success | dispatch, push, workflow_run |
| live-smoke | 2026-10-07 02:23Z | success (deployment_status); later runs skipped | deployment_status, dispatch |
| maintenance | 2026-09-28 | success and failure (dispatch); 2026-10-02 branch push failure | dispatch |
| population-turn | 2026-09-29 | success (workflow_run); 2026-10-02 branch push failure | dispatch, workflow_run |
| producers | 2026-09-05 | success dispatch; 2026-09-20 branch push failure | dispatch (cron commented) |
| propagation-drain | 2026-09-29 | success | dispatch, workflow_run |
| question-answers | never run | none | dispatch, push |
| research-assessment | 2026-10-03 | success | dispatch |
| research-walker | 2026-10-03 | success (two runs) | dispatch |
| source-monitoring | 2026-06-28 | success | dispatch (cron commented) |
| source-resolution | 2026-10-06 | success | dispatch, push, workflow_run |
| source-sweep | 2026-09-29 | success | dispatch (cron commented) |
| spot-check-monthly | 2026-06-01 | failure (schedule) | dispatch (cron commented) |
| theme-briefs | never run | none | dispatch, push |
| trust-recompute | 2026-09-01 | success (schedule) | dispatch (cron commented); retirement ruled, file still present |
| uptime-probes | 2026-09-04 | success | dispatch (cron commented) |

Observations:
- Workflows that have never run: 3. Workflows whose most recent real run is a failure: 2 (data-audit-lane, spot-check-monthly). [CONFIRMED: gh run list per workflow, section 5] [WORK: DORMANT-1]
- Workflows with a run since 2026-10-04 (post-plan): research-walker (10-03, before), source-resolution (10-06), live-smoke (10-06 and 10-07). Everything else last ran 2026-09-29 or earlier. [C]
- Of the new lane workflows added since 2026-10-04 (layout-baseline-renewal, theme-briefs, question-answers, source-resolution, live-smoke): 2 have fired, 3 never. [CONFIRMED: gh run list per workflow, section 5] [WORK: DORMANT-1]
- No workflow has run against a branch database. `maintenance.yml` last real dispatch 2026-09-28 predates every Stage 1 to 7 maintenance step (steps 59 to 63). [H: step dates from logs; not matched step by step]

Closure gate NEVER-RUN clock:
- Allowlist in `closure-gate.mjs` holds two entries: `workflow:downstream-chain.yml` and `workflow:producers.yml`, expiry train 80. [C: file read, lines 649 to 665]. Both have gh run history (downstream-chain 2026-09-29, producers 2026-09-05), but the gate credits evidence only from `harness-ledger-export.json` regeneration, not from gh. [H: current train number not computed; entry may already be stale or expired]
- Closure-gate NEVER-RUN eligible without any evidence path, each past a three-train grace: `layout-baseline-renewal`, `theme-briefs`, `question-answers` (no run), plus maintenance steps `recompute-tiers`, tier steps from Stage 1, and others never dispatched. [HYPOTHESIS: not computed by running the gate; the logs for S0-B and S1-C say "will read NEVER-RUN after grace"]. The `live-smoke` family will clear when `live-smoke-run-001` lands in `harness_runs`. [HYPOTHESIS] [WORK: DORMANT-1]

Rule 15 (verifiers tracked but not executed): [H] with this basis only: `discipline.yml` is green on master (2026-10-07) and its invariant-coverage meta-gate includes `execution-wiring.mjs`, so any registry-cited `selftest:` or `audit:` enforcer with no execution path should fail it. Verifiers not cited in the registry are outside that check and cannot be enumerated without running the gate. Specific candidates visible from this pass: `section-marker-audit.mjs` (hard audit, first live run owed, never run); `repair-smoke-account.mjs` (not run); `prov-guard-adversarial-audit.mjs` and the tier-override attack test run as fakes. Not verified.

---

## 6. Owed list, consolidated and deduplicated

Format: item | source log or doc.

Migrations
1. Migration 355 `vocabulary_terms`: applied live as `20261007021924`, but PR 959 is open and master has no 355 file. [C: list_migrations versus tree] | coordinator state; G5-TERMS [CLOSED: PR 959]
2. No migration file on master from 351 upward is unapplied: 351, 352, 353, 354, 356 are all in `list_migrations`. [C: list_migrations versus `git ls-tree`] [NOT-WORK: fact, no action]
3. Older numbered files not found in `list_migrations` by name: `299_item_type_required_slots_wave3` (header: NOT APPLIED, held by R14) and `315_workspace_due_next`. [C: file headers and list read; H: 315 may be applied under another name; a function existence query would settle it, not run] | system map; migration headers [WORK: MIG-HIST-2]
4. Next migration lane: GIN index on `inference_records.cited_item_ids`; `signposts.lifecycle_applied_at timestamptz` | p2-grade-inference-chips; l4d-predictions-reliability [CLOSED: PR 1046]
5. Migration 357 (G5-READ: entity_kind material, theme CHECK to registry) | coordinator state [CLOSED: PR 965]

Population-stage repairs
6. Strip ledger blocks in 5 `full_brief` rows and 4 section rows (ids in P3 log) | p3-live-defects [NOT-WORK: Stage 9 precondition, CLAUDE.md rule 16]
7. Re-author the 9 pre-contract theme briefs (pre-351 shape) | s3c-theme-brief-batches; coordinator state [NOT-WORK: Stage 9 precondition, CLAUDE.md rule 16]
8. Whole-corpus typing backfill (23,709 untyped edges) | system map; buildout stage 2 [NOT-WORK: Stage 9 precondition, CLAUDE.md rule 16]
9. Ledger-block rows (data-audit block rows) from first live `section-marker-audit` if any body carries a marker | gates2-live-smoke [NOT-WORK: Stage 9 precondition, CLAUDE.md rule 16]
10. `origin_class` NULL on 1,222 items; `source_role` NULL on 874 sources (2026-09 counts, re-read owed) | system map section 18 [H: stale counts] [NOT-WORK: Stage 9 precondition, CLAUDE.md rule 16]
11. Stored-body marker count: never measured | gates2-live-smoke [HYPOTHESIS: per the gates2-live-smoke log, not re-read in this landing] [NOT-WORK: Stage 9 precondition, CLAUDE.md rule 16]

Code and wiring owed
12. `market_series` and `regional_data_facts` outbox rows carry no single entity so reach no item | l4a, l4d [CLOSED: PR 1026]
13. Question answers and propagation drain not chained to a workflow | l4b-question-answers [CLOSED: PR 1023]
14. `seek-more.mjs` still names `operator-priced-only` | l4a-questions-on-change [WORK: DOCS-5]
15. `trust-recompute.yml` retirement (workflow delete, closure-gate entry) | coordinator state; S6-4 [CLOSED: PR 980]
16. GUARD-1 token (ADR-016 item b); provenance-heal `+strip-unprovable` opt-in | g6-gates; coordinator state [NOT-WORK: operator item, recorded on the board]
17. Theme-briefs workflow not chained; Research reader selects only exact-id brief row | s3c [CLOSED: PR 1023]
18. Inference read inside 300 s cached bundle; citation titles as text | p2-grade-inference-chips [CLOSED: PR 1073]
19. Sources grid entries other than the item's own carry no bias | p1-source-rating-display [CLOSED: PR 947]
20. Per-claim tier matching against live rows unverified | p1-source-rating-display [NOT-WORK: build-mode hold, COMMON rule 5 (no live read)]
21. 768 to 1023 px row chips ellipsise (guard measures 375 and 1280 only) | p1, p2 [CLOSED: PR 969]
22. `docs/inventories/migrations.md` generated file causes F51 check 5 collisions on every migration lane | coordinator state [CLOSED: PR 977]
23. `/api/workspace/tags` 403 for a user with no organisation (24 live-smoke warnings): resolved by AUTH-2 (960 merged) [H: not re-run live] | p4-live-smoke-1; coordinator state [CLOSED: PR 960]
24. Repair command for the smoke account, `repair-smoke-account.mjs --arg <email>`, dry then `--apply`; not run | auth2-provision-heal [NOT-WORK: smoke account repaired 2026-10-07 per PROGRAM-BOARD (AUTH-2 heal), no action]
25. Pre-existing personal workspaces created by the old callback untouched | auth2-provision-heal [NOT-WORK: fact, no action]
26. Closure-gate registration for `layout-baseline-renewal` (needs write-set expansion to `closure-gate.mjs`) | s0b-baseline-renewal-tool [WORK: DORMANT-1]
27. `ProvisionalReviewCard.tsx` copy still describes the 0.65 to 0.79 band as proposed on approval | s1b-host-verdicts [WORK: DOCS-5]
28. Production dependencies of `plan-drain.mjs` proven on fakes only; `db-catalog.json` refresh not done | g6-drain [NOT-WORK: build-mode hold, CLAUDE.md rule 16 / COMMON rule 5]
29. `loop-fired-evidence` for hops 12 and 13 until a chained row lands | s1e-source-chain [WORK: RULES-X-1]

Docs and index owed
30. INDEX line: judgement-drain `FAMILY.md`; MAINTENANCE-RUNBOOK index lines for steps 62 (live-smoke) and 63 (judgement-drain); retire index lines 13 and 14; INDEX line for ADR-044 and runbooks 60 and 61 may already be merged via 953 [H] | g6-drain; g6-gates; coordinator state [CLOSED: PR 996]
31. Operator question open: Settings "When a post gets promoted" toggle versus ADR-041 | coordinator state [CLOSED: PR 963]

Operator or date owed
32. Layout baseline renewal fires 2026-10-08 09:00 -04:00; hard expiry 2026-10-15; rendering-guard required versus continue-on-error decision after; legacy-remediation deferrals also expire 2026-10-15 | coordinator state; buildout stage 0 [CLOSED: PR 978]
33. EIA secret `EIA_API_KEY`; EEX licence; SBTi licence for apply | system map [NOT-WORK: operator item, recorded on the board]
34. Public-source intake for auxiliary energy and indexation mechanics | buildout open items [WORK: PLAN-2]
35. `regional_data_facts` and `estimated_values` have no consumer after ADR-043 | buildout open items [WORK: DEAD-1c]
36. Rendering audit generator fails on master with DetailShell import errors | buildout open items [HYPOTHESIS: not re-checked after later merges] [CLOSED: PR 1034]

Design changes owed (rule 20)
37. `fsi-app/scripts/tmp/claude-design-request-2026-10-06.md`: 16 artboard sections (00 system, 01 to 09, 12, 13, 16, 17, 20, 21), 69 numbered or lettered items. Plan-level open items: artboards 09, 13 and 15. Added since: row and detail bias chips, grade chip, inferences section, themes strip and "Across pages" section, fact card tier slot, artboard 17 step 1 fields (job title, sector, size, region), cluster synthesis "density 0.180" removal. [C: file read headings and grep counts] [NOT-WORK: operator item, recorded on the board]

Not-started build lanes (not owed notes, owed work)
38. S5-2, S5-3, S5-4 briefs and builds; G7-UI merge; G5-TERMS merge (S5-2 PR 965, S5-3 PR 964, S5-4 PR 984, G7-UI PR 962, G5-TERMS PR 959) [CLOSED: PR 984]
39. All of Stage 8 (items S8-1 to S8-5, S8-8 to S8-10) [WORK: PLAN-2]
40. L18 portfolio, L19 entity tables, L20 branch-database chain proof, L21 to L28 spec 09 domains: no PR found [WORK: PLAN-2]

---

## 7. What constitutes "enough" proof before population

Derived from Stage 9, rule 15 (execution and attack) and rule 17 (nothing runs alone). Each box is checkable.

Chain proof (Stage 9 item 1, lane L20)
- [ ] A Supabase branch database exists for the run and every migration 001 to 356 applies cleanly to it from scratch.
- [ ] The whole chain (source sweep, ledger consume, population turn, downstream chain, propagation drain, brief export and apply, Gate A rescan, source resolution, question answers, theme briefs, judgement drain) fires on the branch without manual intervention, each hop proven by `harness_runs` rows on the branch.
- [ ] All 13 loop hops show `enforceFired:true` on evidence from that run (today 2 of 13).
- [ ] Zero rows written to production by the run, checked after teardown.
- [ ] The branch run log is exported before teardown and attached.

Execution wiring (rule 15)
- [ ] Every workflow in section 5 has a recorded run of its current code at least once in dry mode with an artifact (today 3 never run; 28 of 31 ran, but most predate the Stage 1 to 7 changes). [HYPOTHESIS: restates the section 5 counts, not re-derived] [WORK: DORMANT-1]
- [ ] Every maintenance step added since 2026-09-28 (steps 59 to 63) has dispatch evidence.
- [ ] `execution-wiring.mjs` reports zero cited-but-unrun verifiers; the closure gate reports zero NEVER-RUN failures with no expired allowlist entry. [HYPOTHESIS: a proof condition, current state not re-derived] [WORK: DORMANT-1]
- [ ] Each security-critical invariant has an adversarial check run against the branch database, not only fakes: tier override, corrections layer, provenance guard (mig 250 template), ADR-035 aggregate floor, admin gate, cross-organisation read (S8-5 is not yet built).

Flywheel connection (rule 17)
- [ ] A mint on the branch is followed by discovery, forward events, analysis, obligations and tags, each recorded in the run artifact, with THE GATE refusing a second batch while one is unconnected.
- [ ] Question answers and the propagation drain are chained (owed item 13); market_series and regional_data_facts outbox rows reach an item (owed item 12).
- [ ] An analysis result is written where the surfaces read it, and the live smoke gate (or its content extension) reads it on the live page.

Surface proof (L5)
- [ ] Live smoke covers content, not only overflow and the admin gate: grade chip, bias chips, tier, inferences section, themes section, "Across pages" present on seeded or branch data at 375 and 1280.
- [ ] Stage 8 items built and attack-tested: notes, assignment, tag attribution, count-function membership checks, cross-organisation attack test, portfolio.
- [ ] The five spec 09 domain tables each have at least one producer, run once.

Preconditions closed
- [ ] Owed items 1 to 36 in section 6 closed or explicitly ruled out.
- [ ] Layout baseline renewed before 2026-10-15; deferrals reviewed.
- [ ] Design changes owed delivered and built or rejected.
- [ ] 355 merged; 299 and 315 status settled.
- [ ] Drain kill switch (354) remains off until the above are ticked; the first switch-on is itself dry on the branch.

---

## 8. Appendix: hypotheses to verify

1. [HYPOTHESIS] `maintenance:recompute-tiers` and the Stage 1 maintenance steps are NEVER-RUN eligible in the closure gate. Verify by running `closure-gate.mjs` NEVER-RUN check. [WORK: DORMANT-1]
2. [H] The current closure-gate train number versus allowlist expiry 80 for downstream-chain and producers. Verify by `runNeverRunLive`.
3. [H] Migration 315 `get_workspace_due_next` is applied under a different name. Verify: `select proname from pg_proc where proname='get_workspace_due_next'`.
4. [H] Migration 299 slots are not in `item_type_required_slots`. Verify: select rows for `corridor_identity`, `evidence_agreement_signal`, `source_authority_signal`.
5. [H] S8-7 obligations: `binding_position` non-null rate; whether the four forwarder-direct instruments (CountEmissions EU, CBAM, Empowering Consumers, PPWR) have rows; whether the Regulations detail page renders a banner from the table.
6. [H] Spec 06 B-2 to B-5 and D-5 closing status; 00S8 `surface-acceptance.mjs`; 00S1.3 alias table; 00S6 reciprocal tombstones.
7. [H] S8-3 tag attribution: whether `item_workspace_tags` carries an author column; S8-4 the two count RPCs still lack a membership check (migration 077 is named rpc_membership_checks, so the system map claim may be stale).
8. [H] Whether any spec 09 domain has a producer script (search found tables from migrations 296 to 298, no producers read).
9. [H] Stored ledger markers: run `section-marker-audit.mjs` live once; PR 954 says it goes red if any exist.
10. [H] Whether PR 962 CI is green and PR 959 CI is green (not read).
11. [H] Live counts from 2026-10-04 (inventory) are stale after later merges: `research_assessments`, `signposts`, `inference_records`, `theme_briefs`, spec 09 tables. Re-read before using for proof claims.
12. [H] `section-marker-audit`, `repair-smoke-account`, and the attack tests run on fakes; whether they are execution-wired in a lane.
13. [H] Whether the 2026-09-29 chained-apply incident reversal (33 items) was executed; plan R14 criterion 1 requires zero rows carrying run 36568656803.
14. [H] The five pre-existing Stage 8 "grade chip live" claim: L1 only; whether the chip renders on live pages was not checked in this pass.
15. [H] S1-D: a fresh research-walker dry dispatch would exercise the post-931 code; last dispatch predates 931.
