# INDEX — Caro's Ledge project memory

One line per living doc. archive/ holds superseded notes and machine evidence and is not indexed.

## board

- [[PROGRAM-BOARD]] — the resume state: full T/C/Unit thread table (state · evidence · deferrals) reconstructed from the repo; standing rule = every session that opens/closes a thread updates it in the same PR. Records the T/C taxonomy-collision finding (numbering is a chat overlay; only T7/T8 have verbatim repo tags) and the T9-not-closed gap.

## decisions

- [[ADR-001-platform-model]] — Platform model (accepted)
- [[ADR-002-tier-model]] — Tier model (base_tier + effective_tier) (accepted)
- [[ADR-003-server-centric-dual-write]] — Server-centric dual-write for tier fields (accepted)
- [[ADR-004-auth-pattern-split]] — Auth pattern split (isPlatformAdmin vs WORKER_SECRET) (accepted)
- [[ADR-005-discipline-enforcement-layered-architecture]] — Discipline enforcement layered architecture (accepted)
- [[ADR-006-plan-skill-hybrid]] — Plan-skill hybrid discipline (multi-dispatch coordination) (deprecated)
- [[ADR-007-bias-tag-threshold-per-dimension]] — Bias-tag auto-cutoff threshold per dimension (D1 decision) (accepted)
- [[ADR-008-urgency-score-default]] — urgency_score default behavior for intelligence_items inserts (accepted)
- [[ADR-009-adr-system-architecture]] — ADR system architecture (meta) (deprecated)
- [[ADR-010-docs-taxonomy-and-brain-conventions]] — Docs taxonomy, INDEX discipline, and two-repo memory architecture (accepted)
- [[ADR-011-ddl-authority-delegation]] — DDL apply authority: additive/low-risk delegated with ledger-recorded identity + read-back; break-risky classes (RLS, drops, customer-read-path) stay operator-window; + DELEGATED-WITH-PROOF amendment (mig-160 applied 2026-07-08 under it, 56→0 pinned, customer path unchanged) (accepted)
- [[ADR-012-intake-cadence-and-launch-exit-test]] — Intake is manual-triggered by design (auto-cadence built + dormant); the cadence/schedule/scan/fetch-now mechanism already EXISTS (scrape-schedule.ts + pause-global + admin/scan), so the ruling is wire-not-build; hold gates scheduled fetching only, manual run is a signed manifest-bound exception (2nd caller); + the 9-clause launch-complete exit test (accepted)
- [[ADR-013-phase3-closure-and-scope-doctrine-tightening]] — Snapshot-first Phase-3 restitution CLOSED not run (population gone: June-undispositioned 0, the 197 was status-only = 37 live + 160 archived); cheap-verify (#296) is the standing mechanism for Oct-31 deferral exits + dwell crossings; report-scope doctrine tightened to require the archival predicate (live-only vs status-only) on any population count (accepted)

## inventories

- [[components]] — Shared Components Inventory
- [[discipline]] — Discipline Engine Inventory
- [[migrations]] — Migrations Inventory
- [[out-of-band-objects]] — Out-of-band DB objects (live-not-in-migrations) ledger
- [[worktrees]] — Git Worktrees Inventory

## doctrine

- [[worktree-isolation]] — Doctrine seed: agent branch/checkout/merge ONLY in the assigned worktree (RD-19; Unit-0 register seed)

## runbooks

- [[INTEGRITY-TRIAGE-PROCEDURE]] — Integrity-flag triage procedure
- [[PERF-PLAYBOOK]] — Perf Playbook
- [[SPOT-CHECK-PROCEDURE]] — Tier-H Spot-Check Procedure
- [[sprint4-dataops-ledger]] — Sprint 4 — Data-Operations Ledger (already-executed; do NOT re-run)

## plans

- [[C5-feed-spec]] — C5 — Group Post Feed Specification
- [[C6-promote-spec]] — C6 — Promote Community Post to Intelligence
- [[C7-notifications-spec]] — C7 — Community Notifications Surface
- [[C8-moderation-spec]] — C8 — Community moderation workflow
- [[C9-realtime-spec]] — C9 — Community Realtime Infrastructure
- [[SOURCE-TYPE-TAXONOMY-PROPOSAL]] — `source_type` Taxonomy Column — Design Proposal
- [[W2A-bulk-import-spec]] — W2.A — Bulk-add tooling
- [[W2B-discovery-agent-spec]] — W2.B — Sub-national-aware Discovery Agent
- [[W2D-coverage-matrix-spec]] — W2.D — Coverage Matrix Spec
- [[W2F-verification-pipeline]] — W2.F — Auto-verification pipeline
- [[W4-backfill-plan]] — W4 — Backfill plan
- [[W5-cost-projection]] — W5 — Cost Projection
- [[build-8-research-surface]] — Build 8 — Research surface (Q9 signal-set integration)
- [[category-e-investigation-2026-05-21]] — Phase 4 Category E Investigation, 2026-05-21
- [[classification-backfill-ambiguous-2026-05-22]] — Classification backfill: ambiguous items needing per-item operator decision
- [[classification-backfill-plan-2026-05-22]] — intelligence_items.domain backfill plan (proposed, not executed)
- [[dead-code-disposition-2026-05-21]] — Dead-Code Disposition Report — Caro's Ledge (2026-05-21)
- [[dispatch-2.5-writer-redistribution-prework-2026-05-15]] — Dispatch 2.5 Prework: Writer Redistribution
- [[dispatch-spec-corrections-2026-05-10]] — Dispatch spec corrections — 2026-05-10
- [[fix-d-scope-2026-05-23]] — Fix D scope (2026-05-23)
- [[ingest-pipeline-investigation-2026-05-22]] — Ingest Pipeline Investigation: Staleness + Domain Classification Leakage
- [[ingest-restart-sequencing-2026-05-22]] — Ingest restart sequencing + leakage prerequisite (2026-05-22)
- [[multi-tenant-foundation-prework-2026-05-15]] — Multi-Tenant Foundation — Pre-Work Findings
- [[registry-to-ingestion-handoff-design-2026-05-10]] — Registry-to-ingestion handoff design surface, 2026-05-10
- [[regulations-classification-mismatch-counts-2026-05-22]] — Regulations classification mismatch counts (2026-05-22)
- [[skill-refinements-prework-2026-05-15]] — Skill Refinements Prework, 2026-05-15
- [[source-classification-framework-2026-05-10]] — Source Classification Framework
- [[source-health-architecture-investigation-2026-05-21]] — Source Health Architecture Investigation, Phase 5
- [[spec-audit-community-2026-05-23]] — Community surface: built vs caros-ledge-platform-intent spec
- [[spec-audit-dashboard-2026-05-23]] — Spec Audit: Dashboard `/` Built vs `caros-ledge-platform-intent` SKILL
- [[spec-audit-map-2026-05-23]] — Spec Audit: Map (`/map`) vs caros-ledge-platform-intent SKILL.md
- [[spec-audit-market-intel-2026-05-23]] — Spec audit: Market Intel built vs caros-ledge-platform-intent spec
- [[spec-audit-operations-2026-05-23]] — Spec audit: /operations built vs caros-ledge-platform-intent SKILL (2026-05-23)
- [[spec-audit-regulations-2026-05-23]] — Regulations surface, spec audit (2026-05-23)
- [[spec-audit-research-2026-05-23]] — Spec audit, /research, built vs caros-ledge-platform-intent spec
- [[spec-audit-synthesis-2026-05-23]] — Spec-vs-Built Audit: Cross-Surface Synthesis (2026-05-23)
- [[spec-audit-user-chrome-2026-05-23]] — Spec audit: user chrome (8 pages) vs caros-ledge-platform-intent
- [[wave1-track5-widget-implementation-plan]] — Phase 3 Widget Implementation Plan (PR-G3)

## audits

- [[BRIEF-STRUCTURE-AUDIT]] — Brief Structure Audit
- [[DESIGN-AUDIT-2026-05]] — Design Audit — Preview vs Live App
- [[E2E-VERIFICATION]] — E2E Verification — PRs #20–#23
- [[INTEGRITY-TRIAGE-REPORT]] — Integrity-flag triage report
- [[ISR-WRITE-INVESTIGATION]] — ISR Write-Source Investigation — Caro's Ledge
- [[PAGE-LOAD-PERF-AUDIT-2026-05-06]] — Page-Load Performance Audit — 2026-05-06
- [[PERF-AUDIT]] — Page-Load Performance Audit
- [[PERF-PROFILING-FINDINGS]] — Perf Claim Investigation — Fresh Findings
- [[REGIONAL-DATA-COLLECTION-AUDIT]] — Regional Data Collection — Ground Truth Audit
- [[SESSION-AUDIT-2026-05-05]] — Session Audit — 2026-05-05
- [[VISUAL-RECONCILIATION-2026-05-06]] — Caro's Ledge — Visual Reconciliation Audit
- [[W1A-dual-write-audit]] — W1.A — Dual-Write Audit: `jurisdictions` Callsites
- [[W1B-approval-handler-analysis]] — W1.B — Staged-update approval handler: root cause + fix
- [[W1C-source-attribution-summary]] — W1.C — Source attribution audit summary
- [[WORKER-ACTIVATION-AUDIT-2026-05-08]] — Worker activation audit — 2026-05-08
- [[access-method-triage-2026-05-12]] — Access-Method Triage, 2026-05-12
- [[auth-architecture-audit-2026-05-10]] — Auth architecture audit, 2026-05-10
- [[california-pilot-summary]] — California Pilot Results
- [[cards-clickable-audit-2026-05-12]] — Cards Clickable Audit — 2026-05-12
- [[caros-ledge-product-audit-2026-05-15]] — Caro's Ledge product audit, v2 — 2026-05-15
- [[caros-ledge-supabase-schema-audit-2026-05-15]] — Caro's Ledge Supabase schema audit, 2026-05-15
- [[classification-rules-audit-2026-05-09]] — Classification rules audit, 2026-05-09
- [[cleanup-audit-2026-05-11]] — Wave cleanup audit, 2026-05-11
- [[comprehensive-site-audit-2026-05-25]] — Caro's Ledge, Comprehensive Site Audit
- [[dashboard-payload-audit-2026-05-11]] — Dashboard payload audit, 2026-05-11
- [[font-usage-audit-2026-05-11]] — Font weight usage audit, 2026-05-11
- [[four-page-architecture-survey-2026-05-09]] — Four-page architecture survey, 2026-05-09
- [[functional-purpose-audit-2026-05-24]] — Caro's Ledge, Surface Functional Purpose Audit
- [[hotfix-3-perf-audit-2026-05-07]] — Hotfix 3 — Performance Audit (Investigation Only)
- [[jurisdiction-normalization-audit-2026-05-11]] — Jurisdiction-Token Fragmentation Audit
- [[migration-drift-investigation-2026-05-12]] — Migration 070 drift investigation
- [[primitives-audit-2026-05-09]] — Caro's Ledge ingestion primitives audit, 2026-05-09
- [[source-classification-final-summary-2026-05-11]] — Source classification backfill — final summary
- [[source-coverage-diagnostic-2026-05-09]] — EU ESRS coverage diagnostic + curation methodology audit, 2026-05-09
- [[source-map-existence-check-2026-05-10]] — ESG-Today source map existence check, 2026-05-10
- [[source-map-from-esgtoday-2026-05-09]] — Source Registry Expansion
- [[sources-content-verification-2026-05-11]] — Sources + content verification, 2026-05-11
- [[topic-relevance-investigation-2026-05-09]] — Topic relevance investigation, 2026-05-09
- [[us-state-code-audit-2026-05-12]] — US-state Code Audit — 2026-05-12
- [[wave1-archive-logs-disposition-2026-07-07]] — Wave-1 archive-logs disposition + Obsidian-vault topology finding, 2026-07-07
- [[wave1-step1-verification]] — Wave 1a Step 1 — Post-merge verification checklist
- [[wave1-track1-summary]] — Wave 1a Track 1 (Gate 4) Discovery Summary
- [[wave1b-stub-quality-investigation-2026-05-11]] — Wave 1b stub quality investigation, 2026-05-11

## ops

- [[session-log]] — Dated session-close log (accomplished / decisions / blockers / next steps)
- [[traceability-matrix-2026-07-07]] — Live-pages audit findings register + disposition matrix (41 findings, DEEP-AUDIT + date/dedup)
- [[deletion-reclassification-log]] — Deletion / reclassification log
- [[flip-readiness-2026-07-08]] — Cadence/loop flip readiness; the three standing switches (cadence/batch-1/budget)
- [[browser-verification-pending]] — The one accumulating browser-check list for Jason's end-of-program session
- [[program-closeout-2026-07-08]] — Build-to-completion close-out: DONE checklist (7/7), census, + the 18-flag operator decision table
- [[root-cause-why-the-queue-2026-07-08]] — ROOT CAUSE: why /admin reads 1,280 with 0 agent runs — built as a human-supervised DETECTION engine; the autonomous DRAIN half (1 of 17 flag classes) was never wired. Corrects the "DONE 7/7" claim.
- [[site-gap-register-2026-07-09]] — CANONICAL BASELINE (supersedes the traceability matrix): Chrome wiring-audit U-01..U-11 + D/F/Q fix-forward rows + U-11 ledger truth + phase-0-5 baseline mapping. F-1 fabricated-source class kill recorded.
- [[conservation-audit-2026-07-09]] — Full-pipeline conservation audit: stage-loss table, 4 axes, defect-class table w/ mechanisms. Headline: 56% archived is cleanup (conserved); 63/240 verified fail the CURRENT moat gate (all pool-recoverable, pre-mig-158 residue); 88 dup claim rows deleted; provisional(489)/quarantine(48) drains = BUILD GAPS; credential guard blocks MCP provenance writes (working).
- [[board-reconciliation-2026-07-09]] — Full-board status reconciliation (run 2026-07-10): worktree sweep, 2a–2k ledger, money+safety verified, 5-claim DB spot-check, collisions/anomalies + next actions
- [[reconciliation-remediation-closeout-2026-07-11]] — Full-sequence remediation closeout: lane GREEN (8/8 hard), 65-item backlog dispositioned (7 recovered / 62 deferred-quarantined, verified-live 240→179 fail-closed), 4 tech retypes KEPT, Q-1..Q-3+D-1/D-2 enacted, $3.35 of $10. OPEN: reconciler RLS repair (operator window), resynth label/slot contract gap.
- [[master-gap-register]] — FULL-SYSTEM AUDIT 2026-07-11 (13 agents, coverage PROVEN: 1,348 code files / 85 tables / 63 fns / 183 policies): 12 P1s (org-gate loss, silent-empty provisional queue, profiles no-op writes, seed-on-timeout...), P2/P3/P4 registers, intent verdicts (9× PARTIAL), 62-item pool table (45/8/9), invariant backlog. Plan: [[correction-plan]] (Tracks A–E, build-first lens).
- [[multi-tenant-foundation-followups-2026-05-15]] — Multi-Tenant Foundation Follow-Ups, 2026-05-15

## design

- [[decision-package-2026-07-06]] — Decision Package — 52 live non-verified items (read-only)
- [[design-principles]] — Caro's Ledge Design Principles

## sprint-1

- [[alignment-audit-2026-05-18]] — Caro's Ledge Alignment Audit, 2026-05-18
- [[critical-investigations-2026-05-18]] — Caro's Ledge Sprint 1 Critical Investigations Report, 2026-05-18
- [[followups]] — Sprint 1 Followups
- [[intelligence-assistant-audit-2026-05-18]] — Caro's Ledge Intelligence Assistant Behavior Audit, 2026-05-18
- [[onboarding-audit-2026-05-18]] — Caro's Ledge Onboarding Flow Audit, 2026-05-18
- [[perf-1-design]] — PERF-1: Cache Headers Design (Narrowed, Implementation-Ready)
- [[phase-1-admin-signals]] — Sprint 1 Phase 1: Two-Admin-Signals Resolution
- [[phase-2-dedup-plan]] — Sprint 1 Phase 2: Canonical-Entity Dedup Plan
- [[phase-3-jurisdiction-vocabulary]] — Sprint 1 Phase 3: Jurisdiction Vocabulary Extension
- [[phase-3-operator-decision]] — Sprint 1 Phase 3: Operator Decision (Authorization Packet)
- [[phase-4-migrations-summary]] — Sprint 1 Phase 4a: Migrations Summary
- [[phase-4b-design]] — Sprint 1 Phase 4b: Operator Queue Tables + Rejected-Token Routing
- [[phase-4b-sql-review-final]] — Phase 4b SQL Review, Final
- [[phase-5-design]] — Sprint 1 Phase 5: Data Migration Design
- [[phase-7-scope-amendment]] — Sprint 1 Phase 7: Scope Amendment
- [[schema-reconciliation-discovery-2026-05-18]] — Caro's Ledge Sprint 1 Schema Reconciliation Discovery (Stage 1)
- [[system-audit-2026-05-18]] — Caro's Ledge Sprint 1 System Audit, 2026-05-18 post-PR-#122

## sprint-2

- [[Phase-1.5-consumer-migration-list]] — Phase 1.5 Consumer Migration List (Q2 base_tier + effective_tier)
- [[category-routing-wiring-notes]] — Sprint 2 Build 4: Category Routing Wiring Notes
- [[source-credibility-model-decisions-2026-05-19]] — Source Credibility Model: Architectural Decisions Capture (2026-05-19)
- [[sprint-2-planning-2026-05-18]] — Caro's Ledge Sprint 2 Planning, 2026-05-18

## top-level living docs

- [[tech-debt-log]] — living technical debt register
- [[blind-ci-window-audit-2026-07-08]] — Blind-CI-window audit: 8 dark suites (≤46d), all green isolated, guarded modules 0 in-window changes across 81 merges → zero regressions; class-fix #256 + branch protection
- [[redesign-completeness-2026-07-08]] — Recon: all 11 redesign templates rebuilt + live on master (dispatch's "2 of 11" was stale); T03 detail archetype reached master via integration path
- [[dispatch-stop-conditions-protocol]] — binding: dispatches declare STOP-CONDITIONS before authorities; agent restates them at closeout + runs a closeout self-audit (mechanical half of operator-stop-conditions-are-absolute)
