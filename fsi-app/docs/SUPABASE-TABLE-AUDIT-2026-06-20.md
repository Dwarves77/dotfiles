# Supabase Table Audit — Caro's Ledge

**Date:** 2026-06-20
**Method:** pg-direct authoritative live inventory (information_schema) + three-way reconcile (live ∩ declared-migrations ∩ code-referenced) + per-table write/read/RPC site analysis across `src/` and `scripts/`.
**Scope:** READ-ONLY. No DB writes performed. 80 live base tables + 4 views.

---

## Summary

- **Live base tables:** 80 (+ 4 views: `active_intelligence_items`, `open_conflicts`, `provisional_sources_review`, `source_health_summary`).
- **Declared in migrations but NOT live (correctly dropped):** 7 — `source_registry` (dropped mig 004), `supersessions`, `cross_references`, `disputes`, `changelog`, `timelines`, `resources` (all dropped mig 013). These are the *legacy* halves of the duplicate clusters; their `item_*` successors are live. Not a problem — clean drops.
- **Live but NOT declared in any committed migration:** 4 — `intelligence_items_pre_phase5`, `ingest_rejections_pre_phase5`, `item_supersessions_pre_phase5`, `pending_jurisdiction_review_pre_phase5`. These are ad-hoc `CREATE TABLE AS` Phase-5 snapshot backups (no migration). **Drop candidates** (forensic backups, no code path).
- **Code-referenced but NOT live (code↔live MISMATCH):** 4 — `d3_runs`, `item_claims`, `discovery_provenance`, `sector_activation_interest`. See "Code↔Live Mismatches" below. `d3_runs` is the live concern (a hook writes to it).

### Classification counts (80 live tables)

| Classification | Count | Tables |
|---|---|---|
| **LIVE-WIRED** | 34 | intelligence_items, sources, provisional_sources, canonical_source_candidates, staged_updates, integrity_flags, community_groups, community_group_members, community_group_invitations, community_posts, community_topics, moderation_reports, post_promotions, notifications, notification_preferences, notification_subscriptions, org_memberships, org_invitations, organizations, profiles, workspace_settings, workspace_item_overrides, source_trust_events, source_verifications, source_conflicts, source_tier_opinions, source_bias_tags, source_citations, agent_runs, agent_run_searches, intelligence_item_sections, section_claim_provenance, pending_first_fetch, system_state |
| **APP-READ-ONLY** | 13 | regions, regional_data_facts, region_dimension_coverage, coverage_gaps, sector_contexts, item_timelines, item_cross_references, item_disputes, item_supersessions, item_changelog, item_type_required_slots, admin_action_cooldowns, monitoring_queue |
| **WRITE-ONLY** | 9 | intelligence_item_versions, intelligence_item_citations, intelligence_changes, raw_fetches, ingest_rejections, pending_jurisdiction_review, intelligence_items_domain_backfill_audit, institutions, bulk_imports |
| **SCRIPT-ONLY** | 4 | ingestion_state, ingestion_control_log, intelligence_summaries (shelved), sector data audits |
| **DEAD** | 12 | forum_sections, forum_threads, forum_replies, case_studies, case_study_endorsements, vendors, vendor_endorsements, vendor_regulations, vendor_technologies, community_topic_groups, taxonomy_nodes, user_profiles |
| **EMPTY-UNUSED** | 8 | briefings, notification_events, notification_deliveries, org_watchlist, user_watchlist + (overlap with DEAD: case_study_endorsements, vendor_*) |
| **`*_pre_phase5` snapshots** | 4 | drop candidates (backups, not declared) |

> Note: a few tables sit on a boundary (e.g. `notification_events`/`notification_deliveries` have an app write path but 0 rows and no read → counted under EMPTY-UNUSED with a write site). The per-table matrix is authoritative; the summary buckets are a guide.

---

## Headline findings

