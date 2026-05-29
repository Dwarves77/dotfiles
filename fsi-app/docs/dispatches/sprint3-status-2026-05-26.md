> **DEPRECATED 2026-05-29.** This document is Sprint 3's historical record (state through commit `4cc0cae`). It stopped being updated after that turn, and substantial work shipped between then and 2026-05-29 (A2 callouts, A4 trajectory, A5 sections, A6 regional facts, Option C URL-anchor backfill, etc.). The current governing contract is [../sprint4-governing-state.md](../sprint4-governing-state.md), section 3.1 of which reconciles the actual post-2026-05-26 state. Do not rely on this file's state table for what shipped.

# Caro's Ledge — Sprint 3 Status & Build Plan

**Date:** 2026-05-26
**Stage:** Mid-Group-A
**Predecessor:** v3 dispatch closed at cbfa471

> **Authoring note.** Initial draft produced by Plan agent
> (a8bcb7ed33d6d7fd5) from a snapshot taken before E1 + E2 landed.
> Corrected below to reflect actual state at commit 4cc0cae: E1
> shipped at f755797, E2 shipped at 4cc0cae. The agent's analytical
> notes (especially the cross-surface masthead verification debt
> in risk #2) preserved verbatim — they're the most surfaced issues.

## Quick status

Sprint 3 is roughly 25% through Group A by dispatch count and roughly 50% through Group A by load-bearing data work. A1 (classifier-quality, the biggest data-layer unblocker) is fully applied — 486 row updates landed clean across category/domain/item_type with 0 errors and 0 verify mismatches. A3 (profiles projection) backfilled the dev profile's org_id + workspace_role + sector cleanly; region deferred Option B per recommendation. A new A1.5/A15 vendor-source-takedown dispatch (5 EcoVadis items archived + 5 sources paused) surfaced and shipped mid-batch — a divergence from the brief that the brief did not anticipate. E1 and E2 both shipped after the agent's snapshot. A2, A4, A5, A6, and every Group B/C/D dispatch are still pending.

## Sprint 3 progress map (A-E groups)

| # | Dispatch | State | Notes / commits |
|---|---|---|---|
| A1 | Classifier-quality review | **COMPLETE** | Haiku batch ran 474 rows at $0.72 actual (cap $5). Apply landed in 3 atomic phases: 51de89d (A1.6.A 285 category-only), ad27eb8 (A1.6.B 132 domain), a8702fc (A1.6.C 69 item_type). Reconciliation at 34589a8: `sprint3-a16-reconciliation-2026-05-25.json`. 657 items in DB post-apply (641 active / 16 archived). Domain shifts: D1 −77, D7 +25, D3 +33, D5 +11. |
| A1.5/A15 | Vendor-source takedown (unplanned dispatch) | **COMPLETE** | Not in brief. 6 EcoVadis sources + 1 CDP Supply Chain identified. 5 EcoVadis items archived to domain 5 (commits 3511e02, 25da342); 5 EcoVadis sources `processing_paused=true` (53c66b5). Broader vendor sweep (f66594f) found 0 new candidates. Revised A1 manifest (f8b786f). |
| A2 | Agent prompt extension (signal_band + theme) | **PARTIAL** | Commit 1 landed at addd210 (15-field YAML contract, signal_band + theme vocab, parser validation, worker seedRow, skill version 2026-05-25). Commit 2 (column-first refactor in MarketPage + ResearchView) HOLDS on 24h ingestion monitoring. |
| A3 | Profiles projection completion | **COMPLETE (3 of 4 columns)** | Backfill applied at f22ff0e: org_id, workspace_role, sector populated for the 1 profile in dev. Region deferred per Option B (explicit user population, not derived). Awaiting operator /community browser-test verification. Log: `sprint3-a3-backfill-log-2026-05-25.json`. |
| A4 | Trajectory schema + ingestion | **PENDING** | Requires migration 107 (`intelligence_items.trajectory_points JSONB`); migrations only reach 106. Dependency: A1 (now satisfied). Awaiting operator start signal. |
| A5 | Intelligence item sections backfill | **PENDING** | Migration 103 (`intelligence_item_sections`) already exists. Needs full_brief parser + 11-of-14 section backfill. Dependency: A1 (now satisfied). |
| A6 | Regional data facts backfill | **PENDING** | Migration 106 (`regions_and_facts`) already exists. Needs Asia/UK/UAE D2-D6 fact rows with source citations. Dependency: A1 (now satisfied). |
| B1-B10 | Universal capability platform | **HOLD** | Per brief Section 4: Group B holds until all of Group A is green-lit. Order: B1 watchlist → B2 share → B3 export → B4 alerts → B5 bookmark/follow → B6 citation → B7 action assignment → B8 deadline reminders → B9 compare → B10 cross-link. |
| C1 | Multi-org-switcher | **HOLD** | Depends on A3 (✓) + B1 (pending). |
| C2 | Admin restructure (retire 11-tab) | **HOLD** | Depends on A3 (✓). Could start when Group A closes. |
| C3 | Community editorial pickup notification | **HOLD** | Depends on A3 (✓) + B4 (pending). |
| C4 | Community editorial-review-flag (Path C) | **CONDITIONAL** | Fires only if operator review of H5 surfaces Path A heuristic insufficiency. Independent of other dispatches. |
| D1 | Community thread urgency + verified variants | **HOLD** | Depends on A3 (✓) + new community_posts column + new profiles.verified column. |
| D2 | Community topic-by-region aggregate | **HOLD** | Depends on A1 (now satisfied — could start). |
| D3 | /map sub-jurisdiction pin density toggle | **PENDING — operator decides scope** | Brief explicitly defers Sprint 3 inclusion decision to operator. |
| E1 | /map cache-payload trimming | **COMPLETE** | Shipped at f755797 (Option A: dropped sources + provisional_sources + open_conflicts from `cachedAppData`). Saves ~2.1 MB; eliminates the v3 Phase 7 build warning. Grep verified zero Dashboard sub-tree consumers. Cache key bumped v1 → v2. |
| E2 | Skill cleanup | **COMPLETE** | Shipped at 4cc0cae (Interpretation A: docs-only cleanup). Scrubbed 3 retired-rule references from SKILL.md. Inventory consistency rule 014 intact. |

## Active holds (what we're waiting on)

Three operator-decision gates currently block forward progress. None are technically blocking — work could be reordered around them — but they are sequenced gates per the brief's "per-dispatch operator green-light" discipline.

1. **A2 commit 2: 24h ingestion monitoring** at addd210 deployment. Query at the 24h mark verifies signal_band populates on market_signal_brief items, theme populates on research_summary items. If columns stay NULL on items that should have them, investigate prompt/parser/worker before commit 2 ships.

2. **A3 /community render verification.** Operator browser-tests the /community surface to confirm author identity now renders Dietl/Rockit (orange) + owner + 6 sectors after the f22ff0e backfill. Empty region per Option B is expected.

3. **D3 Sprint 3 scope.** Brief explicitly defers operator decision on whether /map sub-jurisdiction pin density toggle is in Sprint 3 scope. Not yet decided.

## Build plan going forward

### Immediate next moves once holds lift

- **A2 lifts** → Commit 2 (column-first refactor): MarketPage.tsx + ResearchView.tsx + Resource/ResearchPipelineItem type projections. Verify: TypeScript clean + sample 10 newly-ingested items with both columns visible. Estimate: 1 commit.

### Group A finish (after A2 and A3 verify)

- **A4 (trajectory schema)** depends on A1 (✓). Plan: migration 107 (`ALTER TABLE intelligence_items ADD COLUMN trajectory_points JSONB`), agent prompt extension for B1 Price band items, best-effort backfill, swap H1 TrajectoryEmptyState for real TrajectoryBars on /market when populated. Estimate: 3-4 commits.

- **A5 (sections backfill)** depends on A1 (✓). Plan: markdown parser walking full_brief, populate `intelligence_item_sections` for 11 of 14 sections across regulation briefs, update RegulationDetailSurface to render from sections table. Surface parse failures rather than fabricate. Estimate: 3-5 commits (parser + backfill + UI swap + parse-failure surfacing).

- **A6 (regional data facts backfill)** depends on A1 (✓). Plan: populate D2-D6 fact rows for Asia/UK/UAE with verified source citations, update /operations to render from regional_data_facts. Honest empty state where data unavailable. Estimate: 2-4 commits.

### Group B (after all of Group A green)

10 capability phases B1-B10 per brief Section 3. Each phase atomic commit per capability with per-commit operator browser-test gate per HIGH RISK tier. B1 (watchlist) ships first as canonical pattern; B2-B10 mirror data shape. Estimate per brief: 25-35 commits across 4-6 sessions.

### Groups C, D parallelism opportunities

Per brief Section 4 Phase 4: Group D specific closures run parallel where independent. C2 (admin restructure) and D2 (community topic-by-region aggregate) can both start as soon as their A-dependencies are satisfied (already met for both). C1, C3, D1 wait on Group B work.

## Outstanding decisions

Three items, sequenced by impact:

1. **A4 start** — which surface fix matters most to land first: /market real trajectory bars (A4), /regulations 14-section render (A5), /operations Asia/UK/UAE coverage (A6)? They're parallel-safe; operator picks order.

2. **D3 Sprint 3 in-or-out** — submap density toggle. Cheap to defer further; operator-decide.

3. **profiles.region backfill policy** — A3 chose Option B (empty until user populates). When C1 multi-org-switcher work begins, region UX needs a populate-from-where decision (workspace_settings has no region field; jurisdiction_weights are scoring not declarations).

## Estimated remaining

| Group | Original brief estimate (commits) | Shipped | Remaining estimate | Sessions remaining |
|---|---|---|---|---|
| A | 12-18 | 14 (A1 ×12, A2 ×1, A3 ×1; +A15 5 commits unplanned) | 6-9 (A2 ×1, A4 ×3-4, A5 ×3-5, A6 ×2-4) | 1-2 |
| B | 25-35 | 0 | 25-35 | 4-6 |
| C | 10-15 | 0 | 10-15 (C1, C2, C3 likely; C4 conditional) | 2-3 |
| D | 5-8 | 0 | 5-8 (D1, D2 likely; D3 operator-decide) | 1-2 |
| E | 3-5 | 2 (E1 ×1, E2 ×1) | 0 | 0 |
| **Total** | **55-81** | **~16** | **46-67** | **8-13** |

Sprint 3 is broadly on the originally-projected glide path. Group A landed cheaper-than-estimated where it shipped (A1 batch was 3 commits not 4-6; A3 was 1 commit not 2-3) but the unplanned A15 dispatch consumed budget the brief did not allocate. Group E shipped under the lower-bound estimate.

## Risks + watchpoints

1. **A15 was unplanned and the brief did not anticipate vendor-source takedown work as a category.** The dispatch ran cleanly and the work is honest, but the brief's "26 discrete items / 9 named dispatches" inventory missed it (now tracked as the 10th dispatch). If A15 surfaced once, similar scope-leakage may surface again — especially in Group B where the universal capability platform has 10 internal phases, each large enough that mid-phase scope expansion is plausible. Watch for it; surface explicitly when it happens.

2. **Group A cross-surface count reconciliation has not been re-run as actual masthead queries post-A1 apply.** The brief's PAY ATTENTION note for A1 says: "After A1 applies, masthead counts on every surface may change. Re-run cross-surface count reconciliation per Phase 2A pattern and surface any unexpected count deltas before A1 considered green." The reconciliation artifact (`sprint3-a16-reconciliation-2026-05-25.json`) computes per-domain and per-item-type post-counts and expected net shifts, but there's no record of actual cross-surface masthead-count verification (e.g., /regulations index count == regulations sum across all jurisdictions on the live route). The expected and actual deltas reconciled cleanly in aggregate, but a per-surface query was not run. **Verification debt — should be closed before declaring Group A fully verified.**

3. **A3 region column is empty across the only profile in dev.** When community author identity display lands or when C1 multi-org switcher ships, region will surface as "unset" until users explicitly populate via Profile UI. The community author identity strip currently graceful-degrades (per H6); confirm that degradation path is still active and surface-honest post-A3.

4. **725 sources in `cachedAppData` is the underlying symptom of an architectural drift that E1 addressed tactically.** E1 Option A drops sources from getAppData entirely. The deeper question — "what does the home Dashboard actually consume from getAppData?" — was answered by the consumption grep (zero hits). Architectural drift is contained; if future Dashboard sub-components need source metadata, they should hydrate from a dedicated lean fetcher (Option C from the prework), not re-add `fetchSourceData` to `cachedAppData`.

5. **E2 interpretation drift was itself a signal.** The brief listed 4 "stale" rules; 3 were retired before Sprint 3 began. The brief inherited stale information — a signal that brief-authoring missed a 2026-05-21 skill-state change. Future briefs should sanity-check the skill state of any named rule before listing it for cleanup.

6. **A1 batch operator verdict was inferred from the green-light to apply, not explicitly captured as an artifact.** The A1.6 phases A/B/C all ran cleanly because operator authorized "REVISED A1 MANIFEST GREEN-LIT. Proceed with the three atomic commits" — but the spot-check verdict (Option 2 accept with item_type guard) is captured only in chat, not in a docs/audits/ artifact. Audit-trail gap; the commit messages reference the verdict but the artifact discipline is uneven across dispatches.

7. **`processing_paused=true` on 5 EcoVadis sources is a soft block — manual fetch/regenerate bypasses it (per the b76a104 design).** If any automated path picks those sources up again before a final disposition (delete-from-registry vs keep-paused-indefinitely), the pause flag is only a guard against scheduled workers, not against intentional re-activation. Watch the operator-decision on whether the 5 sources should be archived (deleted from registry) or remain paused.

## Near-term action items

In priority order, things that should happen before declaring further Group A dispatches green:

1. **Run actual masthead-count queries post-A1.** SELECT counts on /regulations, /research, /market, /operations actual surfaces (not just per-domain table totals). Compare against pre-A1 snapshot if available, surface deltas. Closes risk #2 above.

2. **Operator browser-test /community for A3 verification.** Confirm author identity now renders Dietl/Rockit (orange) + owner + 6 sectors. Surface any rendering issue.

3. **24h ingestion monitoring on A2 commit 1.** Query at addd210 + 24h:
   ```sql
   SELECT id, format_type, signal_band, theme, last_regenerated_at
   FROM intelligence_items
   WHERE last_regenerated_at > '2026-05-25T18:00:00Z'
   ORDER BY last_regenerated_at DESC
   LIMIT 10;
   ```
   Verify signal_band populated for market_signal_brief, theme populated for research_summary, both NULL otherwise.

4. **Operator authorizes A4 OR A5 OR A6 start.** They're parallel-safe; pick by impact priority.
