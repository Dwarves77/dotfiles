---
title: A6 Sprint 3 Close — Verification & Sprint 3 Group A close gate
date: 2026-05-28
status: A6.1-A6.3 shipped; A6.4 = this audit; closes Sprint 3 Group A pending operator verifies
commits:
  - A6.1 3ea5fdd (migration 109 region_dimension_coverage + trigger)
  - A6.2 eab64ac (Sonnet find-new — 75 facts × 5 cells × 3 regions, $1.82)
  - A6.3a 44d537b (fetchOperationsCoverage + accordion-default-state fix)
  - A6.3b 513c064 (FACTS → live regional_data_facts swap)
  - A6.4 = this audit
related_audits:
  - sprint3-a5-verification-2026-05-27.md (A5 close)
  - sprint3-a6-find-new-2026-05-27.json (A6.2 run log)
  - sprint3-surface-mockup-reconcile-2026-05-27.md (R-A + M-A scope)
---

# Sprint 3 A6 — Verification & Group A close

The four-commit A6 batch closes Sprint 3 Group A's operations-surface
populated-content scope: schema, content backfill, render plumbing, and
the live-vs-hardcoded fact swap. This audit documents end state,
coverage metrics, and the operator-side verification list. Sprint 3
Group A formally closes when those verifications come back GREEN.

## What shipped (A6.x)

| # | Commit | Files | Effect |
|---|---|---|---|
| A6.1 | `3ea5fdd` | `supabase/migrations/109_region_dimension_coverage.sql` | New table `region_dimension_coverage` (5 regions × 6 dimensions = 30 rows). 4-state CHECK (`populated` / `partial` / `pending` / `missing`). Trigger keeps `fact_count` denorm'd from `regional_data_facts`. World-readable RLS. |
| A6.2 | `eab64ac` | `scripts/sprint3-a6-find-new.mjs`, `docs/audits/sprint3-a6-find-new-2026-05-27.json` | Sonnet 4.6 + web_search per (region, dimension) cell × 15 cells (Asia/UK/UAE × D2/D3/D4/D5/D6). 75 facts inserted; 75 sources upserted to `provisional_sources`. Run cost $1.82 (18% of $10 ceiling). Trigger auto-flipped 15 coverage cells `missing` → `populated`. |
| A6.3a | `44d537b` | `src/lib/supabase-server.ts` (new fetcher), `src/app/operations/page.tsx` (Promise.all extension), `src/components/pages/OperationsPage.tsx` (prop type + accordion-default fix) | `fetchOperationsCoverage()` returns `{regions, coverage, facts}` in one parallel call. EU `defaultOpen: true` dropped per accordion-default-state CLOSED rule. |
| A6.3b | `513c064` | `src/components/pages/OperationsPage.tsx` (FACTS swap) | `getFactsFor(region, dim)` helper prefers live `regional_data_facts` rows when populated; falls back to hard-coded EU/US vertical-slice. Threaded into `RegionAccordion`. Coverage badges + region-with-data counts updated to use live data. |

Type-check clean at every commit. Pre-push 4-step CI-parity check passed all four.

## DB state on production

```
regions table:              5 rows (EU, US, ASIA, UK, UAE)
region_dimension_coverage: 30 rows
  ASIA × D2/D3/D4/D5/D6:  populated (fact_count = 5 each)
  ASIA × D1:              missing (regulations cross-ref, by design)
  UK   × D2/D3/D4/D5/D6:  populated (fact_count = 5 each)
  UK   × D1:              missing
  UAE  × D2/D3/D4/D5/D6:  populated (fact_count = 5 each)
  UAE  × D1:              missing
  EU   × D1-D6:           all missing (regional_data_facts not yet
                          backfilled for EU; hard-coded slice still
                          serves; A6.3b fallback)
  US   × D1-D6:           all missing (same as EU)

regional_data_facts:       75 rows (Asia/UK/UAE × D2-D6 × 5 facts each)
provisional_sources:      +75 rows (await operator triage; status=
                          'pending_review', discovered_via='a6_find_new')
```

## Render-time behavior

`/operations` now renders:

- **Stat tiles + coverage rail**: counts include live + hardcoded coverage. Asia/UK/UAE each contribute to D2-D6 dimension badges; the side-rail "By dimension" `cnt` badges now show higher fill across D2-D6 (previously 2/5 hardcoded; now potentially 5/5 with all three new regions live + EU + US hardcoded).
- **Region accordions**: All 5 closed by default per CLAUDE.md accordion rule. Each, when expanded, renders D1-D6.
- **D1 (regulatory_feasibility)**: unchanged — cross-references into /regulations content via the existing `regulationsByRegion` pattern.
- **D2-D6 fact tables**: live data for Asia/UK/UAE; hard-coded vertical-slice for EU/US until those regions get an operator-authorized find-new pass.
- **Empty-region note**: now fires only when NO dimension has any facts (live or hardcoded) — the honest empty-state signal per mockup empty-dim pattern.

