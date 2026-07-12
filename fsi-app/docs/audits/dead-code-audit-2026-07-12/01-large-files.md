# Dead-Code Audit — 01: Large Files (>500 lines)

Date: 2026-07-11
Scope: product tree under `fsi-app/` (repo root `C:\Users\jason\dotfiles`). Read-only. DELETE NOTHING.
Method: line-count survey; then for every source file over 500 lines, verify import/use across the product tree (excluding `node_modules`, `.next`, `_snapshots/`, `scripts/tmp/`, and the `.claude/worktrees/` repo copies) and assign a verdict.

## Verdict definitions used here
- **ACTIVE** — imported by a live file, or a framework/CI entrypoint (`route.ts`, `page.tsx`, `layout.tsx`, workflow, governance/CI-wired).
- **DEAD-WEIGHT** — no runtime/import/CI role; a one-shot operational script tied to a completed, named dispatch/wave/PR/migration that would no-op or is superseded on re-run. **This is NOT a delete instruction** — these carry forensic/template value and the audit mandate is DELETE NOTHING. Flagged for an operator archival decision.
- **UNCERTAIN** — not imported/wired, but a repeatable or reusable operational/audit tool that could legitimately be re-run; intent-dependent.

## Summary counts
- **Files over 500 lines: 66**
- **ACTIVE: 44** (43 `src/*` app/lib files + `.discipline/governance/invariants.mjs`)
- **DEAD-WEIGHT: 16** (one-shot completed operational scripts)
- **UNCERTAIN: 6** (reusable/repeatable operational scripts)

Key structural finding: **every `.ts`/`.tsx` file over 500 lines is ACTIVE** — each traces through a real import chain to a `page.tsx`, `route.ts`, workflow, or parent component. All 22 findings are standalone `.mjs` operational scripts under `scripts/` and `supabase/seed/` that are **not** referenced in `package.json` (only `measure-bundles.mjs` is wired, via `perf:bundles`), not imported as modules, and not invoked by CI/cron. They were run manually against the live DB.

---

## STEP 1 — files over 500 lines (sorted by size)