1. **DEAD `forum_*` cluster (3 tables, 17+0+0 rows).** `forum_sections` (17 rows), `forum_threads` (0), `forum_replies` (0) defined in migration 007 (community layer) but **superseded by the `community_*` cluster**. Zero `src/` references; the live community surface (`/community`, `/api/community/*`) reads `community_posts`/`community_groups`/etc. Drop candidates.
2. **DEAD `vendors` cluster (4 tables, all 0 rows).** `vendors`, `vendor_endorsements`, `vendor_regulations`, `vendor_technologies` (migration 007). Zero rows, zero `src/` references. Never built out. Drop candidates.
3. **DEAD `case_studies` cluster (2 tables).** `case_studies` (6 rows), `case_study_endorsements` (0). Migration 007. Zero `src/` references — the 6 rows are orphaned seed data. Drop or wire.
4. **DEAD `user_profiles` (1 row).** Migration 027. **Superseded by `profiles`** — documented in `OnboardingWizard.tsx:184` and `UserProfilePage.tsx:34-46` as the table the app migrated AWAY from. The live `profiles` table (2 rows, 37 cols) is the canonical replacement. Drop candidate.
5. **DEAD `taxonomy_nodes` (38 rows) & `community_topic_groups` (0 rows).** No `src/` references.
6. **WRITE-ONLY `institutions` (432 rows).** Populated by script; FK `sources.institution_id` set on 722 sources. But the canonical tier resolver (`src/lib/sources/institution.ts`) computes tier **in-memory** and never reads the table, and **no view/RPC joins `institutions`**. The grouping dimension is written but never read back — orphaned output.
7. **WRITE-ONLY trigger-output tables.** `intelligence_item_versions` (1279 rows, populated by mig-053 trigger) and `intelligence_item_citations` (750 rows, mig-089 trigger) are audit/version outputs with **no app read path**. Intentional audit trail, but confirm whether the version history surface was ever built.
8. **Code↔live MISMATCH — `d3_runs`.** `src/lib/d3/hooks.mjs:26` does `supabase.from("d3_runs").insert(...)` and `hooks-reconstruction.mjs:41` selects from it, but **`d3_runs` does not exist live** (no table, view, or matview). The D3 hook write silently errors. (3 other phantom tables — `item_claims`, `discovery_provenance`, `sector_activation_interest` — are diagnostic-script probes only.)
9. **`*_pre_phase5` snapshot tables (4).** Live but undeclared `CREATE TABLE AS` backups from the Phase-5 migration. Forensic only; drop candidates.

---

## Code↔Live Mismatches (code references a non-existent table)

| Referenced table | Where | Severity | Notes |
|---|---|---|---|
| `d3_runs` | `src/lib/d3/hooks.mjs:26` (INSERT), `src/lib/d3/hooks-reconstruction.mjs:41` (SELECT), 3× `scripts/tmp/*-bundle.mjs` | **REAL** — app-path write | Table absent live. D3 hook insert errors silently; the `error` is destructured (`const { error }`) so it doesn't throw, but the run is never recorded. Either create `d3_runs` or remove the hook write. |
| `item_claims` | `scripts/_diag/_quarantine-why.mjs:13`, `scripts/_diag/_two-reg-state.mjs:10` | low | Diagnostic probes only. Likely renamed to `section_claim_provenance`. |
| `discovery_provenance` | `scripts/audit-leadtime-vertical-mode.mjs:72,76` | low | Audit script probing for a table that doesn't exist (returns null/error; script handles it). |
| `sector_activation_interest` | `scripts/audit-leadtime-vertical-mode.mjs:206` | low | Same audit script. The actual columns live on `workspace_settings` (`notify_on_sector_activation`), not a separate table. |

---

## DEAD / DROP CANDIDATES