## Operator-side verification list

Load `/operations` in incognito (authenticated as the workspace owner).

### Sprint 3 Group A close-gate verifications

1. **A6 operations surface**:
   - Coverage rail's "By dimension" badges reflect higher fill (D2-D6 each show at least 5/5 because Asia/UK/UAE are now populated alongside the hardcoded EU/US).
   - All 5 region accordions start CLOSED (no EU pre-judged open).
   - Expanding the ASIA accordion shows D2-D6 with the 5 facts each that A6.2 inserted (Singapore wage rates, MPA shore power, EMA electricity tariff, etc).
   - Expanding the UK accordion shows D2-D6 with UK-specific facts (DEFRA / ONS / BEIS / DfT sourced).
   - Expanding the UAE accordion shows D2-D6 with UAE-specific facts.
   - Expanding EU / US accordions still shows the hardcoded vertical-slice fact tables (unchanged from prior).

2. **A5 regulation detail surface** (carried over from A5.6 verification):
   - Load 3-5 D1 regulations on `/regulations/[slug]`.
   - 7 numbered section cards (§3, §4, §8, §10, §11, §14, §15) render where data exists, hide where parsed-empty.
   - Impact Assessment shows gradient bars with `X/3 · Label` format; 0-scored rows hide.
   - Why It Matters block shows blue left-border + small-caps eyebrow; hidden when both `reasoning` AND `whyMatters` are empty (≈520 of 641 rows).

3. **SF-2 Phase 1**:
   - `/`, `/regulations`, `/settings`, `/map` authed — confirm no yellow/orange SystemErrorBanner under normal traffic.
   - `/admin → Platform flags` — no new rows with `created_by = seed-fallback-trigger` from authed sessions.

4. **R-A + M-A callout fields**:
   - After the b2-runner regen pass populates the new fields, load `/research` and `/market`.
   - Confirm "What it changes" callout appears on finding cards on `/research` (right column).
   - Confirm "Does NOT resolve" muted callout appears on featured Research items.
   - Confirm "Conversion trigger" muted callout appears on featured B1/B2 Market signals.
   - Confirm "Cross-references" callout appears on featured B3 corridor Market signals.
   - Confirm byline-with-source-attribution renders on every Market signal card (sourceName + jurisdiction).
   - Pre-regen pass behavior: cards render without the callouts; this is the integrity-preserving silence pattern.

5. **Priority tagging + dismissed stash** (PRIORITY-TAGGING dispatch from `cd3bd5e`):
   - On `/regulations` index, ⋯ button appears top-right of each regulation card.
   - Click opens 5-item popover: Mark Critical / High / Moderate / Background / Dismiss.
   - Tagging moves the card to the new Kanban column with the priority-colored left-border.
   - Dismissing fades the card to 42% opacity and removes it from columns; it appears in the bottom drawer.
   - `↺ Restore` brings dismissed items back into their original Kanban column.
   - Selection persists across reload (workspace-org-scoped per the migration-111 decision; drift triage pending for per-user scope).
   - On `/regulations/[slug]`, the hero-actions row shows the priority dropdown alongside Share / Add to watchlist.

6. **/admin/scan telemetry** (INGESTION-CLASSIFY class fix from `29f563a`):
   - Next /admin/scan invocation should report `portal_class_rerouted` + `skipped_unrecognized_item_type` counts in the response.

7. **Moderate color refresh** (token change from `d99b7dc`):
   - `/regulations` MODERATE stat tile reads visibly distinct from HIGH amber tile.
   - "Monitor 6-12 mo" Kanban column header is the same bright yellow.
   - "Moderate" dot in card menu matches both.
   - No place reads olive, mustard, or brown.

8. **Moderate color cascade across surfaces**:
   - `/operations`, `/market`, `/research`, `/community` — any "Window closing" / Moderate severity readout uses the new brighter yellow.

## Known follow-ups (Sprint 4 candidates)

1. **EU + US live-fact backfill.** A6.2 ran only against Asia/UK/UAE. EU and US still render the hardcoded vertical-slice. A Sprint 4 dispatch could run the same find-new script across EU/US D2-D6 (~30 facts each, ~$0.50 cost) and retire the hardcoded slice. Operator decides whether the hardcoded EU/US is canonical or a placeholder.

