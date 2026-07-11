# Full-System Audit — Coverage Manifest (2026-07-11)

**Baseline: master `71bcbd46a30e6b4e5f953a4949c3b8e276dacf8b`** (recorded at audit start).
DB: Supabase `kwrsbpiseruzbfwjpvsp`, live. **READ-ONLY throughout** — SELECT/information_schema/pg_catalog
only; zero DDL, zero fetches, zero mints, zero program-ledger spend, loop OFF.

This manifest is the audit's spine. Every agent checks its slice off against it; an unchecked item =
incomplete audit. Check-off state lives in each agent's register (`<agent>-register.md`, "Manifest
check-off" section); the roll-up lives in `master-gap-register.md`.

## A. Code manifest

**2,973 tracked files** at the baseline SHA (full per-file list + line counts:
[`_manifest_files.tsv`](_manifest_files.tsv) — path · lines · kind). **1,348 code files, 225,801 code lines.**

| Partition (agent) | Scope (path prefixes) | Files | Lines |
|---|---|---|---|
| CODE-1 pipeline | `fsi-app/src/lib/agent/`, `src/lib/sources/`, `src/workflows/`, `src/lib/llm/`, remaining `src/lib/*` non-api | 159 | 22,540 |
| CODE-2 guards | `fsi-app/.discipline/`, `.github/`, `src/lib/trust.ts` | 87 | 9,202 |
| CODE-3 api | `fsi-app/src/app/api/`, `src/lib/api/`, `src/lib/supabase*`, `src/stores/` | 97 | 21,202 |
| CODE-4a ui-components | `fsi-app/src/components/` | ~180 | ~48,000 |
| CODE-4b ui-pages | `fsi-app/src/app/` (non-api), `src/types/`, css | ~51 | ~17,000 |
| CODE-5a scripts | `fsi-app/scripts/` (code files only) | ~540 | ~54,500 |
| CODE-5b migrations+config | `fsi-app/supabase/` (165 .sql + config), root configs (`next.config.ts`, `package.json`, `vercel.json`, `tsconfig.json`, `eslint/postcss config`) | ~210 | ~39,500 |

**Declared scope deviations (orchestrator, up front):**
1. `docs/` + `design_handoff_2026-05/` + `.claude/` + root dotfiles (24 code-ext files, 13,806 lines — static
   HTML mockups, project memory, skill/meta files): **inventoried in the tsv, excluded from line-by-line
   logic audit** (non-executable project memory / design references).
2. **Data artifacts** (1,625 files, mostly `.jsonl`/`.json`/`.log`/`.txt` under `scripts/_snapshots`,
   `_plans`, `_diag`, `docs/archive`): inventoried; NOT read line-by-line. CODE-5a verifies each directory's
   role (audit record vs orphan) instead.
3. `package-lock.json` excluded.
4. CODE-4 and CODE-5 split into a/b (single-agent slices would exceed reliable per-line reading depth).

## B. DB manifest

**85 tables (CORRECTION 2026-07-11: header originally said 86 — orchestrator transcription error; pg_tables census = 85, all 85 scanned — see master-gap-register.md) · 1,157 columns · 172 functions (≈60 app-owned; ~112 ltree/pg_trgm extension internals —
inventoried, not audited) · 34 triggers · 183 RLS policies · 5 views · 1 enum (`provenance_status`) ·
333 indexes · 132 FK constraints · 647 CHECK constraints.**

Exact row counts (audit start):