| Lines | Path | Kind | Verdict |
|------:|------|------|---------|
| 2723 | src/lib/supabase-server.ts | lib | ACTIVE |
| 1976 | src/components/community/CommunityRooms.tsx | component | ACTIVE |
| 1705 | supabase/seed/tier1-population-runner.mjs | script | UNCERTAIN |
| 1478 | src/lib/agent/canonical-pipeline.ts | lib | ACTIVE |
| 1349 | src/components/regulations/RegulationDetailSurface.tsx | component | ACTIVE |
| 1252 | src/components/map/MapPageView.tsx | component | ACTIVE |
| 1201 | src/components/community/GroupModals.tsx | component | ACTIVE |
| 1196 | supabase/seed/california-pilot.mjs | script | DEAD-WEIGHT |
| 1146 | src/components/operations/OperationsDetailSurface.tsx | component | ACTIVE |
| 1111 | src/components/pages/MarketSignalDetailSurface.tsx | component | ACTIVE |
| 1086 | src/components/regulations/RegulationsLedger.tsx | component | ACTIVE |
| 1026 | src/components/market/MarketIntelLedger.tsx | component | ACTIVE |
| 1009 | supabase/seed/generate-ca-briefs.mjs | script | DEAD-WEIGHT |
| 1007 | src/components/research/ResearchLedger.tsx | component | ACTIVE |
| 1006 | src/lib/sources/verification.ts | lib | ACTIVE |
| 993 | src/components/research/ResearchFindingDetailSurface.tsx | component | ACTIVE |
| 984 | src/components/onboarding/OnboardingWizard.tsx | component | ACTIVE |
| 973 | src/lib/trust.ts | lib | ACTIVE |
| 969 | supabase/seed/generate-eu-missing-briefs.mjs | script | DEAD-WEIGHT |
| 961 | src/components/sources/CanonicalSourceReview.tsx | component | ACTIVE |
| 931 | supabase/seed/verify-end-to-end.mjs | script | DEAD-WEIGHT |
| 880 | src/components/admin/AdminDashboard.tsx | component | ACTIVE |
| 852 | src/components/sources/SourceAdminControls.tsx | component | ACTIVE |
| 839 | scripts/tier1-eu-southern-eastern-execute.mjs | script | DEAD-WEIGHT |
| 832 | src/lib/data.ts | lib | ACTIVE |
| 827 | supabase/seed/triage-integrity-flags.mjs | script | UNCERTAIN |
| 827 | src/lib/agent/parse-output.ts | lib | ACTIVE |
| 812 | src/components/admin/CoverageMatrixView.tsx | component | ACTIVE |
| 811 | src/components/operations/OperationsLedger.tsx | component | ACTIVE |
| 799 | src/components/admin/BulkImportView.tsx | component | ACTIVE |
| 749 | scripts/tier1-eu-western-nordic-execute.mjs | script | DEAD-WEIGHT |
| 747 | .discipline/governance/invariants.mjs | governance | ACTIVE |
| 730 | scripts/phase-5-backfill.mjs | script | DEAD-WEIGHT |
| 728 | supabase/seed/audit-tier-h-spot-check.mjs | script | UNCERTAIN |
| 725 | supabase/seed/spot-check-all-h-tier.mjs | script | UNCERTAIN |
| 711 | src/components/community/CommunitySidebar.tsx | component | ACTIVE |
| 690 | src/components/admin/PlatformIntegrityFlagsView.tsx | component | ACTIVE |
| 690 | scripts/tier1-au-apac-execute.mjs | script | DEAD-WEIGHT |
| 675 | src/app/api/orgs/[org_id]/members/route.ts | api route | ACTIVE |
| 669 | src/app/api/admin/sources/bulk-import/route.ts | api route | ACTIVE |
| 668 | src/components/profile/UserProfilePage.tsx | component | ACTIVE |
| 648 | src/lib/sources/discovery.ts | lib | ACTIVE |
| 639 | src/components/community/ModerationQueue.tsx | component | ACTIVE |
| 629 | src/types/source.ts | types | ACTIVE |
| 628 | scripts/wave2-cleanup-execute.mjs | script | DEAD-WEIGHT |
| 624 | scripts/q4-bias-batch-assign.mjs | script | UNCERTAIN |
| 614 | src/components/community/CommunityShell.tsx | component | ACTIVE |
| 585 | src/lib/agent/extract-regulation-sections.ts | lib | ACTIVE |
| 584 | src/components/sources/SourceHealthDashboard.tsx | component | ACTIVE |
| 584 | src/components/admin/redesign/MembersPanel.tsx | component | ACTIVE |
| 576 | scripts/tier1-us-midwest-execute.mjs | script | DEAD-WEIGHT |
| 575 | scripts/wave1-cold-start.mjs | script | DEAD-WEIGHT |
| 571 | src/components/community/Post.tsx | component | ACTIVE |
| 568 | scripts/tier1-intl-cities-execute.mjs | script | DEAD-WEIGHT |
| 556 | src/components/profile/MembersPanel.tsx | component | ACTIVE |
| 541 | src/components/admin/IntegrityFlagsView.tsx | component | ACTIVE |
| 537 | src/components/AskAssistant.tsx | component | ACTIVE |
| 535 | src/components/admin/TierOpinionDisagreementsView.tsx | component | ACTIVE |
| 532 | src/components/resource/IntelligenceBrief.tsx | component | ACTIVE |
| 532 | scripts/tier1-us-cities-execute.mjs | script | DEAD-WEIGHT |
| 530 | src/lib/agent/system-prompt.ts | lib | ACTIVE |
| 525 | src/lib/constants.ts | lib | ACTIVE |
| 505 | supabase/seed/W4_1_iso_backfill.mjs | script | DEAD-WEIGHT |
| 504 | scripts/tier1-ca-provinces-execute.mjs | script | DEAD-WEIGHT |
| 502 | scripts/wave1-api-discovery.mjs | script | DEAD-WEIGHT |
| 502 | scripts/backfill-classify-batch.mjs | script | UNCERTAIN |

