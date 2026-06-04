# 65-Table Linkage Audit — 2026-06-03 (READ-ONLY)

For each table without `updated_at` (the "not actively updated" set): where it's linked in code (writers / reader-files / creating migration), why it isn't updating, why it was created, and whether its use case is hooked up. Collected mechanically via `rg` (writer = `.from().insert/update/upsert/delete` + raw `INSERT/UPDATE`, excluding migrations). **Writer counts are a LOWER BOUND** — writes via SQL RPC, triggers, multiline `.upsert()`, or `.mjs` scripts are undercounted; row count is the truth of "was it ever written."

## Category 1 — ACTIVE pipeline (written + populated; "no updated_at" = append-only by design, NOT broken)
| table | rows | writers | created | role |
|---|---|---|---|---|
| section_claim_provenance | 2476 | 5 | 112 | provenance substrate (grounding) |
| agent_run_searches | 1155 | 4 | 112 | grounding search log |
| source_verifications | 1414 | 6 | 037 | source verification log |
| source_trust_events | 828 | 7 | 004 | trust event log (hourly monitor) |
| monitoring_queue | 507 | 2 | 004 | reachability queue (hourly; degenerate — `change_detected` always false) |
| provisional_sources | 497 | 10 | 004 | source discovery queue |
| integrity_flags | 485 | 17 | 048 | platform integrity queue |
| intelligence_item_versions | 625 | trigger | 053 | per-mutation version ledger |
| source_bias_tags | 2895 | 1 | 092 | source bias tags |
| ingestion_state / ingestion_control_log | 774 / 709 | 1 / 1 | 059 / 058 | ingestion subsystem state |
| pending_first_fetch | 13 | 10 | 065 | first-fetch queue (drain worker) |
| item_cross_references | 49 | 4 | 004 | intersection links |
| admin_action_cooldowns | 1 | 3 | 024 | action cooldowns |
| regional_data_facts | 75 | 1 | 106 | regional facts |
| item_type_required_slots | 20 | 1 | 112 | provenance slot config (seed) |

## Category 1b — ANOMALY: writer-grep=0 but rows present (written via a path the surface grep missed — CONFIRM, not unhooked)
| table | rows | created | note |
|---|---|---|---|
| agent_runs | 1007 | 057 | clearly written by the agent pipeline; writer path not surfaced by grep |
| raw_fetches | 660 | 052 | fetch-layer content_hash dedupe; written by fetch path |
| intelligence_item_citations | 750 | 089 | written; path missed |
| ingest_rejections | 131 | 082 | operator queue; likely SQL/RPC/trigger writer |
| pending_jurisdiction_review | 110 | 082 | operator queue; likely SQL/RPC/trigger writer |

## Category 2 — BUILT, READ-WIRED, WRITE-SIDE NEVER HOOKED UP (the real "use case not hooked up"; reconciliation-relevant = LOAD-BEARING)
| table | rows | created | intended use | gap |
|---|---|---|---|---|
| **intelligence_changes** | 0 | 009 | the "what-changed" delta record | read by code, **never written** — the change-delta half of reconcile |
| **source_conflicts** | 0 | 004 | conflict arbitration between sources | **never written** — the conflict half of reconcile |
| source_citations | 0 | 004 | item→source citation links | never written (citations live in `intelligence_item_citations` instead) |
| source_tier_opinions | 0 | 091 | multi-opinion tier scoring | never written |
| user_watchlist | 0 | (060) | per-user pin/watchlist | read-stub, no write path, dead UI link |
| org_watchlist | 0 | 077 | per-org watchlist | fully unreferenced |

## Category 3 — COMMUNITY LAYER (migration 007) — intentionally unbuilt Phase-2 subsystem (0 rows, UI not shipped)
community_groups / community_posts / community_topics / community_topic_groups / community_group_members / community_group_invitations / forum_threads / forum_replies (forum_sections = 17 seed) / vendors / vendor_endorsements / vendor_regulations / vendor_technologies / notifications / notification_deliveries / notification_events / notification_preferences / notification_subscriptions / moderation_reports / post_promotions / case_study_endorsements / org_invitations / taxonomy_nodes (38 seed).
→ Per CLAUDE.md "Community layer UI (Phase 2). Tables seeded; UI not yet built." **Intentional roadmap, not a defect.** ~22 tables.

## Category 4 — SEED-FROZEN legacy (written once at migration/seed, read by UI, never appended)
| table | rows | created | note |
|---|---|---|---|
| item_changelog | 9 | 004/010 | feeds the WhatChanged surface; frozen at legacy seed → What-Changed is stale |
| item_timelines / item_disputes / item_supersessions | 107 / 7 / 11 | 004/010 | legacy seed; supersession lifecycle seed-frozen |
| intelligence_summaries | 2310 | 009 | the SHELVED stale synopsis block (decision: keep, don't regenerate) |
| sector_contexts | 15 | 009 | sector synopsis config (seed); read by agent |
| briefings | 0 | 001 | never built |
| bulk_imports | 0 | 038 | bulk-import audit; unused |
| coverage_gaps | 2 | — | minimal |

## Category 5 — BACKUP / one-shot audit clutter (safe to drop after confidence)
intelligence_items_domain_backfill_audit (212, mig 101) · intelligence_items_pre_phase5 (655) · item_supersessions_pre_phase5 (5) · pending_jurisdiction_review_pre_phase5 (107) · ingest_rejections_pre_phase5 (0).

## Bottom line
- **Not broken, just append-only or roadmap:** Categories 1 (+1b) and 3. The pipeline tables ARE maintained (append-only); the Community Layer is deliberately unbuilt.
- **The real "built but disconnected" set is small and specific (Category 2):** `intelligence_changes` + `source_conflicts` are the load-bearing ones — they are literally the delta-detection and conflict-arbitration tables a continuously-reconciled master needs, schema built (009/004), read-wired, **write path never built**. This is the same gap the reconciliation audit found from the other direction.
- **Cleanup candidates:** Category 5 (backups) + the shelved `intelligence_summaries`.
