# P1-11 schema: Keep / Refactor / Trash register and build-plan section (2026-10-12)

Lane P1-11, DISPOSITION lane, read-only. Tree: origin/master `683b82e29` (PR 1160, the production schema dump). Written by a cloud session on 2026-10-12. Every file in SCOPE was read whole with the Read tool; the coverage table records each read. Every claim carries `[CONFIRMED]` (executed or read this session, method named), `[HYPOTHESIS]` (plausible from reading, not executed) or `[REFUTED]`. A finding a prior register carries is cited `<register>:L<n>` and not re-described; register labels are files under docs/archive/audits/2026-10-11-complete-audit-registers/ (C1, C2, C3, C3a, C3b, C3c = the migration registers; C4 = the live-database register; B2p2 = B2-part2-proof). No database was read, no code changed, no sub-agent used.

Status token legend: KEEP AS-IS (ported as it stands), REFACTOR AND PORT (kept, rewritten or merged), TRASH (not ported; the feature, if any, is recorded in section 8 so it is not lost). Code lines are non-blank non-comment lines by awk (`--` lines for SQL; `//`, `/* */` and leading-`*` lines for JS/TS). Raw lines are `wc -l`.

## 1. Header and coverage

Module: schema. The database of fsi-app as production holds it on 2026-10-12: the schema-only dump `docs/plans/rebuild/schema-2026-10-12.sql`, the one edge function `fsi-app/supabase/functions/capture-worker/index.ts`, the seed directory `fsi-app/supabase/seed` and `fsi-app/supabase/seed.sql`. The 352 migration files were not in the whole-read scope; they were searched by grep only for numbers a register cites, and their history is read through the six migration registers (C1, C2, C3, C3a, C3b, C3c), each read whole.

Coverage (scope files, 25,045 raw lines, 15,200 code lines):