Note on excluded trees: `scripts/tmp/` and `_snapshots/` are gitignored scratch (no such file appears above); `.claude/worktrees/*` contain full duplicate copies of the repo (many 2000+ line duplicates of `supabase-server.ts`, `RegulationDetailSurface.tsx`, `RegulationsSurface.tsx`, etc.) — these are working-tree copies of live product files, out of scope. Root-level `.bashrc`/`install.sh` are legacy dotfiles, not the product.

---

## STEP 2 — per-file analysis (all 66 files)

### ACTIVE — application `src/` files (43)

**src/lib/supabase-server.ts** (2723) — Core server-side Supabase data layer: `createClient`, all `fetch*` data accessors (dashboard, resources, listings, map, sources, trust), baseline trust wiring. (a) The app's primary DB access module. (b) 22 import references across routes, `src/lib/data.ts`, components. (c) ACTIVE — foundational data layer imported repo-wide.

**src/components/community/CommunityRooms.tsx** (1976) — Redesign TEMPLATE 11 client surface: regional rooms grid, join/leave, regional ledger, discussion composer. (b) Imported by `src/app/community/page.tsx`. (c) ACTIVE — community index page body.

**src/lib/agent/canonical-pipeline.ts** (1478) — The single canonical brief-generation pipeline (deep-dive generate → section → ground → grow) as plain lib functions the workflow steps call. (b) Imported by `src/workflows/generate-brief.ts`; itself imports `parse-output`, `system-prompt`, `extract-regulation-sections`. (c) ACTIVE — core generation engine invoked by the workflow.

**src/components/regulations/RegulationDetailSurface.tsx** (1349) — Client detail surface for `/regulations/[slug]` (Redesign T03). (b) Imported by `src/app/regulations/[slug]/page.tsx`. (c) ACTIVE — regulation detail page body.

**src/components/map/MapPageView.tsx** (1252) — Redesign TEMPLATE 09 map surface (Leaflet basemap kept, schematic mock discarded). (b) Imported by `src/app/map/page.tsx`. (c) ACTIVE — map page body.

**src/components/community/GroupModals.tsx** (1201) — Modal surfaces (three) for GroupHeader actions. (b) Imported by `src/components/community/GroupHeader.tsx`. (c) ACTIVE — used by the community group header.

**src/components/operations/OperationsDetailSurface.tsx** (1146) — Client detail view for `/operations/[slug]` (regional_data item type). (b) Imported by `src/app/operations/[slug]/page.tsx`. (c) ACTIVE — operations detail page body.

**src/components/pages/MarketSignalDetailSurface.tsx** (1111) — Client detail surface for `/market/[slug]` (Redesign T05). (b) Imported by `src/app/market/[slug]/page.tsx`. (c) ACTIVE — market signal detail page body.

**src/components/regulations/RegulationsLedger.tsx** (1086) — Redesigned `/regulations` index (Redesign TEMPLATE 02, the index archetype). (b) Imported by `src/app/regulations/page.tsx`. (c) ACTIVE — regulations index page body.

**src/components/market/MarketIntelLedger.tsx** (1026) — Redesigned `/market` index (Redesign TEMPLATE 04). (b) Imported by `src/app/market/page.tsx`. (c) ACTIVE — market index page body.

**src/components/research/ResearchLedger.tsx** (1007) — Redesigned `/research` index (Redesign TEMPLATE 06). (b) Imported by `src/app/research/page.tsx`. (c) ACTIVE — research index page body.

**src/lib/sources/verification.ts** (1006) — W2.F auto-verification pipeline: triages discovered candidate URLs into H/M/L tiers and acts (insert to `sources` / `provisional_sources`). (b) Imported by `bulk-import/route.ts`, `spot-check/recurring/route.ts`, `src/lib/sources/discovery.ts`. (c) ACTIVE — source verification engine used by routes and discovery.

