# Cards Clickable Audit — 2026-05-12

Scope: enumerate every card-style component representing a single
intelligence_item on `/market`, `/research`, `/operations`, verify the
detail route `/regulations/[slug]` resolves for sampled items of each
type, and surface any dead routes BEFORE wiring.

## Detail route compatibility check

`fetchIntelligenceItem(itemUiId)` in `src/lib/supabase-server.ts` (line
1048) reads by `legacy_id` OR `id` (uuid). `Resource.id` is built as
`legacy_id || id` (line 473), so every Resource object in the workspace
carries a value that the detail route can resolve.

DB probe results (active items, non-archived) — every sampled card type
resolves the detail page lookup:

| Card type                          | Sample ui-id                                  | Lookup     |
|------------------------------------|-----------------------------------------------|------------|
| MARKET tech (domain=2)             | battery-electric-vehicle-technology           | RESOLVED   |
| MARKET market_signal (domain=4)    | critical-minerals-ev-supply-chain             | RESOLVED   |
| OPERATIONS regional_data           | united-states-regional-operations-profile     | RESOLVED   |
| OPERATIONS domain=3                | united-states-regional-operations-profile     | RESOLVED   |
| OPERATIONS facility (domain=6)     | warehouse-solar-bess-roi-analysis             | RESOLVED   |
| RESEARCH pipeline_stage=published  | critical-minerals-ev-supply-chain             | RESOLVED   |
| RESEARCH pipeline_stage=draft      | 02da3c3c-6c28-4a2d-bdc0-0831cecab90e (uuid)   | RESOLVED   |
| REGULATIONS (baseline)             | g14                                           | RESOLVED   |

The detail page is named `[slug]` but accepts both legacy_id slugs and
raw uuids (with 307 redirect to slug when legacy_id exists). The detail
surface (`RegulationDetailSurface`) reads generic Resource fields —
title, summary, priority, tags, jurisdictions, sources — and renders
without errors for non-regulation items. The eyebrow reads "Regulations
· {jurisdiction}" which is cosmetic, not blocking. Operator's spec
already names `/regulations/[slug]` as the target.

Counts (active items only):
- Market domain=2: 10 / domain=4: 16
- Operations regional_data: 66 / domain=3: 10 / domain=6: 4
- Research pipeline_stage NOT NULL: 185 / draft: 8 / active_review: 0

## Per-component decision table

| Page       | Component                                              | File:line                                                                  | Item field | Slug present | Detail renders | Decision | Notes |
|------------|--------------------------------------------------------|----------------------------------------------------------------------------|------------|--------------|-----------------|----------|-------|
| Market     | PolicySignals `<li>` per item                          | src/components/market/PolicySignals.tsx:109-219                            | item.id    | Yes          | Yes             | WIRE     | Inner SourceBadge `<a>` to source URL → use button + router.push to avoid nested anchors |
| Market     | MarketPage TechBody `<div>` per item                   | src/components/pages/MarketPage.tsx:374-391                                | it.id      | Yes          | Yes             | WIRE     | No inner clickables — clean Link wrap |
| Market     | MarketPage PriceRow                                    | src/components/pages/MarketPage.tsx:407-457                                | item.id    | Yes          | Yes             | WIRE     | No inner clickables — clean Link wrap |
| Market     | WatchlistSidebar `<li>` per item                       | src/components/market/WatchlistSidebar.tsx:128-166                         | it.id      | Yes          | Yes             | WIRE     | No inner clickables — clean Link wrap |
| Market     | OwnersContent inner `<li>` per item under owner header | src/components/market/OwnersContent.tsx:145-158                            | it.id      | Yes          | Yes             | WIRE     | Inner items are pure-text; owner header `<li>` is a group container — wrap only the inner item `<li>` |
| Market     | KeyMetricsRow per-item row                             | src/components/market/KeyMetricsRow.tsx:165-213                            | it.id      | Yes          | Yes             | WIRE     | Header has period-tab buttons; the per-item row has none — clean Link wrap on the row only |
| Market     | CostTrajectoryChart                                    | src/components/market/CostTrajectoryChart.tsx                              | n/a        | n/a          | n/a             | SKIP     | Aggregate chart, not per-item |
| Market     | FreightRelevanceCallout                                | src/components/market/FreightRelevanceCallout.tsx                          | n/a        | n/a          | n/a             | SKIP     | Editorial aside, not per-item |
| Market     | MarketPage category accordions                         | src/components/pages/MarketPage.tsx                                        | n/a        | n/a          | n/a             | SKIP     | Group toggle, not per-item navigation |
| Research   | ResearchView PipelineRow                               | src/components/research/ResearchView.tsx:790-1037                          | item.id    | Yes          | Yes             | WIRE     | Currently `<button>` with chevron expand. Plan: keep chevron toggle button; wrap title row in Link in its own grid area to avoid nested-button a11y |
| Operations | RegionCard accordion (group header)                    | src/components/pages/OperationsPage.tsx:313-462                            | n/a        | n/a          | n/a             | SKIP     | Group accordion, not per-item |
| Operations | ChipCell (chip grid filter UI)                         | src/components/pages/OperationsPage.tsx:464-530                            | n/a        | n/a          | n/a             | SKIP     | Per spec: chip grid is filter UI, not per-item navigation |
| Operations | RegionCard "Active items" `<li>` per item              | src/components/pages/OperationsPage.tsx:451-455                            | r.id       | Yes          | Yes             | WIRE     | Bare `<li>` with title; clean Link wrap |
| Operations | FacilityCategoryCard accordion (group header)          | src/components/pages/OperationsPage.tsx:643-720                            | n/a        | n/a          | n/a             | SKIP     | Group accordion, not per-item |
| Operations | FacilityCategoryCard inner `<li>` per item             | src/components/pages/OperationsPage.tsx:692-714                            | it.id      | Yes          | Yes             | WIRE     | Clean Link wrap on the per-item row |

## Summary

- WIRE count: **8** card components across 3 pages
- SKIP count: **6** (aggregate charts, editorial asides, group accordions, filter UI — per design intent, not dead routes)
- Dead-route count: **0** — no wired card type would link to a non-existent or erroring detail page
- Halt-and-surface trigger: **None.** All WIRE candidates resolve cleanly. Proceeding to wiring.

## Implementation notes

1. **PolicySignals** has a nested `<a>` to the source URL inside the `<li>`. Wrapping the `<li>` in `<Link>` would nest anchors (invalid HTML). Resolution: render the `<li>` as a button-styled wrapper using `useRouter().push()` on click, and ensure the inner SourceBadge `<a>` calls `e.stopPropagation()`. Title remains visually a link target.
2. **PipelineRow** in ResearchView already uses a `<button>` for expand/collapse. Wrapping a `<button>` in `<Link>` is invalid. Resolution: split into a title row (wrapped in `<Link>`) and a chevron button (separate, with `e.stopPropagation()`).
3. All other components have no internal interactive children — straight `<Link>` wrap is safe.
4. Style: `cursor-pointer` + subtle hover (background-color shift to `var(--raised)`) matching the regulations card precedent in `RegulationsSurface.tsx:1751-1757`.