| Table | Rows | Agent | | Table | Rows | Agent |
|---|---|---|---|---|---|---|
| section_claim_provenance | 8,686 | DB-1 | | region_dimension_coverage | 30 | DB-1 |
| intelligence_item_sections | 3,379 | DB-1 | | staged_updates | 24 | DB-3 |
| agent_run_searches | 3,126 | DB-1 | | forum_sections | 17 | DB-4 |
| source_bias_tags | 2,895 | DB-2 | | sector_contexts | 15 | DB-1 |
| intelligence_summaries | 2,265 | DB-1 | | state_cost_facts | 13 | DB-1 |
| agent_runs | 1,653 | DB-3 | | item_supersessions | 11 | DB-1 |
| source_verifications | 1,414 | DB-2 | | item_changelog | 9 | DB-1 |
| integrity_flags | 1,385 | DB-3 | | community_groups | 7 | DB-4 |
| intelligence_item_versions | 1,328 | DB-1 | | item_disputes | 7 | DB-1 |
| sources | 1,197 | DB-2 | | case_studies | 6 | DB-4 |
| item_timelines | 1,000 | DB-1 | | item_supersessions_pre_phase5 | 5 | DB-3 |
| intelligence_item_citations | 947 | DB-2 | | regions | 5 | DB-1 |
| source_trust_events | 905 | DB-2 | | published_price_statistics | 4 | DB-1 |
| ingestion_state | 774 | DB-3 | | workspace_item_overrides | 4 | DB-4 |
| ingestion_control_log | 709 | DB-3/4 | | coverage_gaps | 2 | DB-1 |
| source_citations | 696 | DB-2 | | org_memberships | 2 | DB-4 |
| raw_fetches | 660 | DB-3 | | profiles | 2 | DB-4 |
| intelligence_items_pre_phase5 | 655 | DB-3 | | admin_action_cooldowns | 1 | DB-3 |
| intelligence_items | 653 | DB-1 | | community_group_members | 1 | DB-4 |
| monitoring_queue | 580 | DB-3 | | community_posts | 1 | DB-4 |
| provisional_sources | 497 | DB-2 | | organizations | 1 | DB-4 |
| institutions | 432 | DB-2 | | system_state | 1 | DB-3 |
| canonical_source_candidates | 364 | DB-2 | | user_profiles | 1 | DB-4 |
| intelligence_items_domain_backfill_audit | 212 | DB-3 | | workspace_settings | 1 | DB-4 |
| ingest_rejections | 131 | DB-3 | | *29 empty tables* | 0 | (owner by domain) |
| pending_jurisdiction_review | 109 | DB-3 | | | | |
| pending_jurisdiction_review_pre_phase5 | 107 | DB-3 | | | | |
| regional_data_facts | 75 | DB-1 | | | | |
| item_cross_references | 53 | DB-1 | | | | |
| item_type_required_slots | 48 | DB-1 | | | | |
| taxonomy_nodes | 38 | DB-2 | | | | |
| pending_first_fetch | 36 | DB-2 | | | | |

**Empty tables (29), owner by domain** — DB-4: briefings, bulk_imports, case_study_endorsements,
community_group_invitations, community_post_signoff_requests, community_topic_groups, community_topics,
forum_replies, forum_threads, moderation_reports, notification_deliveries, notification_events,
notification_preferences, notification_subscriptions, notifications, org_invitations, org_member_bans,
org_watchlist, post_promotions, user_watchlist, vendor_endorsements, vendor_regulations,
vendor_technologies, vendors · DB-3: ingest_rejections_pre_phase5, intelligence_changes, portal_link_candidates ·
DB-2: source_conflicts, source_tier_opinions.

**Views (5):** open_conflicts, provisional_sources_review, source_health_summary,
active_intelligence_items, item_related_items_derived — DB-2/DB-3 by domain; X-agent cross-checks consumers.

**Dump rule (deviation 5):** tables <500 rows: full dump into the agent register, EXCEPT bulk text
columns (`full_brief`, `content_md`, `result_content_excerpt`, raw html/body columns) which are recorded
as `length + left(…,80)` per row. Larger tables: full-scan predicates + complete dump of anomalous rows.

## C. Check-off protocol

Each agent register ends with: `Manifest check-off: <N>/<N> files read (list reconciled against
_manifest_files.tsv slice)` or `<N>/<N> tables scanned (row counts reconciled against §B)`, plus a
per-agent tool-call count and deviation log. The orchestrator rejects any register with zero tool
counts or an unreconciled slice.