**src/components/research/ResearchFindingDetailSurface.tsx** (993) — Client detail view for `/research/[slug]`. (b) Imported by `src/app/research/[slug]/page.tsx`. (c) ACTIVE — research detail page body.

**src/components/onboarding/OnboardingWizard.tsx** (984) — Onboarding flow (sectors, jurisdictions, workspace store). (b) Imported by `src/app/onboarding/page.tsx`. (c) ACTIVE — onboarding page body.

**src/lib/trust.ts** (973) — Source Trust Scoring Engine: computes trust scores from metrics, evaluates promotion/demotion. (b) Imported by `supabase-server.ts`, `q7-daily-recompute/route.ts`, `recompute-trust/route.ts`, `source-growth.ts`. (c) ACTIVE — trust engine used server-wide.

**src/components/sources/CanonicalSourceReview.tsx** (961) — Canonical Source Issues review UI (approve/reject/edit/defer). (b) Imported by `src/components/sources/SourceHealthDashboard.tsx`. (c) ACTIVE — nested in the source health dashboard.

**src/components/admin/AdminDashboard.tsx** (880) — Redesign TEMPLATE 08 admin dashboard shell. (b) Imported by `src/app/admin/page.tsx`; imports many admin sub-views. (c) ACTIVE — admin page body.

**src/components/sources/SourceAdminControls.tsx** (852) — Per-source admin controls (pause/play/refresh/reset). (b) Imported by `SourceHealthDashboard.tsx`. (c) ACTIVE — used in source health dashboard.

**src/lib/data.ts** (832) — Cached (`unstable_cache`) data accessors wrapping the server fetchers. (b) 28 import references across pages/components. (c) ACTIVE — cache layer used repo-wide.

**src/lib/agent/parse-output.ts** (827) — Parses agent output (markdown brief + New Sources table + YAML frontmatter) under the SKILL contract. (b) Imported by `canonical-pipeline.ts`. (c) ACTIVE — output parser in the generation pipeline.

**src/components/admin/CoverageMatrixView.tsx** (812) — Admin sub-tab rendering the (jurisdiction × item_type) coverage matrix. (b) Imported by `AdminDashboard.tsx`. (c) ACTIVE — admin sub-view.

**src/components/operations/OperationsLedger.tsx** (811) — Redesigned `/operations` surface (Redesign TEMPLATE 07). (b) Imported by `src/app/operations/page.tsx`. (c) ACTIVE — operations index page body.

**src/components/admin/BulkImportView.tsx** (799) — Admin sub-tab for CSV/JSON bulk source import with HEAD validation + W2.F verification. (b) Imported by `AdminDashboard.tsx`. (c) ACTIVE — admin sub-view.

**src/lib/agent/... invariants** — (see governance section)

**src/components/community/CommunitySidebar.tsx** (711) — 280px Slack-style sidebar for `/community/*`. (b) Imported by `CommunityShell.tsx`. (c) ACTIVE — community shell sidebar.

**src/components/admin/PlatformIntegrityFlagsView.tsx** (690) — Admin sub-tab for the platform-level `integrity_flags` table (migration 048); distinct from per-brief IntegrityFlagsView. (b) Imported by `src/components/admin/redesign/FlagsRejectionsQueue.tsx`. (c) ACTIVE — admin queue sub-view.

**src/app/api/orgs/[org_id]/members/route.ts** (675) — Org members API: GET/PATCH/POST/DELETE/PUT handlers for `org_memberships`. (b) Next.js route entrypoint; also targeted by `profile/MembersPanel.tsx`. (c) ACTIVE — framework API entrypoint.

**src/app/api/admin/sources/bulk-import/route.ts** (669) — POST bulk-add tooling (W2.A) — CSV/JSON validation, HEAD reachability, dedup, preview/apply. (b) Next.js route entrypoint; backs `BulkImportView.tsx`. (c) ACTIVE — framework API entrypoint.

**src/components/profile/UserProfilePage.tsx** (668) — User profile/account page (sectors, jurisdictions, admin attention). (b) Imported by `src/app/profile/page.tsx`. (c) ACTIVE — profile page body.