| path | raw lines | code lines | read calls |
|---|---|---|---|
| docs/plans/rebuild/schema-2026-10-12.sql | 23291 | 9734 | 24 (L1-39, then 23 runs L40-23291 of about 1,000 to 1,250 lines) |
| fsi-app/supabase/functions/capture-worker/index.ts | 614 | 398 | 1 |
| fsi-app/supabase/seed.sql | 1318 | 1174 | header read (lines 1-5) plus a statement census by grep (INSERT INTO targets) |
| fsi-app/supabase/seed/seed-sources.sql | 1168 | 1007 | header read (lines 1-12); no runtime caller found (section 4) |
| fsi-app/supabase/seed/seed-dev-workspace.sql | 45 | 31 | 1 (whole) |
| fsi-app/supabase/seed/seed-community.sql | 20 | 0 | read whole by C3:L296 (comments only) |
| fsi-app/supabase/seed/*.mjs (13 files) | 3942 | 2856 | header lines 1-4 of each plus a grep for paid-service call sites |

The seed files were not read line by line: no seed is runtime (config.toml:39-40 `[db.seed] enabled = false`; no reference in .github or package.json) [CONFIRMED: sed and grep], so each is TRASH on its header and its call-site census; that is the stop rule of BRIEF.md applied, and the PR body names them.

Registers read whole: C1 (456 lines), C2 (1698), C3 (324), C3a (220), C3b (174), C3c (180), C4 (1144), B2-part2-proof (76). Lane registers searched for hand-overs to P1-11 by grep: community-b.md, harness.md, mint.md, sources-a.md, intake-b.md, capture.md, dash-search.md, flywheel-b.md, obligations.md, market.md, workspace.md, runtimes-a.md, admin-b.md (section 8 rows cited below).

Object census of the dump [CONFIRMED: parse of the dump into a scratch inventory, counts checked against the dump header line 3]: 122 tables, 6 views, 134 functions (62 SECURITY DEFINER, 72 invoker), 69 triggers, 214 policies, 320 explicit indexes, 205 foreign keys, 3 types (entity_kind 12 values, provenance_status 4, validation_result composite), 3 sequences, 764 grants, no CREATE EXTENSION. Total 865 schema objects (tables, views, functions, triggers, policies, indexes).

## 2. Module verdict

**REFACTOR AND PORT.** The schema is the strongest part of the build: RLS is on for all 122 tables, anon holds no write privilege anywhere, the provenance gate (`validate_item_provenance`, criteria 1 to 7), the outbox, the derivation DAG and the guard triggers are real and attacked in CI (C3:L286). It keeps every table that carries a feature. What it does not keep is 387 migration files that no longer reproduce production (dump line 2; C3:L42, chain-proof fire 10 failed), a hand-restated family of read RPCs, dead objects, policies that cannot change an outcome, defaults that hand every new object to anon, and several CHECK and foreign-key shapes that refuse the values the code writes.

**Current code LOC: 15,200** (dump 9,734; capture-worker 398; seed 5,068). **Estimated clean LOC: about 8,460.** Arithmetic:
- Schema file 9,734 to about 8,200: minus 460 (the read-RPC family, 16 live functions with about 639 dump lines, collapses to five, about 180 lines; fnsize census over the dump), minus about 200 (dead functions: reorder_user_list_item 81, the funded-pass lock trio, publish_aggregate and the two bucket helpers, move_override_notes_to_item_notes held, see section 4), minus about 530 (833 GRANT and REVOKE lines replaced by an explicit grant table after a deny-by-default ACL, about 300), minus about 150 (49 policies that cannot change an outcome, section 3), minus 34 (redundant indexes), minus about 400 (seven dead tables and two dead views with their indexes, grants and comments), minus about 120 (dead columns and their comments), plus about 250 (seven community RPCs, community_group_bans, three moderation_reports columns, screen_verdicts, the harness ledger reshape, an item_corrections outbox trigger), plus 82 (one index per unindexed foreign key), plus 29 (search_path pins). 9,734 - 460 - 200 - 530 - 150 - 34 - 400 - 120 + 250 + 82 + 29 = 8,201.
- Seed 5,068 to 0 (no seed is runtime; each feature a seed carried is owned elsewhere, section 8).
- capture-worker 398: owned by P1-07 capture (capture.md section 8); counted there, not here.
- New proof and generator code about 260 (one CI apply-and-check script about 200, generated primary-key map about 60).
- Total 8,201 + 260 = 8,461.

Objects: 865 today to about 832 clean. Tables 122 - 7 dropped + 2 new = 117; views 6 - 2 = 4; functions 134 - 8 dead - 11 collapsed + 7 community RPCs = 122; triggers 69 + 1 (item_corrections outbox) - 1 (tier shim sync) = 69; policies 214 - 49 + 2 = 167; indexes 320 - 34 redundant + 82 FK - about 15 on dropped tables = 353. Sum 117 + 4 + 122 + 69 + 167 + 353 = 832.

Responsibilities (by object family):
1. Data plane of the five surfaces: intelligence_items and its children (sections, claims, changelog, timelines, forward events, obligations, cross references), the read RPC family and the surface counts.
2. The moat: validate_item_provenance (criteria 1 to 7), set_provenance_status, guard_provenance_flip (reconciler or trigger depth), Gate A state, item_type_required_slots, canonical key and source-archive guards.
3. Sources and credibility: sources, provisional_sources, canonical candidates, tier opinions, bias tags, trust events, verifications, institutions, data_sources licence register.
4. Capture and change detection: pending_first_fetch, agent_runs, agent_run_searches, raw_fetches, monitoring_queue, intelligence_changes, portal_link_candidates, census_worklist, capture_worker_fetch via pg_net.
5. Decision propagation (spec 08): entities spine, propagation_events outbox, derived_values, derivation_edges, inference_records, statutory_computations, estimated_values, signposts, research_assessments, source_reliability_ledger.
6. Tenancy and workspace: organizations, org_memberships, invitations, bans, workspace settings, overrides, tags, notes, assignments, portfolios, watchlists.
7. Community (social only, ADR-041): groups, members, invitations, posts, sign-off, topics, member profiles, moderation, notifications.
8. Operator control: system_state (pause, scrape cadence, judgement drain) with marker-GUC guards and audit, integrity_flags, error_events, harness_runs, mutation leases, holdings_quality.

Dependencies: Supabase roles anon, authenticated, service_role, supabase_admin and the project role reconciler; schemas auth (auth.uid(), auth.role(), auth.users), extensions (pgcrypto gen_random_bytes and digest), vault (decrypted_secrets), net (pg_net) [CONFIRMED: grep of the dump]. External service: one, the project's own edge function reached by capture_worker_fetch through pg_net (FREE; section 8). Extensions installed and unused: ltree and pg_trgm (0 references in the dump, src or scripts), pg_cron (no job) (C4 notes; C2:L206).

### Data model as it is (one row per relation)

Columns: relation | purpose (C4 WHAT) | rows at 2026-10-08 (AT1, quoted by C4) | code writers/readers (files, C4 scan) | policies (dump) | anon SELECT grant (dump) | outbox trigger (dump) | C4 status | P1-11 verdict. Policies, grants and triggers [CONFIRMED: dump parse]; rows and W/R [CONFIRMED by citation, the C4 line named].

| relation | purpose | rows | W/R | policies | anon SELECT | outbox | C4 status | verdict |
|---|---|---|---|---|---|---|---|---|
| admin_action_cooldowns | per-action cooldown stamps for admin-triggered LLM scans | 1 | W2/R2 | 1 | yes | no | LIVE (C4:L714) | KEEP |
| agent_run_searches | per-item search-result pool (result_content) that grounding spans must be verbatim in; 251 MB | 6597 | W7/R25 | 1 | yes | no | LIVE (C4:L715) | KEEP |
| agent_runs | one row per generation call: cost, fetch status, model | 24144 | W4/R7 | 1 | yes | no | LIVE (C4:L716) | KEEP |
| aggregate_query_log | privacy-budget ledger written only by publish_aggregate() | 0 | W0/R1 | 0 | no | no | UNWIRED (C4:L717) | TRASH (ADR-041/042) |
| assumption_register | this-product modelling constants with rationale and code location | 0 | W1/R2 | 1 | yes | no | LIVE (C4:L718) | KEEP |
| auxiliary_energy_profiles | per-org auxiliary load profiles (kW, duty cycle) | 0 | W2/R2 | 1 | yes | no | LIVE (C4:L719) | KEEP |
| brief_apply_runs | run record of the brief-apply turn (bytes_read, items_applied) | 3 | W1/R1 | 0 | yes | no | LIVE (C4:L720) | TRASH (fold into harness ledger) |
| bulk_imports | audit row per admin bulk source import | 0 | W1/R0 | 1 | yes | no | HALF-SLICE (C4:L721) | REFACTOR (imported_by FK) |
| canonical_source_candidates | candidate canonical URLs for items with broken/missing source, with review decision | 331 | W4/R5 | 2 | yes | no | LIVE (C4:L722) | KEEP |
| census_worklist | full-corpus enumeration ledger: one row per document URL per source with dry-run disposition | 21609 | W6/R9 | 0 | yes | no | LIVE (C4:L723) | REFACTOR (drop resolved_into_id) |
| claim_versions | append-only superseded-claim history | 949 | W2/R3 | 0 | yes | no | LIVE (C4:L724) | KEEP |
| community_group_invitations | group invitations | 0 | W5/R7 | 5 | yes | no | LIVE (C4:L725) | KEEP |
| community_group_members | group membership and prefs | 1 | W8/R13 | 5 | yes | no | LIVE (C4:L726) | KEEP |
| community_groups | peer groups | 7 | W3/R8 | 5 | yes | no | LIVE (C4:L727) | REFACTOR (owner FK) |
| community_member_profiles | community identity and verification | 0 | W3/R5 | 4 | yes | no | LIVE (C4:L728) | KEEP |
| community_post_signoff_requests | verifier sign-off requests on posts | 0 | W4/R3 | 4 | yes | no | LIVE (C4:L729) | REFACTOR (requested_by FK) |
| community_posts | threads and replies | 0 | W7/R8 | 5 | yes | no | LIVE (C4:L730) | KEEP |
| community_thread_entities | entity tags on threads | 0 | W1/R1 | 3 | yes | no | LIVE (C4:L731) | KEEP |
| community_topic_groups | topic-to-group map | 0 | W0/R0 | 4 | yes | no | HALF-SLICE (C4:L732) | KEEP |
| community_topics | per-user topics | 0 | W0/R1 | 5 | yes | no | HALF-SLICE (C4:L733) | KEEP |
| connection_theme_runs | run record of corpus connection analysis | 64 | W1/R5 | 2 | no | no | LIVE (C4:L734) | KEEP |
| connection_themes | clustered cross-item themes (density, convergence, pivots) | 18 | W1/R7 | 2 | no | no | LIVE (C4:L735) | KEEP |
| corpus_census | one-time per-item census class from Haiku | 655 | W0/R1 | 0 | yes | no | HALF-SLICE (C4:L736) | TRASH (export first; Haiku columns) |
| corpus_turn_requests | queue of items needing a corpus turn (trigger-enqueued on verified insert/update) | 1757 | W2/R2 | 1 | yes | no | LIVE (C4:L737) | KEEP |
| coverage_gap_candidates | census of missing instruments with surface-contract test (PI-5) | 109 | W0/R1 | 0 | yes | no | LIVE (C4:L738) | KEEP |
| coverage_gap_census_findings | dry-run census findings per sweep | 116 | W0/R0 | 0 | yes | no | DEAD (C4:L739) | TRASH (export rows first, 184 precedent) |
| coverage_gaps | 2 seeded coverage-gap banners | 2 | W0/R2 | 1 | no | no | LIVE (C4:L740) | TRASH (dash-search.md:L268) |
| data_sources | licence verdict per external data source (28 rows) | 28 | W1/R3 | 1 | yes | no | LIVE (C4:L741) | KEEP |
| derivation_edges | DAG of derived-value inputs (acyclic trigger) | 20 | W1/R3 | 0 | no | no | LIVE (C4:L742) | REFACTOR (allowlist ruling) |
| derived_values | derived numbers with lifecycle, admissibility, half-life | 20 | W1/R6 | 0 | yes | yes | LIVE (C4:L743) | KEEP |
| disposition_ledger | append-only identity record of deleted items (236 at AT1) | 236 | W1/R0 | 0 | yes | no | HALF-SLICE (C4:L744) | KEEP |
| emission_factors | append-only emission factors with pedigree | 13 | W2/R10 | 1 | yes | yes | LIVE (C4:L745) | KEEP |
| entities | entity spine (organisations, jurisdictions, corridors, instruments) | 2880 | W9/R24 | 1 | no | no | LIVE (C4:L746) | KEEP |
| entity_aliases | insert-only alias history | 0 | W1/R1 | 1 | no | yes | LIVE (C4:L747) | KEEP |
| entity_identifiers | external identifier per entity | 2853 | W4/R4 | 1 | no | no | LIVE (C4:L748) | KEEP |
| entity_refs | row-to-entity links | 2878 | W3/R8 | 1 | no | no | LIVE (C4:L749) | KEEP |
| entity_relations | parent-child entity hierarchy (no-cycle trigger) | 0 | W0/R1 | 1 | no | yes | HALF-SLICE (C4:L750) | KEEP |
| entity_scope | subject-to-scope attributions | 8 | W1/R3 | 1 | no | no | LIVE (C4:L751) | KEEP |
| error_events | deduped client/server error telemetry | 43 | W1/R2 | 1 | yes | no | LIVE (C4:L752) | KEEP |
| estimated_values | model estimates with pedigree (spec 08 layer 3) | 0 | W0/R1 | 1 | yes | yes | HALF-SLICE (C4:L753) | KEEP |
| funded_pass_runlock | single-holder run lock for funded passes | 0 | W0/R0 | 0 | yes | no | UNWIRED (C4:L754) | TRASH |
| gate_a_health_cache | singleton cache for Gate A health RPC | 1 | W0/R0 | 0 | yes | no | UNWIRED (C4:L755) | KEEP |
| grid_connection_queues | DSO grid-connection queue facts | 0 | W1/R1 | 1 | yes | yes | UNPROVEN (C4:L756) | KEEP |
| harness_runs | ledger of every harness/live-smoke run (304 rows) | 195 | W2/R11 | 0 | no | no | LIVE (C4:L757) | REFACTOR (harness ledger shape) |
| holdings_quality | per-item capture completeness audit | 672 | W1/R1 | 2 | yes | no | LIVE (C4:L758) | KEEP |
| indexation_clauses | contract indexation clauses per org | 0 | W1/R1 | 1 | yes | no | UNPROVEN (C4:L759) | KEEP |
| inference_records | LLM/analysis answers registered with status tokens | 0 | W0/R5 | 0 | yes | no | UNPROVEN (C4:L760) | KEEP |
| ingest_rejections | rejected ingest values awaiting triage | 133 | W1/R1 | 2 | yes | no | LIVE (C4:L761) | KEEP |
| institutions | registrable-domain to institution tier SSOT (462) | 462 | W2/R2 | 0 | yes | no | LIVE (C4:L762) | KEEP |
| integrity_flags | platform-level and quarantine flags (11,224) | 11224 | W47/R47 | 5 | yes | no | LIVE (C4:L763) | KEEP |
| intelligence_changes | detected-change rows from reconcile | 0 | W1/R1 | 3 | yes | no | LIVE (C4:L764) | REFACTOR (read policy) |
| intelligence_item_citations | item-to-source citation edges | 2668 | W2/R1 | 0 | yes | no | LIVE (C4:L765) | KEEP |
| intelligence_item_sections | per-item brief sections | 12686 | W5/R10 | 2 | yes | no | LIVE (C4:L766) | KEEP |
| intelligence_item_versions | trigger-written version snapshot per item update (26 MB) | 4100 | W0/R0 | 1 | yes | no | HALF-SLICE (C4:L767) | KEEP |
| intelligence_items | the central item table (80 columns) | 2766 | W38/R146 | 6 | yes | no | LIVE (C4:L768) | REFACTOR (drop dead cols) |
| intelligence_summaries | shelved per-sector synopsis rows (7 MB) | 2040 | W0/R0 | 3 | yes | no | DEAD (C4:L769) | KEEP |
| item_assignments | per-item assignee/due date in a workspace | 0 | W1/R1 | 4 | no | no | LIVE (C4:L770) | KEEP |
| item_changelog | per-item change rows | 146 | W2/R3 | 2 | yes | no | LIVE (C4:L771) | KEEP |
| item_correction_evidence | machine value observed under a correction | 0 | W0/R2 | 1 | yes | no | LIVE (C4:L772) | KEEP |
| item_corrections | append-only operator corrections (tags, text, connection tombstones) | 0 | W1/R3 | 1 | yes | no | LIVE (C4:L773) | REFACTOR (outbox trigger) |
| item_cross_references | item-to-item edges with origin and score | 23715 | W5/R14 | 3 | yes | no | LIVE (C4:L774) | KEEP |
| item_disputes | item disputes (frozen legacy, 7) | 7 | W0/R1 | 3 | yes | no | HALF-SLICE (C4:L775) | KEEP |
| item_forward_events | dated forward events extracted from items | 1336 | W5/R16 | 1 | yes | no | LIVE (C4:L776) | KEEP |
| item_gate_a_state | Gate A scan state per item | 2690 | W3/R3 | 1 | yes | no | LIVE (C4:L777) | KEEP |
| item_notes | workspace notes on items | 0 | W1/R1 | 3 | no | no | LIVE (C4:L778) | KEEP |
| item_supersessions | supersession pairs (frozen legacy, 11) | 11 | W0/R1 | 2 | yes | no | HALF-SLICE (C4:L779) | KEEP |
| item_timelines | milestone dates per item | 2913 | W5/R7 | 3 | yes | no | LIVE (C4:L780) | KEEP |
| item_type_required_slots | reference: required slots per item type (48) | 48 | W0/R3 | 1 | yes | no | LIVE (C4:L781) | KEEP |
| item_workspace_tags | workspace tag links | 0 | W1/R3 | 3 | yes | no | LIVE (C4:L782) | KEEP |
| market_series | time series with provenance envelope | 2747 | W5/R15 | 1 | yes | yes | LIVE (C4:L783) | KEEP |
| moderation_reports | community moderation reports | 0 | W2/R2 | 4 | yes | no | LIVE (C4:L784) | REFACTOR (+body, action_taken, action_notes) |
| monitoring_queue | source check queue (580) | 580 | W3/R4 | 3 | no | no | LIVE (C4:L785) | REFACTOR (last_result CHECK) |
| mutation_leases | per-item advisory lease | 0 | W0/R0 | 0 | yes | no | LIVE (C4:L786) | KEEP |
| notification_preferences | per-user notification prefs | 0 | W2/R1 | 5 | yes | no | LIVE (C4:L787) | REFACTOR (drop on_promote) |
| notifications | in-app notifications | 0 | W3/R3 | 3 | yes | no | LIVE (C4:L788) | REFACTOR (kind CHECK drops promote) |
| obligation_objects | obligation-grain records bound to a capture | n/a | W1/R3 | 1 | no | yes | HALF-SLICE (C4:L789) | KEEP |
| obligations | derived obligations per item (1,336 at AT1) | 1336 | W2/R5 | 1 | yes | no | LIVE (C4:L790) | KEEP |
| oem_tech_roadmaps | OEM technology roadmaps | 0 | W1/R1 | 1 | yes | yes | UNPROVEN (C4:L791) | KEEP |
| org_invitations | org invitations | 0 | W2/R3 | 4 | yes | no | LIVE (C4:L792) | KEEP |
| org_member_bans | org-scoped bans | 0 | W1/R1 | 1 | yes | no | LIVE (C4:L793) | KEEP |
| org_memberships | org membership and role | 2 | W7/R24 | 4 | no | no | LIVE (C4:L794) | KEEP |
| org_watchlist | team watchlist | 0 | W2/R6 | 4 | yes | no | LIVE (C4:L795) | KEEP |
| organizations | tenant organisations | 1 | W4/R10 | 3 | no | no | LIVE (C4:L796) | KEEP |
| pending_first_fetch | queue of sources awaiting first capture (1,388) | 1388 | W1/R2 | 1 | no | no | LIVE (C4:L797) | KEEP |
| pending_jurisdiction_review | jurisdiction tokens that failed normalisation | 77 | W1/R1 | 2 | yes | no | LIVE (C4:L798) | KEEP |
| portal_link_candidates | portal deep links discovered per source (57,472 at AT1; 35 MB) | 57472 | W2/R6 | 0 | yes | no | LIVE (C4:L799) | KEEP |
| portfolio_members | portfolio membership | 0 | W1/R1 | 3 | no | no | LIVE (C4:L800) | KEEP |
| portfolios | named item sets | 0 | W2/R1 | 4 | no | no | LIVE (C4:L801) | KEEP |
| profiles | user profile and privilege columns | 2 | W12/R22 | 3 | no | no | LIVE (C4:L802) | REFACTOR (drop LinkedIn + dead cols) |
| propagation_events | outbox of row changes for propagation | 2784 | W2/R5 | 0 | yes | no | LIVE (C4:L803) | KEEP |
| provisional_sources | candidate sources pending tiering | 497 | W7/R6 | 3 | yes | no | LIVE (C4:L804) | KEEP |
| published_price_statistics | refreshed price board | 10 | W1/R5 | 1 | yes | no | LIVE (C4:L805) | KEEP |
| raw_fetches | permanent per-source snapshot index | 679 | W1/R5 | 1 | yes | no | LIVE (C4:L806) | KEEP |
| region_dimension_coverage | per-region dimension coverage counts | 30 | W0/R3 | 1 | no | no | LIVE (C4:L807) | KEEP |
| regional_data_facts | region-grain Operations facts | 90 | W2/R7 | 1 | no | yes | LIVE (C4:L808) | KEEP |
| regions | reference regions (5) | 5 | W0/R9 | 1 | no | no | LIVE (C4:L809) | KEEP |
| reroute_events | corridor reroute events | 0 | W1/R1 | 1 | yes | no | UNPROVEN (C4:L810) | KEEP |
| research_assessments | horizon/maturity assessments per item | 0 | W3/R3 | 0 | yes | no | UNPROVEN (C4:L811) | KEEP |
| section_claim_provenance | claim -> span -> source ledger (34,025 at AT1) | 34025 | W8/R36 | 1 | yes | no | LIVE (C4:L812) | REFACTOR (basis FK) |
| sector_contexts | shelved sector reference (15) | 15 | W0/R1 | 2 | yes | no | HALF-SLICE (C4:L813) | KEEP |
| sensitive_field_policy | k-anonymity policy rows for publish_aggregate | 4 | W1/R1 | 0 | no | no | UNWIRED (C4:L814) | TRASH (ADR-041/042) |
| signposts | forward signposts on assessments | 0 | W3/R4 | 1 | no | no | UNPROVEN (C4:L815) | REFACTOR (drop inference_record_id) |
| source_bias_tags | bias tags per source | 2895 | W3/R2 | 0 | yes | no | LIVE (C4:L816) | KEEP |
| source_citations | source-to-source citation edges | 742 | W1/R5 | 2 | no | no | LIVE (C4:L817) | KEEP |
| source_reliability_ledger | append-only signpost outcome ledger | 0 | W1/R2 | 0 | yes | no | UNPROVEN (C4:L818) | KEEP |
| source_tier_opinions | tier opinions per source | 371 | W2/R3 | 2 | yes | no | LIVE (C4:L819) | KEEP |
| source_trust_events | source trust event log | 908 | W10/R3 | 2 | no | no | LIVE (C4:L820) | KEEP |
| source_verifications | candidate verification log | 1414 | W1/R2 | 1 | no | no | LIVE (C4:L821) | KEEP |
| sources | source registry (2,572) | 2572 | W31/R77 | 4 | no | no | LIVE (C4:L822) | REFACTOR (drop tier shim + dead cols) |
| staged_updates | machine-gated intake transit rows | 38 | W4/R6 | 2 | yes | no | LIVE (C4:L823) | KEEP |
| state_cost_facts | sub-national cost facts (13 at AT1) | 13 | W1/R4 | 1 | no | no | UNWIRED (C4:L824) | REFACTOR (dimension CHECK, outbox) |
| statutory_computations | computed statutory figures | 0 | W1/R1 | 1 | yes | yes | HALF-SLICE (C4:L825) | KEEP |
| system_state | singleton: pause flag, scrape cadence, judgement drain | 1 | W1/R8 | 0 | yes | no | LIVE (C4:L826) | REFACTOR (grants) |
| system_state_flag_audit | trigger-written audit of flag changes (8) | 8 | W0/R0 | 0 | yes | no | HALF-SLICE (C4:L827) | KEEP |
| theme_briefs | generated theme briefs (9) | 9 | W1/R6 | 1 | no | no | LIVE (C4:L828) | KEEP |
| user_item_state | per-user archive state | 0 | W1/R3 | 4 | yes | no | LIVE (C4:L829) | REFACTOR (org_id membership) |
| user_watchlist | personal watchlist | 1 | W2/R4 | 3 | yes | no | LIVE (C4:L830) | REFACTOR (item_type CHECK = org_watchlist) |
| vocabulary_mentions | term mentions per item | 0 | W2/R2 | 1 | yes | no | UNPROVEN (C4:L831) | KEEP |
| vocabulary_terms | proposed/adopted vocabulary | 0 | W2/R5 | 1 | yes | no | UNPROVEN (C4:L832) | KEEP |
| workspace_item_overrides | per-org item overrides | 4 | W2/R5 | 4 | yes | no | LIVE (C4:L833) | KEEP |
| workspace_settings | per-org settings | 1 | W8/R12 | 3 | no | no | LIVE (C4:L834) | KEEP |
| workspace_tags | workspace tags | 0 | W4/R4 | 3 | yes | no | LIVE (C4:L835) | KEEP |
| census_rollup_by_surface (view) | VIEW: census rollup by surface over census_worklist | n/a | W0/R0 | n/a | yes | no | DEAD (C4:L836) | TRASH |
| derived_values_admissible (view) | VIEW: derived_values filtered to admissible with effective confidence | n/a | W0/R1 | n/a | yes | no | HALF-SLICE (C4:L837) | KEEP |
| emission_factor_candidates (view) | VIEW: ranked emission factor candidates | n/a | W0/R1 | n/a | yes | no | LIVE (C4:L838) | KEEP |
| licence_clear_sources (view) | VIEW: embeddable data_sources | n/a | W0/R2 | n/a | yes | no | LIVE (C4:L839) | KEEP |
| propagation_queue_depth (view) | VIEW: pending outbox count and oldest | n/a | W0/R0 | n/a | yes | no | DEAD (C4:L840) | TRASH |
| research_assessments_current (view) | VIEW: current research assessments | n/a | W0/R4 | n/a | no | no | LIVE (C4:L841) | KEEP |

Unused columns (no code reference outside migrations, tests and the dump) [CONFIRMED: `git grep -l -w -F <col> -- src scripts supabase/functions` returned 0 files, run 2026-10-12; dump grep shows only the column definition, its comment, a projection in `_workspace_active_items` or a guard trigger]: intelligence_items.region_tags (dump L777 projection only), intelligence_items.hidden_reason (kept by the 368 ruling, C3c notes; projection only), sources.api_endpoint_url (comment says reserved, 368), profiles.topic_interests, profiles.membership_tier and profiles.contribution_score (read only by profiles_privilege_guard, dump L4657-4658), profiles.linkedin_sub (+ UNIQUE profiles_linkedin_sub_key, dump L13233; the LinkedIn chain is TRASH in P1-01), census_worklist.resolved_into_id (C2:L95), signposts.inference_record_id (C3b:L90), sector_contexts.synopsis_prompt (shelved model). Further candidates with one to three code files (version_history 1, operational_impact 2, open_questions 3, cited_by 2, tier_history 3, avg_lead_time_days 3, lead_time_samples 3, pipeline_stage 3, affiliation_type 1) are [HYPOTHESIS] dead: the files were not read to tell a write from a comment.

RLS posture [CONFIRMED: dump; C4:L986-L993]: RLS on for 122 of 122; 25 tables have no policy and are deny-all to every role but service_role (C4:L986); anon holds table SELECT on 92 relations and no write anywhere (C4:L993); 8 policies serve the reconciler role (C4:L989). Read gates: intelligence_items_read requires verified and not archived for anon and authenticated; five child tables gate only on the parent not being archived, which the parent's own RLS narrows to verified (C4:L1137), except `changes_read_authenticated`, which lets any signed-in user read every intelligence_changes row (C4:L1138, 0 rows today).

Functions: 134; 61 are SQL-internal (trigger functions and helpers), the rest are RPCs (C4 section 5, C4:L848-L981 one row each). Views: 6 (C4:L836-L841): census_rollup_by_surface DEAD, propagation_queue_depth DEAD, derived_values_admissible no reader, emission_factor_candidates and licence_clear_sources live, research_assessments_current live.

## 3. Bloat, biggest first

| rank | what | lines | why | replacement |
|---|---|---|---|---|
| 1 | 387 migration files as the schema record | 53,582 raw lines in 352 .sql files [CONFIRMED: wc] | they no longer reproduce production: functions patched in place by pg_get_functiondef splices (C2:L171, C2:L189), files edited after apply (C3:L48), out-of-ledger applies (C2:L167, C2:L221), a retired file still replayed (C2:L132), stale headers on 21 files (C3a:L77, C3:L28) | the dump as ONE schema file, then one forward migration per change |
| 2 | Grants | 833 GRANT and REVOKE lines [CONFIRMED: grep] | every table granted SELECT to anon and CRUD to authenticated, then narrowed per table; default ACLs grant every new function to anon and every new supabase_admin table ALL to anon (dump L23251, L23271, L23281) [CONFIRMED read] | deny by default (ALTER DEFAULT PRIVILEGES revoke from anon, authenticated), then one explicit grant table |
| 3 | Read RPC family | about 639 lines over 16 live functions [CONFIRMED: fnsize census] | `_workspace_active_items` plus get_workspace_intelligence, _dashboard, _listings, _listings_public, _slim, _slim_public, _aggregates, get_market_intel_items, _public, get_operations_items_public, get_research_items_public, get_surface_counts, get_all_surface_counts, get_workspace_due_next, get_workspace_recent_changes; the 11-function set restated by hand five times with no generator (C3:L103, C3a:L170) | five: `_workspace_active_items`, `read_items(p_org_id nullable, p_surface, p_cursor, p_shape)`, `surface_counts(p_org_id)`, `due_next`, `recent_changes` |
| 4 | Policies that cannot change an outcome | 49 policies | service_role bypasses RLS, so a policy whose every expression is `auth.role() = 'service_role'` (or TO service_role USING true) never decides anything: agent_runs_service_role_all, changes_write_service, the eight community_*_service_role, connection_theme(s)_admin_write, holdings_quality_service_role_write, iiv_service_role_select_insert, integrity_flags_service_role_write, intelligence_items_admin_delete/insert/update, item_changelog_admin_write, item_cross_references_admin_delete/write, item_disputes_admin_update/write, item_gate_a_state_service_role_all, item_supersessions_admin_write, item_timelines_admin_update/write, moderation_reports_service_role, monitoring_queue_admin_update/write, notification_preferences_service_role, notifications_service_role, org_invitations_service_role, org_write_service, pff_service_role_all, provisional_sources_admin_update/write, raw_fetches_service_role_all, sector_contexts_write_service, "service role full access", source_citations_admin_write, source_trust_events_admin_insert, sources_admin_delete/insert/update, staged_updates_admin_update/write, summaries_update_service, summaries_write_service [CONFIRMED: normalised-expression match over the 214 policies]; 43 more carry a redundant `OR auth.role() = 'service_role'` arm | drop the 49; drop the redundant arm from the 43 |
| 5 | Jurisdiction normaliser | 405 + 66 + 47 lines (`_normalize_jurisdictions`, trigger, classifier) | a hand map of about 250 tokens in SQL | KEEP: it is the jurisdiction invariant at the write site; move the map to a table only if the vocabulary grows (no change now) |
| 6 | Dead tables and views | about 400 lines | coverage_gap_census_findings (C2:L187), funded_pass_runlock (C2:L170), aggregate_query_log and sensitive_field_policy (C3:L147), coverage_gaps (dash-search.md:L268), brief_apply_runs (runtimes-a.md:L289), corpus_census (C2:L177), census_rollup_by_surface and propagation_queue_depth (C4:L836, C4:L840) | drop after export (section 8 rulings) |
| 7 | Redundant indexes | 34 | exact duplicates idx_memberships_user = idx_org_memberships_user_id; UNIQUE-backed duplicates idx_organizations_slug, idx_regions_code, idx_workspace_settings_org, idx_rdc_region_dim; prefix-redundant others (census_worklist_source_idx, derivation_edges_from_idx, entity_refs_ref_idx, idx_agent_run_searches_item_id, idx_agent_runs_started_desc, idx_citations_citing, idx_community_posts_group, idx_item_sections_item_id, idx_overrides_org, idx_trust_events_source, source_bias_tags_source_id_idx and 18 more) [CONFIRMED: prefix comparison over the parsed indexes and PK/UNIQUE constraints; two partial indexes the first pass flagged were removed by hand] | drop |
| 8 | Vocabularies as repeated CHECKs | about 120 lines | derivation (9 values) and origin_class (7) repeated across about eight tables; lifecycle (8) twice; mode alias list twice and divergent (obligations adds multimodal); event_kind twice; binding_position twice; dimension 7 on regional_data_facts and region_dimension_coverage but 6 on state_cost_facts (dump L10674, L10620, L11911); user_watchlist item_type 5 vs org_watchlist 6 [CONFIRMED read]; six tier vocabularies across sources, provisional_sources, tier opinions, price statistics and verifications (sources-a.md:L137) | one vocabulary each: a domain or a generated CHECK from vocabularies.mjs with a parity test (INV-303) |
| 9 | Tier compatibility shim | sources.tier + sync trigger + CHECK sources_tier_matches_base_tier | declared temporary in 094, still live (C1:L121) | drop the column and trigger after the readers move to base_tier |

## 4. Dead code

| path:line | symbol | kind | evidence |
|---|---|---|---|
| schema-2026-10-12.sql (reorder_user_list_item, 81 lines) | reorder_user_list_item | function | body references user_list_order, dropped by 343; every call fails (C2:L1580); no caller (C4:L959) [CONFIRMED by citation] |
| schema-2026-10-12.sql | get_workspace_intelligence_aggregates_scoped | function | no rpc call site; names in surface-of.mjs:61 comment only (C4:L910) [CONFIRMED by citation] |
| schema-2026-10-12.sql | acquire_funded_pass_lock, heartbeat_funded_pass_lock, release_funded_pass_lock, table funded_pass_runlock | functions, table | caller and golden deleted by REG-1; F14 allowlists them as owed a drop (C2:L170, C2:L1581) [CONFIRMED by citation] |
| schema-2026-10-12.sql | publish_aggregate, bucket_value, bucket_width_multiplier, tables aggregate_query_log, sensitive_field_policy | functions, tables | no code caller; only subject (community benchmark) dropped by 349 (C3:L147, C3a:L174) [CONFIRMED by citation] |
| schema-2026-10-12.sql | move_override_notes_to_item_notes | function | 0 code refs; staged one-time move, held by 388 (C3b:L95) [CONFIRMED by citation]; HELD, not trashed (ruling) |
| schema-2026-10-12.sql | gate_a_health_refresh | function | no caller, cache dormant by ruling (C4:L897, C4:L1081) [CONFIRMED by citation]; HELD (ruling) |
| schema-2026-10-12.sql | census_rollup_by_surface, propagation_queue_depth | views | no consumer (C4:L1089) [CONFIRMED by citation] |
| schema-2026-10-12.sql | coverage_gap_census_findings, coverage_gaps, corpus_census, brief_apply_runs | tables | no runtime reader or writer, or superseded (C2:L187, dash-search.md:L219, C2:L177, runtimes-a.md:L289) [CONFIRMED by citation] |
| schema-2026-10-12.sql | the unused columns listed in section 2 | columns | 0 code files [CONFIRMED: git grep run 2026-10-12] |
| fsi-app/supabase/seed.sql:5 | seed.sql | seed | inserts into resources, timelines, changelog, disputes, cross_references, supersessions, all dropped by 013 [CONFIRMED: grep of INSERT INTO targets: 123 resources, 110 timelines, 50 cross_references, 9 changelog, 7 disputes, 5 supersessions] |
| fsi-app/supabase/seed/seed-community.sql | seed-community.sql | seed | comments only (C3:L296) [CONFIRMED by citation] |
| fsi-app/supabase/seed/*.mjs, seed-sources.sql, seed-dev-workspace.sql | 15 files | one-shot scripts and bootstrap seeds | no .github or package.json reference; `[db.seed] enabled = false` [CONFIRMED: grep and config.toml:39-40] |

Count by token: 16 rows [CONFIRMED] (10 by citation, 6 by a command run this session), 0 [HYPOTHESIS], 0 [REFUTED]. The [HYPOTHESIS] dead-column candidates are in section 2 and not counted here.

## 5. Duplicates and over-abstraction

- Read RPC family (section 3 rank 3): one parameterised read replaces eleven listing functions; `_public` variants become `p_org_id IS NULL` on the same function, gated by the grant, not by a second body.
- Two user-id targets: 24 foreign keys to auth.users and 16 to profiles [CONFIRMED: FK parse]; profiles.id references auth.users ON DELETE CASCADE (C2:L208), so both are coherent; the clean schema points user columns at profiles(id) for one target.
- Three membership oracles: user_is_group_admin, user_is_group_member, user_owns_group take a caller-supplied user id and are anon-executable (C4:L1083); the clean helpers take no user argument and read auth.uid().
- Two status ledgers for runs: harness_runs and brief_apply_runs (and the never-created d3_runs, capture.md:L94): one ledger (harness.md:L356).
- Authority floor and REG_FAMILY live in SQL and in two JS files (mint.md:L118): the SQL is the source, one JS mirror with a parity test.
- canonicalize_citation_url mirrored in src/lib/agent/url-canon (C2:L414): keep the parity test.
- Tier labels in six places (sources-a.md:L137): one tier contract; the schema keeps base_tier, tier_override and effective_tier only.

## 6. Non-essential artifacts

- `fsi-app/supabase/migrations/` (352 .sql files, APPLIED-MAP.json, `_lib/`), `fsi-app/supabase/rollbacks/` (22 files; 333 is stale against 339, C3:L302): history, not ported; git keeps them.
- `fsi-app/supabase/seed/b2-progress.log` and the untracked apply-051.mjs and apply-pending.mjs (C3:L298, C3:L300): local, gitignored.
- Comments in the dump that contradict the object (fix while porting): derived_values_admissible and research_assessments_current say "not security_invoker" while created invoker; sensitive_field_policy says k_min >= 5 against CHECK >= 10 (C3:L202); integrity_flags category lists 6 of 7; section_claim_provenance names a dropped verified_by; org_watchlist claims lockstep with user_watchlist; agent_run_searches names result_content_excerpt; raw_fetches says "one row per successful Browserless render"; entity_scope says unpopulated with 8 rows [CONFIRMED read in the dump].
- `\restrict` line 8 and `CREATE SCHEMA public;` line 28 of the dump: pg_dump 15.14 output that a plain psql apply to an existing database refuses (section 8 proof).

## 7. File register

| path | lines a-b (total) | responsibility | KEEP/REFACTOR/TRASH | clean estimate | consumers (count + top 3) | note |
|---|---|---|---|---|---|---|
| docs/plans/rebuild/schema-2026-10-12.sql | 1-23291 (23291) | the production schema | REFACTOR AND PORT | 8,201 code lines | every module (all 25 Part 1 registers name tables in it) | becomes supabase/schema.sql in the new tree (section 8) |
| fsi-app/supabase/functions/capture-worker/index.ts | 1-614 (614) | first-fetch capture: claim, fetch, PDF text by unpdf, store, flag | KEEP AS-IS (port owned by P1-07) | 0 here (P1-07 counts it) | 2: fetch-drain.yml via scripts/turns/run-fetch-drain.mjs; capture_worker_fetch via pg_net (C3:L293) | FREE (no Browserless, no model); no caller check and no kill-switch read (index.ts:222-256) [CONFIRMED read]; P1-07 capture.md section 8 owns the auth and kill-switch fix |
| fsi-app/supabase/seed.sql | 1-1318 (1318) | March 2026 bootstrap into dropped tables | TRASH | 0 | 0 | section 4 |
| fsi-app/supabase/seed/seed-sources.sql | 1-1168 (1168) | April 2026 source registry seed | TRASH | 0 | 0 runtime; fsi-app/.claude/CLAUDE.md "Key Files" names it | the registry is live data (2,572 rows), same project; fsi-app/.claude/CLAUDE.md Key Files line goes stale |
| fsi-app/supabase/seed/seed-dev-workspace.sql | 1-45 (45) | Dietl/Rockit dev organisation | TRASH | 0 | 0 | writes organizations.plan='enterprise' (C3:L295); proof fixtures live in scripts/proof/attacks/fixtures.mjs |
| fsi-app/supabase/seed/seed-community.sql | 1-20 (20) | comments only | TRASH | 0 | 0 | |
| fsi-app/supabase/seed/apply-113.mjs, apply-114.mjs, apply-119.mjs, apply-121.mjs, apply-135.mjs | 141, 388, 98, 129, 75 | one-shot direct appliers | TRASH | 0 | 0 | C3:L297 |
| fsi-app/supabase/seed/W4_1_iso_backfill.mjs, add-tech-sources.mjs, apply-known-demotions.mjs | 505, 39, 293 | one-shot data scripts | TRASH | 0 | 0 | C3:L299 |
| fsi-app/supabase/seed/audit-tier-h-spot-check.mjs | 1-728 (728) | tier spot-check by Haiku | TRASH | 0 | 0 | PAID: claude-haiku call at :381 (Anthropic SDK :44, :68, model :78) [CONFIRMED grep]; replacement: the FREE spot-check is owned by P1-05 sources-a |
| fsi-app/supabase/seed/canonical-source-discover.mjs | 1-235 (235) | canonical-source discovery by Sonnet web_search and Browserless | TRASH | 0 | 0 | PAID: api.anthropic.com at :72 (claude-sonnet-4-6 :81, web_search beta :78) and browserlessFetch at :107 [CONFIRMED grep]; replacement: the FREE discovery ladder owned by P1-05/P1-06 |
| fsi-app/supabase/seed/b2-runner.mjs | 1-154 (154) | superseded B2 regeneration runner | TRASH | 0 | 0 | fsi-app/.claude/CLAUDE.md calls it superseded |
| fsi-app/supabase/seed/perf-capture.mjs | 1-330 (330) | preview perf capture | TRASH | 0 | 0 | perf measurement is owned by the perf playbook scripts |
| fsi-app/supabase/seed/triage-integrity-flags.mjs | 1-827 (827) | read-only triage of migration-035 flags | TRASH | 0 | 0 | header: READ-ONLY |

## 8. Build plan for this module

### New files

| new path | from old path(s) (lines a-b) | responsibility | estimated LOC |
|---|---|---|---|
| supabase/schema.sql | schema-2026-10-12.sql 1-23291, minus the drops and plus the additions below | the one schema file; the only CREATE statements in the tree | 8,201 |
| supabase/migrations/NNNN_<change>.sql | none | forward changes after the baseline, one per change, each with a DO-block self-check (the 352+ pattern) | per change |
| src/core/db/schema-keys.ts | scripts/lib/table-primary-keys.mjs 1-116 (harness.md:L226) | primary keys generated from supabase/schema.sql (no hand map; 5 stale and 13 missing today, C3a:L187) | 60 |
| scripts/proof/schema-apply-check.mjs | scripts/proof/apply-schema-dump.mjs, replay-migrations.mjs, schema-diff.mjs (B2p2:L14, L52, L58) | apply schema.sql to an empty Postgres of the production major version; run the property checks; diff against the last production dump | 200 |

The migration tooling harness.md:L303 assigns to P1-11 (migration-compare, build-applied-map, migration-history-diff, sync-applied-migrations, generate-migrations-inventory, 405 LOC) is NOT ported: with one schema file there is no history map to reconcile. The inventory page becomes the list of forward migrations.

### Data model: what is dropped, added and changed

Dropped (each a forward migration after the baseline; rows exported first where a table holds data, the 184 precedent):
- Tables: coverage_gap_census_findings (116 rows), corpus_census (655 rows), coverage_gaps (2 rows), brief_apply_runs (3 rows, after the harness ledger lands), funded_pass_runlock (0), aggregate_query_log (0), sensitive_field_policy (4 seed rows).
- Views: census_rollup_by_surface, propagation_queue_depth.
- Functions: reorder_user_list_item, get_workspace_intelligence_aggregates_scoped, acquire/heartbeat/release_funded_pass_lock, publish_aggregate, bucket_value, bucket_width_multiplier; the eleven listing RPCs after `read_items` lands.
- Columns: the unused columns of section 2; sources.tier with sync_sources_tier_columns and its CHECK; profiles LinkedIn columns with P1-01's chain; notification_preferences.on_promote and the `promote` notification kind (ADR-041; workspace.md:L287, capture.md:L230).
- Policies: the 49 of section 3; the redundant service_role arm of 43 more.
- Indexes: the 34 redundant ones.
- Extensions: ltree, pg_trgm (unused); pg_cron stays installed only if the operator wants a scheduler after build mode (rule 16 holds cadence off).

Added (lane hand-overs):
- community-b.md:L299: `create_group_for_self`, `accept_group_invitation`, `create_thread`, `decide_signoff`, `moderate_report`, `community_directory_counts`, `community_notification_counts` (SECURITY DEFINER, auth.uid() inside, pinned search_path); table `community_group_bans (group_id, user_id, banned_by, banned_at, reason)`; moderation_reports `body`, `action_taken`, `action_notes`; group name and description length CHECKs (community-b.md:L169, ruling below).
- harness.md:L356: the one ledger (`harness_runs` reshaped: id uuid, family, root_run_id, upstream_run_id, trigger, mode, forced_dry, outcome, reason, inputs, outputs, error, code_sha, github_run_id, started_at, finished_at not null); brief_apply_runs and d3_runs fold into it.
- mint.md:L229: `screen_verdicts (census_id, verdict, basis, reviewer, ruled_at)` replacing reviewed-verdicts.json.
- flywheel-b.md:L377: an outbox trigger on item_corrections (ruling below).
- One index per unindexed foreign key (82; e.g. agent_runs.intelligence_item_id, item_notes.org_id, profiles.org_id, item_forward_events.source_claim_id) [CONFIRMED: FK-leading-column comparison].
- `SET search_path = public, pg_temp` on the 29 invoker functions without one (C2:L542 names the class) [CONFIRMED: dump header scan].
- market.md:L275 proposes `market_series_items (series_key pk, item_id fk, status)`: recorded, ADR owed by P1-20 before the schema adds it.

Changed:
- Four ON DELETE SET NULL foreign keys that cannot set null: community_groups.owner_user_id NOT NULL (dump L7012, L16545), community_post_signoff_requests.requested_by NOT NULL (L7111, L16569), bulk_imports.imported_by NOT NULL (L6575, L16457), section_claim_provenance.basis_claim_id under CHECK scp_derived_requires_basis (L10982, L17648) [CONFIRMED read]: deleting the referenced row fails. Change to ON DELETE RESTRICT (owner transfer first) or make the column nullable where the CHECK allows.
- monitoring_queue_last_result_check (dump L9650) allows no_change, updated, new_item, error, inaccessible; check-sources writes change_detected, inconclusive and dead (capture.md:L139) [CONFIRMED: dump line read; writer cited]: one vocabulary.
- state_cost_facts dimension CHECK gains grid_intensity and an outbox trigger, because derivation_edges admits state_cost_facts as an input (C3a:L137) [CONFIRMED: dump L11911 and the from_table allowlist].
- user_watchlist item_type admits market_series like org_watchlist (C2:L1228).
- changes_read_authenticated replaced by the parent-gated read (C4:L1138).
- user_item_state and user_watchlist insert/update tie org_id to membership (C4:L991).
- Membership helpers stop taking a caller user id (C4:L1083).
- The 25 policies that still call auth.role() or auth.uid() unwrapped get the initplan wrap (`(select auth.uid())`) [CONFIRMED: policy text scan of the dump, e.g. item_notes_read_org L19167; all created after migration 262].
- Default privileges: revoke from anon and authenticated for tables, functions and sequences owned by postgres and supabase_admin; anon loses ALL on the three sequences (C4 default ACL rows; dump L23230-L23283).
- Invoker functions that write (register_inference_record, register_derived_value, invalidate_dependents) and the trigger functions lose PUBLIC, anon and authenticated EXECUTE (dump L21622, L21613, L21077) [CONFIRMED read].
- capture_worker_fetch reads the project URL from vault, not a literal project ref in the body (dump body, C4:L1000); the anon JWT literal at migration 256:131 stays in git history (C2:L84) and is rotated by the operator (ruling below).
- admin_attention_counts loses the two literal-0 columns (C1:L123).
- derivation_edges: the FK on to_value_id was dropped for the polymorphic target (C3:L194); validity is held by register_derived_value and register_inference_record only; a trigger checking the target row by to_table restores it.

Kept by ruling (no change without the operator): intelligence_summaries and sector_contexts (SHELVED, fsi-app/.claude/CLAUDE.md Sector Activation), gate_a_health_cache with gate_a_health_compute and gate_a_health_refresh (cache dormant by ruling 2026-08-10, C4:L1081), move_override_notes_to_item_notes (no population until all layers, C3b:L95), derived_values_admissible (held by 388), estimated_values (spec 08 statutory isolation), item_disputes and item_supersessions (frozen rows shown on detail), disposition_ledger and system_state_flag_audit (terminal sinks, F14/F47), intelligence_item_versions (26 MB change store, no reader; C4:L1088), entity_relations (writer owed, C3c:L95), obligation_objects (candidate producer owed, obligations.md:L245), holdings_quality.

### Interface to other modules (by lane id)

- Offered to every module: supabase/schema.sql and src/core/db/schema-keys.ts; the RPCs `read_items`, `surface_counts`, `due_next`, `recent_changes`, `search_intelligence_items`, `validate_item_provenance`, `create_item_correction`, `revoke_item_correction`, `register_derived_value`, `register_inference_record`, `invalidate_dependents`, `admin_set_pause_state`, `admin_set_judgement_drain`, `capture_worker_fetch`, `is_platform_admin`, `user_can_write_in_org`, `accept_invitation`, `create_org_for_self`, `my_profile`, `community_identity`, and the seven community RPCs.
- P1-01 auth-db and P1-02 workspace and P1-18 shell-list and P1-19 regulations and P1-20 market and P1-21 research-ops and P1-24 dash-search: the read RPC family collapses to `read_items`; their fetchers call one function.
- P1-03/P1-04 intake and P1-14 mint: provenance gate, required slots (migration 299 ruling), screen_verdicts, the update_item column allowlist (intake-b.md:L299) is enforced in staged-transit code, not the schema.
- P1-05/P1-06 sources: one tier vocabulary; OECD, IEA, World Bank and IPCC re-tier migration after the operator rules (sources-a.md:L370); intelligence_changes read policy (B-0479).
- P1-07 capture: monitoring_queue.last_result vocabulary; capture-worker auth and kill switch.
- P1-08 harness: the ledger table and generated keys.
- P1-09/P1-10 flywheel: outbox on item_corrections and state_cost_facts; derivation_edges allowlist widening is their ruling (flywheel-b.md:L378).
- P1-12/P1-13/P1-15 runtimes and producers: leases (mutation_leases kept), pause and drain switches.
- P1-16 obligations, P1-22/P1-23 community, P1-25/P1-26 admin: as listed above.

### Invariants this schema enforces

Already in data-invariants.md and carried: INV-069 (replay equals production; becomes "schema.sql equals the production dump"), INV-138 (every SECURITY DEFINER function has an explicit grant list and a pinned search_path), INV-139 (RLS on every table, anon SELECT only), INV-037 and INV-079 (CHECK inventory equals live), INV-144, INV-147. Appended this lane: INV-299 to INV-307 (data-invariants.md, citing this section): every foreign key indexed; no ON DELETE SET NULL onto a column that cannot be null; every function search_path pinned and no anon or authenticated EXECUTE on an invoker function that writes; code-written vocabularies equal their CHECKs; every derivation input table has an outbox trigger; no function body references a missing relation; every policy wraps auth calls; default privileges grant nothing to anon or authenticated; schema.sql applies to an empty Postgres of the production major version with zero errors.

### Rulings the schema embodies (cite) and rulings owed (decision-ready, rule 13)

Embodied: build mode holds cadence off (CLAUDE.md rule 16; system_state.scrape_cadence default off, guard_pause_flag_writer); a source's figure is rated, not refused (rule 18; validate_item_provenance criterion 3 warnings, migration 302); provenance flips to verified only through the reconciler or a trigger (migration 250, C2:L211); ADR-041 community social only; ADR-042 external data only; ADR-016 storage ceiling; no human gate on intake (RD-20, migration 121).

Owed (each with the mechanism ready):
1. Migration 299 (four required slots): apply in the baseline with the re-mint pass, or drop the kit-only slots (mint.md:L277). Recommendation: apply with the re-mint, since the kit already requires them.
2. Correction outbox: emit a propagation event on item_corrections insert and revoke (flywheel-b.md:L377). Recommendation: yes, entity = the item's instrument entity.
3. Dead-table drops with data (coverage_gap_census_findings 116, corpus_census 655): export to the private backups repo first (184 precedent), then drop.
4. intelligence_summaries and sector_contexts: keep shelved (current ruling) or retire with export.
5. gate_a_health: keep the dormant cache (probe returns its stale-cache error) or compute on read for the service role only.
6. Anon JWT literal in migration 256:131 (role anon, expires 2035-03-02, C2:L84): rotate the anon key and re-vault; history rewrite is not required for an anon key but rotation is.
7. Community group name and description limits (community-b.md:L169): one CHECK pair, values from the operator (120/1,000 at create vs 80/600 at rename today).
8. SEC-9 (PR 1098, migration 386, 49 anon SELECT revokes): lands in the baseline as the grant table; the 30 roles-{public} SELECT policies that need an identity (C3c:L132) are rewritten TO authenticated in the same table.

### Proof that the schema works in the new tree

One CI workflow step (the ci.yml schema job, which today runs only on PRs that touch schema scope, C2:L1585) runs on every PR:
1. Start an empty Postgres of the production major version (15.14 per dump line 10; config.toml says 17, a mismatch to fix, B-2049) with the Supabase roles and the stub schemas the dump needs: roles anon, authenticated, service_role, supabase_admin, reconciler; schema auth with uid(), role() and users; schema extensions with pgcrypto; schema vault with decrypted_secrets; schema net with http_post.
2. Apply supabase/schema.sql with ON_ERROR_STOP; zero errors. The prior oracle step (apply-schema-dump.mjs) failed in 10 of 10 chain-proof runs, the newest with 8 fatal errors (C3:L42, B2p2:L14). Candidate causes [HYPOTHESIS: not executed]: `CREATE SCHEMA public;` (dump L28) against an image that already has public, the `\restrict` meta-command (dump L8) on an older psql, and missing stub objects; the step must print each error so the cause is fixed, not tolerated.
3. Property checks (each must fail on a seeded violation first, rule 15): RLS on for every table; no anon or authenticated grant beyond the grant table; no anon write privilege; every foreign key indexed; no SET NULL onto a NOT NULL or CHECK-required column; every function search_path pinned; no function body references a missing relation; every policy wraps auth calls; every derivation input has an outbox trigger; every code-written vocabulary equals its CHECK.
4. Catalog diff (schema-diff.mjs) of the applied file against the last production dump: zero differences except the listed forward migrations.
5. The existing attack suites (RLS persona matrix, view and system-function attacks, definer and count RPC attacks, route attacks; C3:L286) run on the applied file.

### Port order

1. Baseline: commit supabase/schema.sql equal to the 2026-10-12 dump byte for byte (proof steps 1-2 and 4 green with zero forward changes). Data untouched, same project.
2. Property-check script red on the current baseline for each finding above, then the forward migrations that turn each green: grants and default privileges, foreign-key indexes, SET NULL fixes, search_path pins, vocabulary CHECKs, initplan wraps.
3. Additions owed to lanes (community RPCs and ban table, harness ledger, screen_verdicts, item_corrections outbox) in the order those lanes port.
4. The read-RPC collapse after the surface fetchers move to `read_items`.
5. Drops last, after exports and rulings.

### Everything FREE

No function in the schema calls a metered service [CONFIRMED: capture_worker_fetch is the only function that calls net.http_* (C4:L1000) and it calls the project's own edge function]. The edge function capture-worker fetches with plain HTTP and extracts PDF text with unpdf (index.ts:68-69, 386-388) [CONFIRMED read]: FREE. Paid-service residue in the schema is data, not calls: agent_runs.cost_usd_estimated and model, provisional_sources and canonical_source_candidates recommended_classification (filled by Haiku routes), corpus_census haiku_* columns, source_bias_tags and source_tier_opinions haiku_* provenance values, raw_fetches described as Browserless renders [CONFIRMED read]. Keep the history columns; the routes that fill them are other lanes' replacements. Paid call sites in scope: seed/audit-tier-h-spot-check.mjs:381 (Haiku) and seed/canonical-source-discover.mjs:72 (Sonnet web_search) and :107 (Browserless) [CONFIRMED grep]; both TRASH, replaced by the free ladders P1-05/P1-06 own.

### Every feature the schema delivers (a feature with no row is a lost feature)

| feature | where today | where in the new tree |
|---|---|---|
| Five-surface reads gated on verified | read RPC family, intelligence_items_read | read_items, surface_counts |
| Provenance gate (criteria 1-7) and status flip | validate_item_provenance, set_provenance_status, guard_provenance_flip | kept as is |
| Required slots per item type | item_type_required_slots (48 rows) | kept; 299 ruling |
| Canonical key dedup, source-archive guard | set_canonical_instrument_key, _guard_source_archive | kept |
| Jurisdiction normalisation and review queues | _normalize_jurisdictions, pending_jurisdiction_review, ingest_rejections | kept |
| Admin corrections layer | item_corrections and 13 functions | kept; outbox added |
| Decision propagation (outbox, DAG, derived values, inferences, statutory isolation) | propagation_events, derivation_edges, derived_values, inference_records, statutory_computations, estimated_values | kept; target check on derivation_edges |
| Prediction scoring and source reliability | signposts, research_assessments, source_reliability_ledger | kept |
| Entity spine | entities, identifiers, refs, scope, aliases, relations | kept |
| Emission factors and licence gate | emission_factors, data_sources, licence_clear_sources | kept |
| Market series and price board | market_series, published_price_statistics | kept |
| Operations facts and coverage | regions, regional_data_facts, region_dimension_coverage, state_cost_facts | kept; state_cost_facts CHECK and outbox |
| Spec 09 panels | oem_tech_roadmaps, indexation_clauses, reroute_events, auxiliary_energy_profiles, grid_connection_queues | kept |
| Obligations and forward events | item_forward_events, obligations, obligation_objects | kept |
| Capture, first fetch, change detection, portal harvest, census | pending_first_fetch, agent_runs, agent_run_searches, raw_fetches, monitoring_queue, intelligence_changes, portal_link_candidates, census_worklist, capture_worker_fetch | kept; last_result CHECK |
| Source credibility | sources, provisional_sources, canonical_source_candidates, source_tier_opinions, source_bias_tags, source_trust_events, source_verifications, source_citations, institutions | kept; tier shim dropped |
| Tenancy and workspace | organizations, memberships, invitations, bans, settings, overrides, tags, notes, assignments, portfolios, watchlists | kept |
| Community (social) | community_* tables, moderation_reports, notifications | kept; ban table and RPCs added |
| Operator switches and audit | system_state, guard triggers, system_state_flag_audit | kept |
| Integrity flags, error log, harness ledger, holdings audit, leases | integrity_flags, error_events, harness_runs, holdings_quality, mutation_leases | kept; ledger reshaped |
| Admin attention counts, coverage matrix, tier disagreements, citation stats, research coverage | admin_attention_counts, coverage_matrix, get_tier_opinion_disagreements, get_source_citation_stats, get_research_source_coverage | kept; two zero columns dropped |
| Full-text search | search_tsv, search_intelligence_items | kept |
| Version history of items | intelligence_item_versions trigger | kept by ruling |
| Shelved sector synopses | intelligence_summaries, sector_contexts | kept by ruling |
| Antitrust k-floor aggregates | publish_aggregate, sensitive_field_policy | TRASH: no subject after ADR-041/042; if a community aggregate returns, the k-floor returns with it (ADR-035) |
| Funded-pass run lock | funded_pass_runlock trio | TRASH: no caller; mutation_leases is the live lease |
| Personal list order | reorder_user_list_item | TRASH: table already dropped (343) |
| Coverage gaps widget v1 | coverage_gaps | TRASH: replaced by the Coverage surface (dash-search.md:L219) |
| Census findings rollup, corpus census | coverage_gap_census_findings, census_rollup_by_surface, corpus_census | TRASH after export |

### Defects the new schema must not repeat (BACKLOG rows in scope)

252 rows under fsi-app/supabase carry a STATUS cell written in this commit (the one capture-worker row was already set by P1-07): 179 TRASH (the migration file and its re-apply, header or history question retire with the files), 50 CONFIRMED-P1 (live-object findings carried above), 18 CLOSED: PR 1160 (the dump now records the bodies, policies and catalog the rows could not read), 5 REFUTED (B-0937, B-0951, B-0952, B-2076: the 260, 384 and 385 objects are in the production dump; B-2068: C3a:L87) [CONFIRMED: count of the written cells].