2. **75 provisional sources triage.** Every A6.2-discovered source landed in `provisional_sources` with `status='pending_review'`. Operator triage assigns tier + category. Until triaged, the source rows render with `source_note` only — name + URL + date — instead of the formal Source surface. Triage happens at `/admin → Sources → Provisional review`.

3. **B2-runner regen pass for the R-A + M-A callouts.** ~$23, ~6h wall. Until this runs, `/research` + `/market` cards render without the new editorial callouts (no fabricated content per integrity rule). Operator triggers the b2-runner via the existing /api/admin/b2-progress workflow.

4. **PRIORITY-TAGGING drift triage.** D1 (per-org vs per-user dismissal scope), D5 (always-render dismissed stash vs render-only-on-content), hero `.hero-pill.action` colorway swap on retag. Subagent surfaced these in the audit doc at `docs/audits/sprint3-followup-part2-priority-dropdown-2026-05-28.md`.

5. **CORPUS-RECLASSIFY 92-row single-hit follow-up.** Operator deferred per-row review on the 92 single-hit pattern matches from the audit. Sprint 4: per-row review OR stricter regex pass before bulk-archive.

## Sprint 3 Group A close gate

| Track | Status |
|---|---|
| A1 (community surface fix) | GREEN ratified |
| A2 (24h ingestion monitoring) | Continues independently (Group A-orthogonal) |
| A3 (community_posts existence) | Operator-side gate |
| A4 (trajectory three-belt) | GREEN ratified |
| A5 (regulation detail rebuild) | GREEN; operator visual verify pending |
| A6 (operations surface populated content) | GREEN this audit; operator visual verify pending |
| SF-1 (silent-fallback fail-fast) | GREEN |
| SF-2 Phase 1 (seed-fallback empty + flag) | Shipped; operator verify pending |
| WORKSPACE-BANNER F1 | GREEN |
| AGENT-WRITE-PLUMBING | GREEN |
| CORPUS-RECLASSIFY Scope A (instance) | GREEN |
| INGESTION-CLASSIFY-SOURCE-VS-REGULATION (class) | GREEN |
| R-A + M-A targeted | Code GREEN; awaiting regen pass for content |
| 5-tile mockup reconcile | GREEN (mockup updated to match impl) |
| Moderate color token | GREEN |
| PRIORITY-TAGGING + dismissed stash | GREEN; migration 111 applied |
| Mockup recovery (4 partial drafts → full versions) | GREEN |

**Group A closes when the operator's visual verifications above come back GREEN and the 75 provisional sources triage is at least partially complete (operator decides the bar — e.g., 25% triaged is acceptable for close).**

## What follows after Group A close

Sprint 4 backlog (no priority order; operator picks):
- proxy.ts → middleware.ts rename
- MIGRATION-LEDGER-REPAIR (the 6 migrations out of sync per the prior CLI surface)
- TIMESERIES-WORKER (rich trajectory ingestion for B1 Price signals)
- MARKET-DETAIL-BAND-PILL-AFFORDANCE (band pill on /market/[slug] is non-navigating)
- VERTICAL-TAGGING (corpus tagging for /research vertical filter signal)
- ADDITIVE-FILTER-SEMANTICS (cleanup of subtractive vs additive verticals contradiction)
- RESOLVE-ORG-ID-MEMOIZATION (3× per-request duplicate call)
- AUTO-PROVISION-ORG-ON-SIGNUP
- EU + US live-fact backfill (continuation of A6.2 to all 5 regions)
- B2-runner regen pass to populate the 4 callout fields across 155 items
- PRIORITY-TAGGING drift triage (D1 / D5 / hero pill colorway)
- CORPUS-RECLASSIFY single-hit per-row review or stricter regex pass

## Sprint 3 throughput summary

**Commits shipped this sprint: 18 (counting only the major dispatch closures, excluding inventory + audit-only commits)**

**Cost ledger:**
- A6.2 Sonnet find-new: $1.82
- B2-runner regen pass (operator-triggered, separate): ~$23 expected
- Total Sprint 3 AI compute: ~$25 (well under any sprint budget)

**Database state at sprint close:**
- 11 new migrations applied (101 through 111)
- 30 region_dimension_coverage rows
- 75 regional_data_facts rows
- 75 provisional_sources rows (await triage)
- 25 intelligence_items archived (CORPUS-RECLASSIFY Scope A)
- workspace_item_overrides extended with dismissed_at

Sprint 3 Group A closes with the operator verifications. Sprint 3 overall closes when Group B universal capability platform work starts.