**src/lib/sources/discovery.ts** (648) — W2.B sub-national-aware discovery agent (helper module). (b) Imported by `src/app/api/admin/sources/discover/route.ts`. (c) ACTIVE — discovery engine behind the discover route.

**src/components/community/ModerationQueue.tsx** (639) — Admin-facing moderation reports list. (b) Imported by `src/app/community/moderation/page.tsx`. (c) ACTIVE — moderation page body.

**src/types/source.ts** (629) — Source Trust Framework type definitions + `SOURCE_TIER_DEFINITIONS`. (b) 11 import references (components, lib). (c) ACTIVE — shared type/constant module.

**src/components/community/CommunityShell.tsx** (614) — Top-level layout for `/community/*` (Slack-style shell). (b) Imported by `community/[slug]/page.tsx`, `community/browse/page.tsx`, `community/moderation/page.tsx`. (c) ACTIVE — community layout shell.

**src/lib/agent/extract-regulation-sections.ts** (585) — Tier-3 structured parser for the regulation detail page's 7 numbered sections from `full_brief`. (b) Imported by 8 files (detail surfaces, section components, canonical-pipeline). (c) ACTIVE — section parser used widely.

**src/components/sources/SourceHealthDashboard.tsx** (584) — Source health dashboard (tier filters, source store). (b) Imported by `AdminDashboard.tsx`. (c) ACTIVE — admin sub-view.

**src/components/admin/redesign/MembersPanel.tsx** (584) — Redesign TEMPLATE 08 "workspace members" card (role chip, remove/ban verbs). (b) Imported by `AdminDashboard.tsx`. (c) ACTIVE — admin members card. (Distinct from the profile-scoped MembersPanel below.)

**src/components/community/Post.tsx** (571) — Single post card in a community group feed. (b) Imported by `src/components/community/PostList.tsx`. (c) ACTIVE — post list item.

**src/components/profile/MembersPanel.tsx** (556) — Account · Profile · Members & roles card (redesign T10); wired to `/api/orgs/[org_id]/members`. (b) Imported by `UserProfilePage.tsx`. (c) ACTIVE — profile members card. (Distinct from the admin/redesign MembersPanel above.)

**src/components/admin/IntegrityFlagsView.tsx** (541) — Admin sub-tab listing `intelligence_items` whose `full_brief` contains an integrity-concern phrase. (b) Imported by `src/components/admin/redesign/FlagsRejectionsQueue.tsx`. (c) ACTIVE — admin queue sub-view.

**src/components/AskAssistant.tsx** (537) — Global "Ask" assistant panel (chat over the corpus). (b) Imported by `src/components/AppShell.tsx`. (c) ACTIVE — mounted in the app shell.

**src/components/admin/TierOpinionDisagreementsView.tsx** (535) — Phase 7 admin chrome surfacing sources where agent tier opinions disagree with stored base_tier. (b) Imported by `AdminDashboard.tsx`. (c) ACTIVE — admin sub-view.

**src/components/resource/IntelligenceBrief.tsx** (532) — Markdown brief renderer (react-markdown + gfm, collapsible sections). (b) Imported by `RegulationDetailSurface.tsx` and `resource/SectorSynopsis.tsx`. (c) ACTIVE — brief renderer.

**src/lib/agent/system-prompt.ts** (530) — Runtime `SYSTEM_PROMPT` for `/api/agent/run`, synced to the environmental-policy skill. (b) Imported by `canonical-pipeline.ts`. (c) ACTIVE — agent system prompt used at generation.

**src/lib/constants.ts** (525) — App identity, sectors, jurisdictions, nav constants. (b) 26 import references repo-wide. (c) ACTIVE — shared constants.

### ACTIVE — governance/CI (1)