| Table | Rows | Defining migration | Reason |
|---|---|---|---|
| `forum_sections` | 17 | 007_community_layer | Superseded by `community_*`; 0 `src/` refs |
| `forum_threads` | 0 | 007_community_layer | Superseded; empty; 0 `src/` refs |
| `forum_replies` | 0 | 007_community_layer | Superseded; empty; 0 `src/` refs |
| `case_studies` | 6 | 007_community_layer | 0 `src/` refs; orphaned seed |
| `case_study_endorsements` | 0 | 007_community_layer | Empty; 0 refs |
| `vendors` | 0 | 007_community_layer | Empty; never built; 0 refs |
| `vendor_endorsements` | 0 | 007_community_layer | Empty; 0 refs |
| `vendor_regulations` | 0 | 007_community_layer | Empty; 0 refs |
| `vendor_technologies` | 0 | 007_community_layer | Empty; 0 refs |
| `community_topic_groups` | 0 | 031_community_topics | Empty; 0 `src/` refs (the live path uses `community_topics`) |
| `taxonomy_nodes` | 38 | 007_community_layer | 0 `src/` refs; rows orphaned |
| `user_profiles` | 1 | 027_user_profiles | **Superseded by `profiles`** (documented in code comments) |
| `intelligence_items_pre_phase5` | 655 | none (ad-hoc) | Phase-5 snapshot backup |
| `ingest_rejections_pre_phase5` | 0 | none (ad-hoc) | Phase-5 snapshot backup |
| `item_supersessions_pre_phase5` | 5 | none (ad-hoc) | Phase-5 snapshot backup |
| `pending_jurisdiction_review_pre_phase5` | 107 | none (ad-hoc) | Phase-5 snapshot backup |

**Note before dropping forum/vendor/case_study:** these are all from migration 007 (community layer). Verify against `caros-ledge-platform-intent` whether the Community surface roadmap still intends vendors/case-studies before dropping. They are presently inert.

---

## DUPLICATE / OVERLAPPING CLUSTERS

| Cluster | Live (keep) | Dead/dropped (legacy) | Status |
|---|---|---|---|
| Community vs Forum | `community_groups`, `community_group_members`, `community_group_invitations`, `community_posts`, `community_topics`, `moderation_reports`, `post_promotions` (all LIVE-WIRED) | `forum_sections`, `forum_threads`, `forum_replies` (DEAD, live but unused) | **`forum_*` is dead** — community layer replaced it. Drop the 3 forum tables. |
| Item history (mig 013 rename) | `item_supersessions`, `item_cross_references`, `item_disputes`, `item_timelines`, `item_changelog` (all live, APP-READ-ONLY) | `supersessions`, `cross_references`, `disputes`, `timelines`, `changelog` (DROPPED in mig 013) | **Clean.** Legacy halves already dropped; `item_*` successors live. No action. |
| Source registry | `sources` (LIVE-WIRED, 1130 rows) + `provisional_sources` (LIVE-WIRED, 497) | `source_registry` (DROPPED in mig 004) | **Clean.** `source_registry` already dropped; `sources` is the canonical registry. `provisional_sources` is a legitimate distinct staging table (status gate), not a dup. |
| User profile | `profiles` (LIVE-WIRED, 2 rows, 37 cols) | `user_profiles` (DEAD, 1 row, 13 cols) | **`user_profiles` is dead** — `profiles` is the documented replacement. Drop. |
| Phase-5 snapshots | live tables | `*_pre_phase5` ×4 | Backups; drop. |
| Citations | `source_citations` (LIVE-WIRED, brief↔source edges) + `intelligence_item_citations` (WRITE-ONLY trigger output) | — | Two different things (source-cite edges vs trigger audit). Not a true dup, but confirm `intelligence_item_citations` read path was intended. |

---

## Full table-by-table matrix

Legend: writes detected via multiline `.from("t").(insert|update|delete|upsert)`; trigger/RPC writes noted. Read = `.from("t").select`. App = `src/`; Script = `scripts/`.

