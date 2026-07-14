# INDEX — Caro's Ledge project memory

One line per living doc. archive/ holds superseded notes and machine evidence and is not indexed.

## board

- [PROGRAM-BOARD](./PROGRAM-BOARD.md) — the resume state: full T/C/Unit thread table (state · evidence · deferrals) reconstructed from the repo; standing rule = every session that opens/closes a thread updates it in the same PR. Records the T/C taxonomy-collision finding (numbering is a chat overlay; only T7/T8 have verbatim repo tags) and the T9-not-closed gap.

## decisions

- [ADR-001-platform-model](./decisions/ADR-001-platform-model.md) — Platform model (accepted)
- [ADR-002-tier-model](./decisions/ADR-002-tier-model.md) — Tier model (base_tier + effective_tier) (accepted)
- [ADR-003-server-centric-dual-write](./decisions/ADR-003-server-centric-dual-write.md) — Server-centric dual-write for tier fields (accepted)
- [ADR-004-auth-pattern-split](./decisions/ADR-004-auth-pattern-split.md) — Auth pattern split (isPlatformAdmin vs WORKER_SECRET) (accepted)
- [ADR-005-discipline-enforcement-layered-architecture](./decisions/ADR-005-discipline-enforcement-layered-architecture.md) — Discipline enforcement layered architecture (accepted)
- [ADR-006-plan-skill-hybrid](./decisions/ADR-006-plan-skill-hybrid.md) — Plan-skill hybrid discipline (multi-dispatch coordination) (deprecated)
- [ADR-007-bias-tag-threshold-per-dimension](./decisions/ADR-007-bias-tag-threshold-per-dimension.md) — Bias-tag auto-cutoff threshold per dimension (D1 decision) (accepted)
- [ADR-008-urgency-score-default](./decisions/ADR-008-urgency-score-default.md) — urgency_score default behavior for intelligence_items inserts (accepted)
- [ADR-009-adr-system-architecture](./decisions/ADR-009-adr-system-architecture.md) — ADR system architecture (meta) (deprecated)
- [ADR-010-docs-taxonomy-and-brain-conventions](./decisions/ADR-010-docs-taxonomy-and-brain-conventions.md) — Docs taxonomy, INDEX discipline, and two-repo memory architecture (accepted)
- [ADR-011-ddl-authority-delegation](./decisions/ADR-011-ddl-authority-delegation.md) — DDL apply authority: additive/low-risk delegated with ledger-recorded identity + read-back; break-risky classes (RLS, drops, customer-read-path) stay operator-window; + DELEGATED-WITH-PROOF amendment (mig-160 applied 2026-07-08 under it, 56→0 pinned, customer path unchanged) (accepted)
- [ADR-012-intake-cadence-and-launch-exit-test](./decisions/ADR-012-intake-cadence-and-launch-exit-test.md) — Intake is manual-triggered by design (auto-cadence built + dormant); the cadence/schedule/scan/fetch-now mechanism already EXISTS (scrape-schedule.ts + pause-global + admin/scan), so the ruling is wire-not-build; hold gates scheduled fetching only, manual run is a signed manifest-bound exception (2nd caller); + the 9-clause launch-complete exit test (accepted)
- [ADR-013-phase3-closure-and-scope-doctrine-tightening](./decisions/ADR-013-phase3-closure-and-scope-doctrine-tightening.md) — Snapshot-first Phase-3 restitution CLOSED not run (population gone: June-undispositioned 0, the 197 was status-only = 37 live + 160 archived); cheap-verify (#296) is the standing mechanism for Oct-31 deferral exits + dwell crossings; report-scope doctrine tightened to require the archival predicate (live-only vs status-only) on any population count (accepted)

## inventories

- [components](./inventories/components.md) — Shared Components Inventory
- [discipline](./inventories/discipline.md) — Discipline Engine Inventory
- [migrations](./inventories/migrations.md) — Migrations Inventory
- [out-of-band-objects](./inventories/out-of-band-objects.md) — Out-of-band DB objects (live-not-in-migrations) ledger
- [worktrees](./inventories/worktrees.md) — Git Worktrees Inventory

## doctrine

- [worktree-isolation](./doctrine/worktree-isolation.md) — Doctrine seed: agent branch/checkout/merge ONLY in the assigned worktree (RD-19; Unit-0 register seed)

## runbooks

- [INTEGRITY-TRIAGE-PROCEDURE](./runbooks/INTEGRITY-TRIAGE-PROCEDURE.md) — Integrity-flag triage procedure
- [PERF-PLAYBOOK](./runbooks/PERF-PLAYBOOK.md) — Perf Playbook
- [SPOT-CHECK-PROCEDURE](./runbooks/SPOT-CHECK-PROCEDURE.md) — Tier-H Spot-Check Procedure
- [sprint4-dataops-ledger](./runbooks/sprint4-dataops-ledger.md) — Sprint 4 — Data-Operations Ledger (already-executed; do NOT re-run)

## plans

- [C5-feed-spec](./plans/C5-feed-spec.md) — C5 — Group Post Feed Specification
- [C6-promote-spec](./plans/C6-promote-spec.md) — C6 — Promote Community Post to Intelligence
- [C7-notifications-spec](./plans/C7-notifications-spec.md) — C7 — Community Notifications Surface
- [C8-moderation-spec](./plans/C8-moderation-spec.md) — C8 — Community moderation workflow
- [C9-realtime-spec](./plans/C9-realtime-spec.md) — C9 — Community Realtime Infrastructure
- [SOURCE-TYPE-TAXONOMY-PROPOSAL](./plans/SOURCE-TYPE-TAXONOMY-PROPOSAL.md) — `source_type` Taxonomy Column — Design Proposal
- [W2A-bulk-import-spec](./plans/W2A-bulk-import-spec.md) — W2.A — Bulk-add tooling
- [W2B-discovery-agent-spec](./plans/W2B-discovery-agent-spec.md) — W2.B — Sub-national-aware Discovery Agent
- [W2D-coverage-matrix-spec](./plans/W2D-coverage-matrix-spec.md) — W2.D — Coverage Matrix Spec
- [W2F-verification-pipeline](./plans/W2F-verification-pipeline.md) — W2.F — Auto-verification pipeline
- [W4-backfill-plan](./plans/W4-backfill-plan.md) — W4 — Backfill plan
- [W5-cost-projection](./plans/W5-cost-projection.md) — W5 — Cost Projection
- [build-8-research-surface](./plans/build-8-research-surface.md) — Build 8 — Research surface (Q9 signal-set integration)
- [category-e-investigation-2026-05-21](./plans/category-e-investigation-2026-05-21.md) — Phase 4 Category E Investigation, 2026-05-21
- [classification-backfill-ambiguous-2026-05-22](./plans/classification-backfill-ambiguous-2026-05-22.md) — Classification backfill: ambiguous items needing per-item operator decision
- [classification-backfill-plan-2026-05-22](./plans/classification-backfill-plan-2026-05-22.md) — intelligence_items.domain backfill plan (proposed, not executed)
- [dead-code-disposition-2026-05-21](./plans/dead-code-disposition-2026-05-21.md) — Dead-Code Disposition Report — Caro's Ledge (2026-05-21)
- [dispatch-2.5-writer-redistribution-prework-2026-05-15](./plans/dispatch-2.5-writer-redistribution-prework-2026-05-15.md) — Dispatch 2.5 Prework: Writer Redistribution
- [dispatch-spec-corrections-2026-05-10](./plans/dispatch-spec-corrections-2026-05-10.md) — Dispatch spec corrections — 2026-05-10
- [fix-d-scope-2026-05-23](./plans/fix-d-scope-2026-05-23.md) — Fix D scope (2026-05-23)
- [ingest-pipeline-investigation-2026-05-22](./plans/ingest-pipeline-investigation-2026-05-22.md) — Ingest Pipeline Investigation: Staleness + Domain Classification Leakage
- [ingest-restart-sequencing-2026-05-22](./plans/ingest-restart-sequencing-2026-05-22.md) — Ingest restart sequencing + leakage prerequisite (2026-05-22)
- [multi-tenant-foundation-prework-2026-05-15](./plans/multi-tenant-foundation-prework-2026-05-15.md) — Multi-Tenant Foundation — Pre-Work Findings
- [registry-to-ingestion-handoff-design-2026-05-10](./plans/registry-to-ingestion-handoff-design-2026-05-10.md) — Registry-to-ingestion handoff design surface, 2026-05-10
- [regulations-classification-mismatch-counts-2026-05-22](./plans/regulations-classification-mismatch-counts-2026-05-22.md) — Regulations classification mismatch counts (2026-05-22)
- [skill-refinements-prework-2026-05-15](./plans/skill-refinements-prework-2026-05-15.md) — Skill Refinements Prework, 2026-05-15
- [source-classification-framework-2026-05-10](./plans/source-classification-framework-2026-05-10.md) — Source Classification Framework
- [source-health-architecture-investigation-2026-05-21](./plans/source-health-architecture-investigation-2026-05-21.md) — Source Health Architecture Investigation, Phase 5
- [spec-audit-community-2026-05-23](./plans/spec-audit-community-2026-05-23.md) — Community surface: built vs caros-ledge-platform-intent spec
- [spec-audit-dashboard-2026-05-23](./plans/spec-audit-dashboard-2026-05-23.md) — Spec Audit: Dashboard `/` Built vs `caros-ledge-platform-intent` SKILL
- [spec-audit-map-2026-05-23](./plans/spec-audit-map-2026-05-23.md) — Spec Audit: Map (`/map`) vs caros-ledge-platform-intent SKILL.md
- [spec-audit-market-intel-2026-05-23](./plans/spec-audit-market-intel-2026-05-23.md) — Spec audit: Market Intel built vs caros-ledge-platform-intent spec
- [spec-audit-operations-2026-05-23](./plans/spec-audit-operations-2026-05-23.md) — Spec audit: /operations built vs caros-ledge-platform-intent SKILL (2026-05-23)
- [spec-audit-regulations-2026-05-23](./plans/spec-audit-regulations-2026-05-23.md) — Regulations surface, spec audit (2026-05-23)
- [spec-audit-research-2026-05-23](./plans/spec-audit-research-2026-05-23.md) — Spec audit, /research, built vs caros-ledge-platform-intent spec
- [spec-audit-synthesis-2026-05-23](./plans/spec-audit-synthesis-2026-05-23.md) — Spec-vs-Built Audit: Cross-Surface Synthesis (2026-05-23)
- [spec-audit-user-chrome-2026-05-23](./plans/spec-audit-user-chrome-2026-05-23.md) — Spec audit: user chrome (8 pages) vs caros-ledge-platform-intent
- [wave1-track5-widget-implementation-plan](./plans/wave1-track5-widget-implementation-plan.md) — Phase 3 Widget Implementation Plan (PR-G3)

## audits

- [BRIEF-STRUCTURE-AUDIT](./audits/BRIEF-STRUCTURE-AUDIT.md) — Brief Structure Audit
- [DESIGN-AUDIT-2026-05](./audits/DESIGN-AUDIT-2026-05.md) — Design Audit — Preview vs Live App
- [E2E-VERIFICATION](./audits/E2E-VERIFICATION.md) — E2E Verification — PRs #20–#23
- [INTEGRITY-TRIAGE-REPORT](./audits/INTEGRITY-TRIAGE-REPORT.md) — Integrity-flag triage report
- [ISR-WRITE-INVESTIGATION](./audits/ISR-WRITE-INVESTIGATION.md) — ISR Write-Source Investigation — Caro's Ledge
- [PAGE-LOAD-PERF-AUDIT-2026-05-06](./audits/PAGE-LOAD-PERF-AUDIT-2026-05-06.md) — Page-Load Performance Audit — 2026-05-06
- [PERF-AUDIT](./audits/PERF-AUDIT.md) — Page-Load Performance Audit
- [PERF-PROFILING-FINDINGS](./audits/PERF-PROFILING-FINDINGS.md) — Perf Claim Investigation — Fresh Findings
- [REGIONAL-DATA-COLLECTION-AUDIT](./audits/REGIONAL-DATA-COLLECTION-AUDIT.md) — Regional Data Collection — Ground Truth Audit
- [SESSION-AUDIT-2026-05-05](./audits/SESSION-AUDIT-2026-05-05.md) — Session Audit — 2026-05-05
- [VISUAL-RECONCILIATION-2026-05-06](./audits/VISUAL-RECONCILIATION-2026-05-06.md) — Caro's Ledge — Visual Reconciliation Audit
- [W1A-dual-write-audit](./audits/W1A-dual-write-audit.md) — W1.A — Dual-Write Audit: `jurisdictions` Callsites
- [W1B-approval-handler-analysis](./audits/W1B-approval-handler-analysis.md) — W1.B — Staged-update approval handler: root cause + fix
- [W1C-source-attribution-summary](./audits/W1C-source-attribution-summary.md) — W1.C — Source attribution audit summary
- [WORKER-ACTIVATION-AUDIT-2026-05-08](./audits/WORKER-ACTIVATION-AUDIT-2026-05-08.md) — Worker activation audit — 2026-05-08
- [access-method-triage-2026-05-12](./audits/access-method-triage-2026-05-12.md) — Access-Method Triage, 2026-05-12
- [auth-architecture-audit-2026-05-10](./audits/auth-architecture-audit-2026-05-10.md) — Auth architecture audit, 2026-05-10
- [california-pilot-summary](./audits/california-pilot-summary.md) — California Pilot Results
- [cards-clickable-audit-2026-05-12](./audits/cards-clickable-audit-2026-05-12.md) — Cards Clickable Audit — 2026-05-12
- [caros-ledge-product-audit-2026-05-15](./audits/caros-ledge-product-audit-2026-05-15.md) — Caro's Ledge product audit, v2 — 2026-05-15
- [caros-ledge-supabase-schema-audit-2026-05-15](./audits/caros-ledge-supabase-schema-audit-2026-05-15.md) — Caro's Ledge Supabase schema audit, 2026-05-15
- [classification-rules-audit-2026-05-09](./audits/classification-rules-audit-2026-05-09.md) — Classification rules audit, 2026-05-09
- [cleanup-audit-2026-05-11](./audits/cleanup-audit-2026-05-11.md) — Wave cleanup audit, 2026-05-11
- [comprehensive-site-audit-2026-05-25](./audits/comprehensive-site-audit-2026-05-25.md) — Caro's Ledge, Comprehensive Site Audit
- [dashboard-payload-audit-2026-05-11](./audits/dashboard-payload-audit-2026-05-11.md) — Dashboard payload audit, 2026-05-11
- [font-usage-audit-2026-05-11](./audits/font-usage-audit-2026-05-11.md) — Font weight usage audit, 2026-05-11
- [four-page-architecture-survey-2026-05-09](./audits/four-page-architecture-survey-2026-05-09.md) — Four-page architecture survey, 2026-05-09
- [functional-purpose-audit-2026-05-24](./audits/functional-purpose-audit-2026-05-24.md) — Caro's Ledge, Surface Functional Purpose Audit
- [hotfix-3-perf-audit-2026-05-07](./audits/hotfix-3-perf-audit-2026-05-07.md) — Hotfix 3 — Performance Audit (Investigation Only)
- [jurisdiction-normalization-audit-2026-05-11](./audits/jurisdiction-normalization-audit-2026-05-11.md) — Jurisdiction-Token Fragmentation Audit
- [migration-drift-investigation-2026-05-12](./audits/migration-drift-investigation-2026-05-12.md) — Migration 070 drift investigation
- [primitives-audit-2026-05-09](./audits/primitives-audit-2026-05-09.md) — Caro's Ledge ingestion primitives audit, 2026-05-09
- [source-classification-final-summary-2026-05-11](./audits/source-classification-final-summary-2026-05-11.md) — Source classification backfill — final summary
- [source-coverage-diagnostic-2026-05-09](./audits/source-coverage-diagnostic-2026-05-09.md) — EU ESRS coverage diagnostic + curation methodology audit, 2026-05-09
- [source-map-existence-check-2026-05-10](./audits/source-map-existence-check-2026-05-10.md) — ESG-Today source map existence check, 2026-05-10
- [source-map-from-esgtoday-2026-05-09](./audits/source-map-from-esgtoday-2026-05-09.md) — Source Registry Expansion
- [sources-content-verification-2026-05-11](./audits/sources-content-verification-2026-05-11.md) — Sources + content verification, 2026-05-11
- [topic-relevance-investigation-2026-05-09](./audits/topic-relevance-investigation-2026-05-09.md) — Topic relevance investigation, 2026-05-09
- [us-state-code-audit-2026-05-12](./audits/us-state-code-audit-2026-05-12.md) — US-state Code Audit — 2026-05-12
- [wave1-archive-logs-disposition-2026-07-07](./audits/wave1-archive-logs-disposition-2026-07-07.md) — Wave-1 archive-logs disposition + Obsidian-vault topology finding, 2026-07-07
- [wave1-step1-verification](./audits/wave1-step1-verification.md) — Wave 1a Step 1 — Post-merge verification checklist
- [wave1-track1-summary](./audits/wave1-track1-summary.md) — Wave 1a Track 1 (Gate 4) Discovery Summary
- [wave1b-stub-quality-investigation-2026-05-11](./audits/wave1b-stub-quality-investigation-2026-05-11.md) — Wave 1b stub quality investigation, 2026-05-11

## ops

- [session-log](./ops/session-log.md) — Dated session-close log (accomplished / decisions / blockers / next steps)
- [traceability-matrix-2026-07-07](./ops/chrome-audit-2026-07/traceability-matrix-2026-07-07.md) — Live-pages audit findings register + disposition matrix (41 findings, DEEP-AUDIT + date/dedup)
- [deletion-reclassification-log](./ops/deletion-reclassification-log.md) — Deletion / reclassification log
- [flip-readiness-2026-07-08](./ops/flip-readiness-2026-07-08.md) — Cadence/loop flip readiness; the three standing switches (cadence/batch-1/budget)
- [browser-verification-pending](./ops/browser-verification-pending.md) — The one accumulating browser-check list for Jason's end-of-program session
- [program-closeout-2026-07-08](./ops/program-closeout-2026-07-08.md) — Build-to-completion close-out: DONE checklist (7/7), census, + the 18-flag operator decision table
- [root-cause-why-the-queue-2026-07-08](./ops/root-cause-why-the-queue-2026-07-08.md) — ROOT CAUSE: why /admin reads 1,280 with 0 agent runs — built as a human-supervised DETECTION engine; the autonomous DRAIN half (1 of 17 flag classes) was never wired. Corrects the "DONE 7/7" claim.
- [site-gap-register-2026-07-09](./ops/site-gap-register-2026-07-09.md) — CANONICAL BASELINE (supersedes the traceability matrix): Chrome wiring-audit U-01..U-11 + D/F/Q fix-forward rows + U-11 ledger truth + phase-0-5 baseline mapping. F-1 fabricated-source class kill recorded.
- [conservation-audit-2026-07-09](./ops/conservation-audit-2026-07/conservation-audit-2026-07-09.md) — Full-pipeline conservation audit: stage-loss table, 4 axes, defect-class table w/ mechanisms. Headline: 56% archived is cleanup (conserved); 63/240 verified fail the CURRENT moat gate (all pool-recoverable, pre-mig-158 residue); 88 dup claim rows deleted; provisional(489)/quarantine(48) drains = BUILD GAPS; credential guard blocks MCP provenance writes (working).
- board-reconciliation-2026-07-09 (report branch pushed to origin; not a living in-tree doc) — Full-board status reconciliation (run 2026-07-10): worktree sweep, 2a–2k ledger, money+safety verified, 5-claim DB spot-check, collisions/anomalies + next actions
- [reconciliation-remediation-closeout-2026-07-11](./ops/reconciliation-remediation-closeout-2026-07-11.md) — Full-sequence remediation closeout: lane GREEN (8/8 hard), 65-item backlog dispositioned (7 recovered / 62 deferred-quarantined, verified-live 240→179 fail-closed), 4 tech retypes KEPT, Q-1..Q-3+D-1/D-2 enacted, $3.35 of $10. OPEN: reconciler RLS repair (operator window), resynth label/slot contract gap.
- [data-audit-dispositions](./data-audit-dispositions.md) — Dated waivers for the Layer C data-audit block-next-run gate (the protocol home `preflightStep`/`hasValidWaiver` point to). 2026-07-14 entry: branch-(b) waiver (until 2026-07-28) for one-tier-per-host + claims-tier + ledger-onepass — proven pre-existing tier-correction debt (funded-pass flight caused 0/264), fix owed by the reattribution-relabel + tier-canonicalization unit.
- [reattribution-worklist-2026-07-14](./ops/reattribution-worklist-2026-07-14.md) — Enumerated worklist behind flag `f5a56b11` (worklist-host FACT re-attribution): 42 FACT spans / 13 items grounded to wikipedia/legiscan/policycommons at the retired `?? 5` guessed T5 stamp. Go-forward mint FIXED (source-growth.ts classTierForHost); backward relabel/re-home deferred to its own verified unit (mutates 10 verified customer briefs). 3 research_finding items are sub-floor priority.
- [master-gap-register](./ops/full-system-audit-2026-07-11/master-gap-register.md) — FULL-SYSTEM AUDIT 2026-07-11 (13 agents, coverage PROVEN: 1,348 code files / 85 tables / 63 fns / 183 policies): 12 P1s (org-gate loss, silent-empty provisional queue, profiles no-op writes, seed-on-timeout...), P2/P3/P4 registers, intent verdicts (9× PARTIAL), 62-item pool table (45/8/9), invariant backlog. Plan: [correction-plan](./ops/full-system-audit-2026-07-11/correction-plan.md) (Tracks A–E, build-first lens).
- [multi-tenant-foundation-followups-2026-05-15](./ops/multi-tenant-foundation-followups-2026-05-15.md) — Multi-Tenant Foundation Follow-Ups, 2026-05-15

## design

- [decision-package-2026-07-06](./design/decision-package-2026-07-06.md) — Decision Package — 52 live non-verified items (read-only)
- [design-principles](./design/design-principles.md) — Caro's Ledge Design Principles

## sprint-1

- [alignment-audit-2026-05-18](./sprint-1/alignment-audit-2026-05-18.md) — Caro's Ledge Alignment Audit, 2026-05-18
- [critical-investigations-2026-05-18](./sprint-1/critical-investigations-2026-05-18.md) — Caro's Ledge Sprint 1 Critical Investigations Report, 2026-05-18
- [followups](./sprint-1/followups.md) — Sprint 1 Followups
- [intelligence-assistant-audit-2026-05-18](./sprint-1/intelligence-assistant-audit-2026-05-18.md) — Caro's Ledge Intelligence Assistant Behavior Audit, 2026-05-18
- [onboarding-audit-2026-05-18](./sprint-1/onboarding-audit-2026-05-18.md) — Caro's Ledge Onboarding Flow Audit, 2026-05-18
- [perf-1-design](./sprint-1/perf-1-design.md) — PERF-1: Cache Headers Design (Narrowed, Implementation-Ready)
- [phase-1-admin-signals](./sprint-1/phase-1-admin-signals.md) — Sprint 1 Phase 1: Two-Admin-Signals Resolution
- [phase-2-dedup-plan](./sprint-1/phase-2-dedup-plan.md) — Sprint 1 Phase 2: Canonical-Entity Dedup Plan
- [phase-3-jurisdiction-vocabulary](./sprint-1/phase-3-jurisdiction-vocabulary.md) — Sprint 1 Phase 3: Jurisdiction Vocabulary Extension
- [phase-3-operator-decision](./sprint-1/phase-3-operator-decision.md) — Sprint 1 Phase 3: Operator Decision (Authorization Packet)
- [phase-4-migrations-summary](./sprint-1/phase-4-migrations-summary.md) — Sprint 1 Phase 4a: Migrations Summary
- [phase-4b-design](./sprint-1/phase-4b-design.md) — Sprint 1 Phase 4b: Operator Queue Tables + Rejected-Token Routing
- [phase-4b-sql-review-final](./sprint-1/phase-4b-sql-review-final.md) — Phase 4b SQL Review, Final
- [phase-5-design](./sprint-1/phase-5-design.md) — Sprint 1 Phase 5: Data Migration Design
- [phase-7-scope-amendment](./sprint-1/phase-7-scope-amendment.md) — Sprint 1 Phase 7: Scope Amendment
- [schema-reconciliation-discovery-2026-05-18](./sprint-1/schema-reconciliation-discovery-2026-05-18.md) — Caro's Ledge Sprint 1 Schema Reconciliation Discovery (Stage 1)
- [system-audit-2026-05-18](./sprint-1/system-audit-2026-05-18.md) — Caro's Ledge Sprint 1 System Audit, 2026-05-18 post-PR-#122

## sprint-2

- [Phase-1.5-consumer-migration-list](./sprint-2/Phase-1.5-consumer-migration-list.md) — Phase 1.5 Consumer Migration List (Q2 base_tier + effective_tier)
- [category-routing-wiring-notes](./sprint-2/category-routing-wiring-notes.md) — Sprint 2 Build 4: Category Routing Wiring Notes
- [source-credibility-model-decisions-2026-05-19](./sprint-2/source-credibility-model-decisions-2026-05-19.md) — Source Credibility Model: Architectural Decisions Capture (2026-05-19)
- [sprint-2-planning-2026-05-18](./sprint-2/sprint-2-planning-2026-05-18.md) — Caro's Ledge Sprint 2 Planning, 2026-05-18

## top-level living docs

- [tech-debt-log](./tech-debt-log.md) — living technical debt register
- [blind-ci-window-audit-2026-07-08](./audits/blind-ci-window-audit-2026-07-08.md) — Blind-CI-window audit: 8 dark suites (≤46d), all green isolated, guarded modules 0 in-window changes across 81 merges → zero regressions; class-fix #256 + branch protection
- [redesign-completeness-2026-07-08](./audits/redesign-completeness-2026-07-08.md) — Recon: all 11 redesign templates rebuilt + live on master (dispatch's "2 of 11" was stale); T03 detail archetype reached master via integration path
- [dispatch-stop-conditions-protocol](./ops/dispatch-stop-conditions-protocol.md) — binding: dispatches declare STOP-CONDITIONS before authorities; agent restates them at closeout + runs a closeout self-audit (mechanical half of operator-stop-conditions-are-absolute)