**.discipline/governance/invariants.mjs** (747) — The per-INVARIANT enforcement map for all 6 platform skills (the invariant-coverage meta-gate's registry: each invariant enforced-or-exempt). (b) Referenced by `.discipline/governance/invariant-coverage.mjs` (the meta-gate), `doctrine-register.mjs`, `.discipline/hooks/pre-push`, and fitness functions F11/F12. (c) ACTIVE — wired into the pre-push hook and CI meta-gate.

---

### DEAD-WEIGHT — one-shot completed operational scripts (16)

None imported; none in `package.json`/CI/cron. Each is tied to a named, completed dispatch. Retained for forensic/template value — flagged for archival, not deletion.

**supabase/seed/california-pilot.mjs** (1196) — One-shot **dry-run** (NO DB writes) validation of the discovery+verification pipeline against US-CA; emits `docs/california-pilot-*.{json,md}`. (b) NO IMPORTERS (only referenced in docs and by `tier1-population-runner.mjs`'s header comment as the code it forked). (c) DEAD-WEIGHT — superseded by `tier1-population-runner.mjs`; a completed prompt-snapshot pilot.

**supabase/seed/generate-ca-briefs.mjs** (1009) — One-shot Sonnet brief generation for the four W4.4 California items (SB 253/261, AB 1305, Advanced Clean Fleets), writes back to `intelligence_items`. (b) NO IMPORTERS (referenced only by the EU clone's header). (c) DEAD-WEIGHT — item-specific, already executed.

**supabase/seed/generate-eu-missing-briefs.mjs** (969) — EU counterpart of the above (one-shot brief generation). **Header is a stale verbatim copy of `generate-ca-briefs.mjs`** ("four California critical items", CA usage line) — a clone whose comment was never updated. (b) NO IMPORTERS. (c) DEAD-WEIGHT — one-shot, executed; note the copy-paste header defect (see 03-duplication.md).

**supabase/seed/verify-end-to-end.mjs** (931) — Comprehensive E2E verification of PRs #20–#23 (polish-wave audit, community E2E, merge sanity). (b) NO IMPORTERS. (c) DEAD-WEIGHT — bound to long-merged PRs #20–23; obsolete verification harness.

**scripts/tier1-eu-southern-eastern-execute.mjs** (839) — Authorized one-shot inserts for Tier 1 Wave B EU Southern+Eastern (17 states, 34 source inserts), idempotent with per-step read-back. (b) NO IMPORTERS. (c) DEAD-WEIGHT — completed regional population; re-run would no-op (idempotent).

**scripts/tier1-eu-western-nordic-execute.mjs** (749) — Same pattern, EU Western+Nordic (10 states, 24 inserts). (b) NO IMPORTERS. (c) DEAD-WEIGHT — completed regional population.

**scripts/phase-5-backfill.mjs** (730) — Sprint 1 Phase 5 one-shot jurisdiction/ISO backfill + RC-9 dedup, run once in a maintenance window (`--verify-only`/`--execute`). (b) NO IMPORTERS. (c) DEAD-WEIGHT — completed maintenance-window backfill.

**scripts/tier1-au-apac-execute.mjs** (690) — One-shot Tier 1 Wave B Australia+APAC inserts (respawn of closed PR #65). (b) NO IMPORTERS. (c) DEAD-WEIGHT — completed regional population.

**scripts/wave2-cleanup-execute.mjs** (628) — One-shot Wave 2 critical cleanups (stale provisional_sources, Dubai/UAE retag, battery-brief source linkage) with per-step verification. (b) NO IMPORTERS. (c) DEAD-WEIGHT — completed cleanup dispatch.

**scripts/tier1-us-midwest-execute.mjs** (576) — One-shot Tier 1 US Midwest inserts (16 states). (b) NO IMPORTERS. (c) DEAD-WEIGHT — completed regional population.

**scripts/wave1-cold-start.mjs** (575) — One-time Wave 1a cold-start backfill: walks every active source once, classifies, then flips `auto_run_enabled=false` on all ~718 sources. Hard $200 spend halt. (b) NO IMPORTERS. (c) DEAD-WEIGHT — explicitly one-time; completed.

**scripts/tier1-intl-cities-execute.mjs** (568) — One-shot Tier 1 Wave C international-city inserts (10 cities). (b) NO IMPORTERS. (c) DEAD-WEIGHT — completed regional population.

**scripts/tier1-us-cities-execute.mjs** (532) — One-shot Tier 1 Wave C US-city inserts (10 cities, custom ISO codes). (b) NO IMPORTERS. (c) DEAD-WEIGHT — completed regional population.

**supabase/seed/W4_1_iso_backfill.mjs** (505) — One-shot W4.1 ISO backfill for the ~41 `intelligence_items` rows migration 033 left with empty `jurisdiction_iso`. (b) NO IMPORTERS. (c) DEAD-WEIGHT — completed backfill continuation.

**scripts/tier1-ca-provinces-execute.mjs** (504) — One-shot Tier 1 Wave B Canadian provinces/territories inserts (13 entities, 26 inserts). (b) NO IMPORTERS. (c) DEAD-WEIGHT — completed regional population.

**scripts/wave1-api-discovery.mjs** (502) — Wave 1a gate-4 **read-only** structured-access (RSS/API/sitemap) discovery probe over ~691 scrape sources; emits a JSONL recommendation for operator review. (b) NO IMPORTERS. (c) DEAD-WEIGHT — one-shot probe; its JSONL output was the deliverable (a separate writer applies routing).

---

### UNCERTAIN — reusable/repeatable operational scripts (6)

Not imported/wired, but plausibly re-runnable tools rather than dispatch-specific one-shots.

**supabase/seed/tier1-population-runner.mjs** (1705) — The reusable Tier-1 population **engine**: loops a region's jurisdiction list, discovers (Sonnet) + verifies (Haiku), writes tier-H to `sources` / tier-M to `provisional_sources` + audit log, idempotent, resilient. (b) NO IMPORTERS as a module (referenced by `bootstrap-test1.mjs`/`surface-registry-reconstruction.mjs` as a catalogued surface, and by docs). (c) UNCERTAIN — general region-population engine that could seed a new region; not a completed one-shot.

**supabase/seed/triage-integrity-flags.mjs** (827) — **READ-ONLY** triage of integrity-flagged `intelligence_items` (migration 035): classifies flags into 6 types, emits a recommended-action JSON plan the orchestrator acts on. (b) NO IMPORTERS. (c) UNCERTAIN — repeatable read-only ops tool (no writes; re-run whenever new flags accrue).

**supabase/seed/audit-tier-h-spot-check.mjs** (728) — Re-validates a random 20 tier-H auto-approved sources (reachability, pattern match, Haiku re-score vs thresholds). (b) NO IMPORTERS. (c) UNCERTAIN — repeatable audit/calibration tool.

**supabase/seed/spot-check-all-h-tier.mjs** (725) — Full version of the above: re-classifies every not-yet-spot-checked tier-H source at new thresholds and demotes failures (`sources`→`provisional_sources`, suspend not delete). (b) NO IMPORTERS. (c) UNCERTAIN — repeatable maintenance sweep (skips already-checked rows).

**scripts/q4-bias-batch-assign.mjs** (624) — Q4 bias-tag batch assignment over existing sources (confidence-banded `assignment_source`), idempotent, skips operator-confirmed rows. (b) NO IMPORTERS. (c) UNCERTAIN — repeatable batch classifier that can process newly-added sources.

**scripts/backfill-classify-batch.mjs** (502) — Writes 5-axis classification onto `public.sources`, parameterized for batches 2..N, reading `scripts/tmp/_backfill-classify-out.json`. (b) NO IMPORTERS. (c) UNCERTAIN — parameterized repeatable batch writer (depends on a gitignored tmp input file that may no longer exist).

---

## Cross-audit note
Sibling files in this audit directory (`02-unused-exports.md`, `03-duplication.md`, `04-deps-and-shipped.md`) cover unused exports, duplication (including the `generate-ca-briefs`/`generate-eu-missing-briefs` clone flagged above), and dependency/shipped-bundle analysis. This file (`01-large-files.md`) covers only the >500-line file census.