| Table | Rows | Cols | Defining mig | App write | Script write | App read | Script read | RPC | Class | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| admin_action_cooldowns | 1 | 4 | 024 | yes | — | yes | — | — | LIVE-WIRED (read=APP) | cooldown gate; effectively APP-READ-ONLY+write |
| agent_run_searches | 3085 | 9 | 112 | yes | yes | yes | — | — | LIVE-WIRED | canonical-pipeline writes/reads |
| agent_runs | 1013 | 18 | 057 | yes | yes | yes | yes | — | LIVE-WIRED | per-run telemetry; admin reads |
| briefings | 0 | 11 | 001 | — | — | — | — | — | EMPTY-UNUSED | legacy 001 table, 0 rows, 0 refs |
| bulk_imports | 0 | 10 | 038 | yes | — | yes? | — | — | WRITE-ONLY | import audit; 0 rows, 1 src ref |
| canonical_source_candidates | 370 | 22 | 021 | yes | — | yes | — | — | LIVE-WIRED | canonical-source review pipeline |
| case_studies | 6 | 24 | 007 | — | — | — | — | — | **DEAD** | 0 src refs; orphaned seed |
| case_study_endorsements | 0 | 4 | 007 | — | — | — | — | — | **DEAD** | empty |
| community_group_invitations | 0 | 6 | 029 | yes | — | yes | — | — | LIVE-WIRED | invite flow wired, no rows yet |
| community_group_members | 0 | 6 | 029 | yes | — | yes | — | — | LIVE-WIRED | membership wired |
| community_groups | 0 | 11 | 028 | yes | — | yes | — | — | LIVE-WIRED | wired |
| community_posts | 0 | 14 | 030 | yes | — | yes | — | `community_region_counts` | LIVE-WIRED | full `/api/community/*` surface |
| community_topic_groups | 0 | 2 | 031 | — | — | — | — | — | **DEAD** | join table never used |
| community_topics | 0 | 4 | 031 | — | — | yes | — | — | LIVE-WIRED (read) | read by community surface |
| coverage_gaps | 2 | 9 | 061 | — | — | yes | — | — | APP-READ-ONLY | read in supabase-server |
| forum_replies | 0 | 9 | 007 | — | — | — | — | — | **DEAD** | superseded by community |
| forum_sections | 17 | 13 | 007 | — | — | — | — | — | **DEAD** | superseded; 17 orphan rows |
| forum_threads | 0 | 21 | 007 | — | — | — | — | — | **DEAD** | superseded |
| ingest_rejections | 131 | 10 | 082 | yes | — | yes | — | — | WRITE-ONLY/LIVE | triage route writes+reads |
| ingest_rejections_pre_phase5 | 0 | 10 | none | — | — | — | — | — | DROP | snapshot backup |
| ingestion_control_log | 709 | 6 | 058 | — | yes | — | yes | — | SCRIPT-ONLY | tooling log |
| ingestion_state | 774 | 5 | 059 | — | — | — | yes | — | SCRIPT-ONLY | tooling state |
| institutions | 432 | 4 | 122 | — | (script) | — | — | — | **WRITE-ONLY** | FK on 722 sources; resolver computes in-memory; no read path/join |
| integrity_flags | 1038 | 12 | 048 | yes | yes | yes | yes | — | LIVE-WIRED | platform flags surface |
| intelligence_changes | 0 | 9 | 009 | yes | yes | yes | yes | — | LIVE-WIRED | change feed (0 rows currently) |
| intelligence_item_citations | 750 | 5 | 089 | trigger | (script) | — | yes(script) | — | **WRITE-ONLY** | mig-089 trigger output; no app read |
| intelligence_item_sections | 3384 | 9 | 103 | yes | yes | yes | yes | — | LIVE-WIRED | brief sections; pipeline + UI |
| intelligence_item_versions | 1279 | 19 | 053 | trigger | — | — | — | — | **WRITE-ONLY** | mig-053 versioning trigger; no app read |
| intelligence_items | 657 | 73 | 004 | yes | yes | yes | yes | many | LIVE-WIRED | the core table |
| intelligence_items_domain_backfill_audit | 212 | 11 | 101 | (mig) | — | — | — | — | **WRITE-ONLY** | one-shot backfill audit |
| intelligence_items_pre_phase5 | 655 | 63 | none | — | — | — | — | — | DROP | snapshot backup |
| intelligence_summaries | 2310 | 7 | 009 | — | — | — | yes(script) | — | SCRIPT-ONLY (SHELVED) | 2310 stale rows; per CLAUDE.md shelved, do NOT delete/regenerate |
| item_changelog | 9 | 11 | 004 | — | yes | yes | yes | — | APP-READ-ONLY | read by app, written by script |
| item_cross_references | 49 | 4 | 004 | — | yes | yes | yes | — | APP-READ-ONLY | |
| item_disputes | 7 | 7 | 004 | — | yes | yes | yes | — | APP-READ-ONLY | |
| item_supersessions | 11 | 7 | 004 | — | yes | yes | yes | — | APP-READ-ONLY | |
| item_supersessions_pre_phase5 | 5 | 7 | none | — | — | — | — | — | DROP | snapshot backup |
| item_timelines | 107 | 7 | 004 | — | — | yes | yes | — | APP-READ-ONLY | read by app |
| item_type_required_slots | 48 | 5 | 112 | — | — | yes | — | — | APP-READ-ONLY | slot config reference data |
| moderation_reports | 0 | 9 | 032 | yes | — | yes | — | — | LIVE-WIRED | community moderation |
| monitoring_queue | 551 | 11 | 004 | yes | yes | yes | yes | — | LIVE-WIRED | worker reads `check-sources`/`reconcile` |
| notification_deliveries | 0 | 7 | 007 | yes | — | — | — | — | EMPTY-UNUSED | write path, 0 rows, no read |
| notification_events | 0 | 7 | 007 | yes | — | — | — | — | EMPTY-UNUSED | write path, 0 rows, no read |
| notification_preferences | 0 | 9 | 032 | yes | — | yes | — | — | LIVE-WIRED | wired, no rows yet |
| notification_subscriptions | 0 | 7 | 007 | — | — | yes | — | — | APP-READ-ONLY | read path only in src |
| notifications | 0 | 6 | 032 | yes | — | yes | — | — | LIVE-WIRED | wired, no rows yet |
| org_invitations | 0 | 14 | 076 | yes(RPC) | — | yes | — | `accept/decline/revoke_invitation`, `lookup_invitation` | LIVE-WIRED | RPC-driven invite flow |
| org_memberships | 2 | 5 | 006 | yes | — | yes | yes | `create_org_for_self` | LIVE-WIRED | multi-tenant core |
| org_watchlist | 0 | 7 | 077 | — | — | — | — | — | EMPTY-UNUSED | 0 rows, no src refs |
| organizations | 1 | 7 | 006 | yes | — | yes | yes | `create_org_for_self` | LIVE-WIRED | |
| pending_first_fetch | 27 | 7 | 065 | yes | yes | yes | yes | — | LIVE-WIRED | first-fetch queue |
| pending_jurisdiction_review | 110 | 9 | 082 | yes | — | yes | — | — | LIVE-WIRED | triage route writes+reads |
| pending_jurisdiction_review_pre_phase5 | 107 | 9 | none | — | — | — | — | — | DROP | snapshot backup |
| post_promotions | 0 | 8 | 041 | yes | — | yes | — | — | LIVE-WIRED | community→intel promotion |
| profiles | 2 | 37 | 001 | yes | yes | yes | yes | — | LIVE-WIRED | canonical user profile (replaces user_profiles) |
| provisional_sources | 497 | 24 | 004 | yes | yes | yes | yes | — | LIVE-WIRED | source staging (status gate) |
| raw_fetches | 660 | 8 | 052 | — | yes | — | yes | — | **WRITE-ONLY/SCRIPT** | fetch cache; no app read |
| region_dimension_coverage | 30 | 9 | 109 | — | — | yes | — | — | APP-READ-ONLY | operations-matrix reads |
| regional_data_facts | 75 | 11 | 106 | — | yes | yes | yes | — | APP-READ-ONLY | |
| regions | 5 | 9 | 106 | — | yes | yes | yes | — | APP-READ-ONLY | reference data |
| section_claim_provenance | 7558 | 12 | 112 | yes | yes | yes | yes | `validate_item_provenance` | LIVE-WIRED | claim ledger; grounding |
| sector_contexts | 15 | 7 | 009 | — | yes | yes | yes | — | APP-READ-ONLY | read at supabase-server:1377 |
| source_bias_tags | 2895 | 7 | 092 | — | — | yes | — | — | APP-READ-ONLY | credibility reads |
| source_citations | 689 | 5 | 004 | yes | yes | yes | yes | `get_source_citation_stats` | LIVE-WIRED | brief↔source edges |
| source_conflicts | 0 | 16 | 004 | yes | — | yes | yes | — | LIVE-WIRED (read) | feeds `open_conflicts` view; 0 rows |
| source_tier_opinions | 0 | 7 | 091 | yes | — | yes | yes | — | LIVE-WIRED | tier opinion crowd; 0 rows |
| source_trust_events | 876 | 7 | 004 | yes | yes | yes | yes | — | LIVE-WIRED | trust scoring events |
| source_verifications | 1414 | 15 | 037 | yes | yes | yes | yes | — | LIVE-WIRED | verification log |
| sources | 1130 | 82 | 004 | yes | yes | yes | yes | many | LIVE-WIRED | source registry |
| staged_updates | 24 | 18 | 001 | yes | yes | yes | yes | — | LIVE-WIRED | scan staging/approval |
| system_state | 1 | 3 | 016 | yes | yes | yes | yes | — | LIVE-WIRED | global pause flag |
| taxonomy_nodes | 38 | 9 | 007 | — | — | — | — | — | **DEAD** | 38 orphan rows, 0 src refs |
| user_profiles | 1 | 13 | 027 | — | — | — | — | — | **DEAD** | superseded by `profiles` (documented) |
| user_watchlist | 0 | 6 | 060 | — | — | yes | yes | — | APP-READ-ONLY | 0 rows |
| vendor_endorsements | 0 | 6 | 007 | — | — | — | — | — | **DEAD** | empty |
| vendor_regulations | 0 | 4 | 007 | — | — | — | — | — | **DEAD** | empty |
| vendor_technologies | 0 | 2 | 007 | — | — | — | — | — | **DEAD** | empty |
| vendors | 0 | 22 | 007 | — | — | — | — | — | **DEAD** | empty; never built |
| workspace_item_overrides | 3 | 13 | 006 | yes | yes | yes | yes | — | LIVE-WIRED | per-workspace overrides |
| workspace_settings | 1 | 12 | 006 | yes | yes | yes | yes | — | LIVE-WIRED | incl. sector-activation columns |

### Views (4)
- `active_intelligence_items`, `open_conflicts`, `provisional_sources_review`, `source_health_summary` — definitions not located via `CREATE VIEW` grep in migrations (likely defined inline within a larger migration body or via a function). Read-only projections over the base tables above. Not separately classified.

---

## RPC inventory (functions referenced by code)

| RPC | Defining migration | Mutates/uses |
|---|---|---|
| `accept_invitation`, `decline_invitation`, `revoke_invitation`, `lookup_invitation`, `create_org_for_self` | 076_org_invitations | org_invitations, org_memberships, organizations |
| `detect_intersections` | 023 | intelligence_items (read) |
| `validate_item_provenance` | 114 | section_claim_provenance, intelligence_items |
| `get_research_source_coverage` | 100 | source/citation reads |
| `get_source_citation_stats` | 088 | source_citations |
| `admin_attention_counts`, `community_region_counts` | (community/admin) | aggregate reads |
| `get_workspace_intelligence_dashboard`, `get_market_intel_items`, `get_operations_items`, `get_research_items` | routing RPCs | intelligence_items reads (script-referenced) |
| `exec_sql`, `exec_sql_text` | tooling | raw SQL (scripts) |

---

## Recommended actions

1. **Fix `d3_runs` code↔live mismatch** — either add the `d3_runs` table via migration or remove the hook write in `src/lib/d3/hooks.mjs`. Currently a silent no-op (D3 runs aren't recorded).
2. **Drop the 4 `*_pre_phase5` snapshot tables** (forensic backups, undeclared, no code path) once Phase-5 forensics are closed.
3. **Drop or wire the DEAD clusters** pending `caros-ledge-platform-intent` confirmation: `forum_*` (3), `vendor*` (4), `case_stud*` (2), `community_topic_groups`, `taxonomy_nodes`, `user_profiles`. All have zero `src/` references.
4. **Review WRITE-ONLY tables** for intent: `institutions` (written/FK-set but never read), `intelligence_item_versions` + `intelligence_item_citations` (trigger outputs with no surface), `bulk_imports`, `intelligence_items_domain_backfill_audit`. Audit-only is fine if intentional; flag if a consuming surface was planned.
5. **Do NOT touch `intelligence_summaries`** (2310 rows) — explicitly SHELVED per CLAUDE.md, not retired.
