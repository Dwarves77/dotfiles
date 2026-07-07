# Spec audit: Market Intel built vs caros-ledge-platform-intent spec

Date: 2026-05-23
Branch: chore/spec-audit-market
Audit scope: customer-facing `/market` surface against `fsi-app/.claude/skills/caros-ledge-platform-intent/SKILL.md` Market Intel section and companion skill sections in `environmental-policy-and-innovation` and `source-credibility-model`.
Mode: READ-ONLY gap report. No code change, no rebuild prescription. Operator scopes rebuild.

---

## Section 1: Spec excerpt (verbatim)

### caros-ledge-platform-intent SKILL.md, MARKET INTEL section (lines 57-65)

> ### MARKET INTEL
>
> **Scope.** Industry signals and what the industry is doing. Corporate announcements (vendor claims, capital flows, technology deployment signals, supplier shifts, capacity changes), commercial research output (BloombergNEF, MSCI, Moody's, Workiva, S&P Global Sustainable1), cross-cutting sustainability trade press (ESG Today, Bloomberg Green, Carbon Pulse, FT Moral Money, Reuters Sustainable Switch), carbon market intelligence, fuel pricing signals, predictive timing on market movements.
>
> Cross-references Regulations to surface signals like "regulatory deadline approaching," but the deadline content itself lives in Regulations. Example: BYD announcing a battery advancement is Market Intel. The CBAM 2026 enforcement deadline is Regulations; Market Intel may surface a "CBAM enforcement window closing" signal that links back to the Regulations entry.
>
> **Source category mapping.** `market_signal`, `initiative` (Market Signal Brief format) plus corporate-press records.
>
> **Current state.** Broken. Alerts SideCard is non-interactive (OBS-18), EmptyState exposes worker-language to end users (OBS-20), taxonomy bleed because `/market` and `/operations` share the same unfiltered payload (per alignment audit Section B), no real signal aggregation engine running.

### caros-ledge-platform-intent SKILL.md Customer-Facing Value Gap, Market Intel (lines 206-207)

> 2. **Market Intel feature build.** Signal aggregation, predictive timing, source-registry expansion, alerts wiring (close OBS-18), EmptyState workspace-anchored rewrite (close OBS-20), taxonomy bleed cleanup.

### caros-ledge-platform-intent SKILL.md, Anti-Patterns, applicable to Market Intel (lines 321-322)

> - **Allowing phase-language ("Coming soon, Phase D", "Phase N", etc.) to leak into customer-facing UI.**
> - **Page scope drift across the four-category source taxonomy.** Examples: putting regulatory deadlines in Market Intel scope when they belong in Regulations; treating Research as academic-only when it includes industry analytical press; under-scoping Operations...

### environmental-policy-and-innovation SKILL.md, Market Signal Brief, 8-section format (lines 411-446)

> For: market_signal, initiative
>
> The reader question: what is moving in the industry that could give me or my competitors an edge, and what should I do while it is still a signal?
>
> ### Section 1: What's Moving and What Triggered It
> ### Section 2: Who's Driving It and What They Want
> ### Section 3: Expected Trajectory and Conversion Triggers
> ### Section 4: Operational and Cost Implications If It Materializes
> ### Section 5: Competitive Implications
> ### Section 6: Client Conversation Talking Points
> ### Section 7: What the Workspace Should Do Now
> ### Section 8: Sources

The Market Signal Brief is workspace-anchored, severity-labeled (ACTION REQUIRED / COST ALERT / WINDOW CLOSING / COMPETITIVE EDGE / MONITORING), cause-and-effect-chained, filtered by transport mode and cargo vertical.

### environmental-policy-and-innovation, Business Evaluation Framework (lines 133-150) and Cross-Format Lens Requirement (lines 110-117)

Four-lens requirement on every brief: substantive content, competitive lens, client-conversation lens, action lens. Cost increase seen early equals margin protection. Impact filtering: every regulation's impact depends on route, transport mode, cargo vertical.

### source-credibility-model SKILL.md, Section 8 customer-facing signal sets (lines 295-303)

> | Surface | Primary credibility signals |
> |---|---|
> | Market Intel | tier + recency + signal-strength |

The signal vocabulary expectation per Section 8: tier badge consistent across surfaces, recency renders consistently, signal-strength is the third primary credibility signal Market Intel must foreground.

### environmental-policy-and-innovation Section 3 (Cross-Skill Scope) and Operational Scenario Tag glossary

The skill establishes that Market Intel maps to `market_signal` and `initiative` item_types (line 194), formatted as Market Signal Brief (8 sections), and that intersection detection joins items by shared operational_scenario_tag + compliance_object_tag (lines 569-577). The implied data shape per Market Intel item is multi-tag scenario + compliance overlap, route slicing via `transport_modes`, sector slicing via cargo verticals.

---

## Section 2: Current built reality

### Server entry: `fsi-app/src/app/market/page.tsx`

- Line 15-18: `MARKET_SCOPE = { item_types: ["technology", "innovation", "market_signal"], domains: [2, 4] }`. The page-scope union deliberately reaches across two item-type buckets (tech and market signal) plus two domain codes (2 = tech, 4 = market). This scope is wider than the spec's `market_signal` + `initiative` scope.
- Line 36-40: parallel fetch of `getMarketIntelItems()` (category-routed RPC), `getResourcesOnly()` (unfiltered slim fallback), and `getScopedWorkspaceAggregates` (workspace counts).
- Line 44-46: fallback logic — if the category-routed call returns no rows, the page renders `getResourcesOnly()` rows, which is the same unfiltered payload `/operations` consumed before category routing wired. The fallback re-introduces taxonomy bleed on anon / misconfigured paths.
- Line 59: per-source citation stats fetched via `getSourceCitationStats`.

### Data layer: `fsi-app/src/lib/data.ts:632-648` and `fsi-app/src/lib/supabase-server.ts:1076-1081`

- `data.ts:640` `getMarketIntelItems` wraps `cachedMarketIntel(orgId)` which calls `fetchMarketIntelItems`.
- `supabase-server.ts:1077-1081` `fetchMarketIntelItems` calls `runCategoryRpc(orgId, "get_market_intel_items")`.
- `supabase-server.ts:1005-1074` `runCategoryRpc` calls the RPC, projects each row through `rpcRowToResource` (line 970-995), and returns `{ resources, total }`. Per the comment at line 951-956, after migration 084 the RPC trusts the canonical `sources.category` column.
- `rpcRowToResource` (line 970-995) maps DB columns into the generic `Resource` shape used across all four intelligence pages. There is no Market-Signal-Brief-specific projection. The Resource type (line 92-202 of `src/types/resource.ts`) is heavily regulation-oriented: `complianceDeadline`, `enforcementBody`, `penaltyRange`, `legalInstrument`, `regulatoryConflict`. The market-specific block is the seven-field `marketData` sub-object (line 162-168): `currentPrice`, `previousPrice`, `priceSource`, `priceDate`, `freightCostImpact`. No fields for trajectory, conversion triggers, competitor positioning, talking points, scenario tags, or compliance-object tags.

### Page render: `fsi-app/src/components/pages/MarketPage.tsx`

The customer-visible chrome (cited line by line):

- Line 212: `EditorialMasthead title="Market Intelligence"` with a workspace-aggregate meta line ("N items in scope · M jurisdictions in scope").
- Line 216-220: `Legend` + `StatStrip` of four lifecycle tiles labelled `Watch / Elevated / Stable / Informational` (LIFECYCLE constant line 107-112; legend at line 90-95).
- Line 225-228: `AiPromptBar` placeholder `Ask anything about market intel — e.g. What's the cost outlook for SAF fuel?`. Chips at line 97: `["SAF cost outlook", "Carbon pricing on ocean freight", "Diesel forward curve"]`.
- Line 230-233: two tabs:
  - `Technology Readiness` (line 231)
  - `Price Signals & Trade` (line 232)

The tech tab is default (line 129). The tab keys are `tech` and `prices` (line 88).

Inside the `Technology Readiness` tab (lines 235-249):

- Heading: `Energy & Technology Innovation` (line 238)
- Subhead: `Category-level tracking across transport energy and technology. Cost curves, deployment status, and policy signals.` (line 239)
- Main column structure per `SectionTemplate` (line 276-425):
  - `PolicySignals` (line 331). Labelled `POLICY ACCELERATION SIGNALS` (PolicySignals.tsx:139). Filters items by priority CRITICAL or HIGH within last 90 days, plus a vendor-resource heuristic (PolicySignals.tsx:53-99) excluding tool/tracker/news/journal/industry types unless they contain quantitative-signal language.
  - `FreightRelevanceCallout` (line 332-336). Yellow callout. Tech-section copy at FreightRelevanceCallout.tsx:48 reads `Technology readiness shifts on the air-freight side (SAF feedstocks, hydrogen propulsion ground equipment, on-aircraft sensor suites) and on the ocean-freight side ...`
  - `KeyMetricsRow` (line 340). Renders only items with `marketData.currentPrice`; otherwise emits a single banner `Quantitative metrics not yet available for this section. Items in scope have lifecycle and source attribution; numeric deltas (current vs prior period) will appear here as market data is added.` (KeyMetricsRow.tsx:92-108).
  - `Categories` accordion header (line 366) and accordion list grouped by `Resource.topic || Resource.sub || fallback` (groupByCategory line 950-979).
  - Per-row body in tech tab is `TechBody` (line 429-477): card per item with title, lifecycle pill (Watch / Elevated / Stable / Informational), optional note, optional citation count chip + recency chip.

The page's framing of "Technology Readiness Level" is implicit in the methodology side card copy at MarketPage.tsx:418:

> "TRL bands per IEA. Lifecycle labels mapped from priority tier — Watch (critical), Elevated (high), Stable (moderate), Informational (low). Sources updated daily, weekly, or quarterly as marked."

The TRL framing is the methodology disclosure for the tech tab. Items are not grouped by TRL band per se; they are grouped by `topic` field (e.g. `battery`, `hydrogen`, `SAF`), and each item carries a lifecycle pill derived from priority, but the methodology citation declares TRL as the conceptual frame.

Inside the `Price Signals & Trade` tab (lines 250-265):

- Heading: `Geopolitical & Market Signals` (line 253)
- Subhead: `Commodity prices, carbon markets, trade restrictions, critical minerals, and shipping chokepoint monitoring.` (line 254)
- Same `SectionTemplate` shell. `PolicySignals` + `FreightRelevanceCallout` + `KeyMetricsRow` + category accordions. `PriceBody` (line 479-556) renders each item with title, lifecycle pill, optional `Why this matters to your business` insert from `item.whyMatters || item.note`, optional chips.

Right rail (line 389-422) shared by both tabs:

- `WatchlistSidebar` (line 390). Labelled `Highest-priority indicators` (WatchlistSidebar.tsx:101). Sorts items by priority then recency, takes top 6.
- `OwnersContent` (line 391). Returns null when no item has `actionOwner` populated (OwnersContent.tsx:63). Per the comment at OwnersContent.tsx:5-21 the data does not exist on the seed payload or in intelligence_items, so the rail is hidden by default.
- `AlertsSideCard` (line 401-407) when watch+elevated > 0, else `SideCard` "No threshold-breach items active" (line 409-413). The interactive alerts card was added in Build 7 to close OBS-18.
- `SideCard` "Methodology" (line 415-421) with the TRL-bands copy quoted above.

EmptyState (line 814-829, copy in `emptyStateTitle` / `emptyStateBody` line 854-871) workspace-anchored after Build 7 OBS-20 rewrite: `No technology readiness items scoped for [sectors]` / `No market signals scoped for [sectors]`.

### Headers and labels the customer sees verbatim

| Surface element | Customer-visible copy | File:Line |
|---|---|---|
| Page title | `Market Intelligence` | MarketPage.tsx:212 |
| Tab 1 | `Technology Readiness` | MarketPage.tsx:231 |
| Tab 2 | `Price Signals & Trade` | MarketPage.tsx:232 |
| Tab 1 heading | `Energy & Technology Innovation` | MarketPage.tsx:238 |
| Tab 2 heading | `Geopolitical & Market Signals` | MarketPage.tsx:253 |
| Section 1 label (both tabs) | `POLICY ACCELERATION SIGNALS` | PolicySignals.tsx:139 |
| Yellow callout label | `FREIGHT FORWARDING RELEVANCE` | FreightRelevanceCallout.tsx:99 |
| Metrics label | `KEY METRICS` | KeyMetricsRow.tsx:87 |
| Accordion section | `Categories` | MarketPage.tsx:366 |
| Right rail card 1 | `Highest-priority indicators` | WatchlistSidebar.tsx:101 |
| Right rail alerts | `Watch this week` (with `N alerts` + click-to-filter) | MarketPage.tsx:926 |
| Methodology disclosure | `TRL bands per IEA. Lifecycle labels mapped from priority tier` | MarketPage.tsx:418 |
| Lifecycle pills | `Watch / Elevated / Stable / Informational` | MarketPage.tsx:107-112 |
| Empty state title | `No technology readiness items scoped for [sectors]` | MarketPage.tsx:854-858 |

---

## Section 3: Line-cited gap analysis

### Status legend
- **PRESENT**: spec requires it; build has it; framing matches
- **MISSING**: spec requires it; build does not have it
- **MIS-FRAMED**: build has something near it, but the framing diverges from spec
- **UNAUTHORIZED**: build has it; spec does not call for it (potential drift / scope creep)

### Gap table

| Spec requirement | Status | Citation in build | Notes |
|---|---|---|---|
| Industry signals = corporate announcements, vendor claims, capital flows, technology deployment signals, supplier shifts, capacity changes (SKILL.md:59) | MIS-FRAMED | MarketPage.tsx:238 heading `Energy & Technology Innovation`, MarketPage.tsx:418 methodology says `TRL bands per IEA`. Tech tab groups items by `topic` (battery / SAF / hydrogen) and labels them by TRL/lifecycle, not by vendor activity, supplier shift, or capacity change. | The build assumes the customer wants to understand which technologies are advancing the IEA TRL ladder. The spec assumes the customer wants to know what specific industry actors are doing right now. The transformation from "BYD announced X capacity" to "battery has Watch-level lifecycle" loses the actor, the action, the timing, and the implication. |
| Commercial research output (BloombergNEF, MSCI, Moody's, Workiva, S&P Global Sustainable1) (SKILL.md:59) | MISSING | No source-registry coverage cited. Build comment at supabase-server.ts:932-940 lists `trade press` sources excluded (FreightWaves, Loadstar, GreenBiz, etc — routed to Research). No mention anywhere of the commercial-research outlets the spec names. | The commercial-research providers named in the spec are absent from both the routing exception lists and the inferred source registry. The build's category-routed RPC trusts `sources.category` (supabase-server.ts:951-956), so this gap is upstream in source registration, not in routing logic. |
| Cross-cutting sustainability trade press (ESG Today, Bloomberg Green, Carbon Pulse, FT Moral Money, Reuters Sustainable Switch) (SKILL.md:59) | MISSING | Same comment block at supabase-server.ts:932-940 names the analytical trade press routed AWAY from Market Intel to Research. The Reuters Sustainable Switch newsletter is explicitly identified in env-policy SKILL.md as Market Intel scope (distinct from Reuters Sustainable Business which is Research). The build does not affirmatively list the spec-named trade press as Market Intel surfaces. | The build's routing logic exists but the source rows it routes do not include the spec's named cross-cutting trade press. Net effect: Market Intel ingests whatever happens to carry `sources.category = 'market_news'` regardless of whether it matches the spec's named source set. |
| Carbon market intelligence (SKILL.md:59) | MIS-FRAMED | Implicit via items tagged `carbon` or `ETS`. KEY METRICS row can render `marketData.currentPrice` for carbon allowances. The Price Signals tab subhead mentions `carbon markets` (MarketPage.tsx:254). | Build surfaces carbon-pricing items as generic items with optional single-point price. No spread / allowance trajectory / market-mover commentary. The reader does not get "EU ETS allowance moved from €68 to €75 last week; here is what that does to your ocean lane surcharge over the next 90 days." |
| Fuel pricing signals (SKILL.md:59) | MIS-FRAMED | `marketData.currentPrice` field exists (resource.ts:163). Per KeyMetricsRow.tsx comment at line 16-19 the seed data has zero rows populating this. | The data shape supports one snapshot price; the spec calls for SAF / diesel / bunker fuel signals as a continuous stream the customer reads to model margin. The build has the wireframe but the underlying signal aggregation is absent. |
| Predictive timing on market movements (SKILL.md:59) | MISSING | No predictive component. Nothing on the page projects a future conversion trigger or expected timeline. | The Market Signal Brief Section 3 (env-policy SKILL.md:424) calls for `Expected Trajectory and Conversion Triggers`. No equivalent surface in the build. |
| Cross-references Regulations to surface signals like "regulatory deadline approaching" with link back to Regulations entry (SKILL.md:61) | MISSING | All cards link `href="/regulations/[id]"` (MarketPage.tsx:443, 495, etc). This is a detail-page link, not a cross-reference highlighting an approaching deadline. PolicySignals shows a date on the badge row, not a countdown or "window closing" framing. | The build conflates "click to see the source regulation detail" with "the spec wants Market Intel to surface a derived signal that joins regulatory timing to market consequence." The intersection layer (env-policy SKILL.md:551-627) is the architectural mechanism for this; it is not consumed by the Market page. |
| Source category mapping: `market_signal`, `initiative` (Market Signal Brief format) plus corporate-press records (SKILL.md:63, env-policy SKILL.md:194) | PARTIAL | data.ts:640 + supabase-server.ts:1077-1081 route on `sources.category` per migration 084. MARKET_SCOPE at page.tsx:15-18 includes `["technology", "innovation", "market_signal"]` plus `domains: [2, 4]`. | The build's scope is wider than the spec, by including `technology` and `innovation` item types (which env-policy SKILL.md:194 maps to Technology Profile, not Market Signal Brief). This is a partial mis-routing of the four-category source taxonomy: tech items belong on a Tech Profile rendering, not glued to a Market Intel page. |
| Market Signal Brief format (8 sections) per env-policy SKILL.md:411-446 | MISSING | The card preview shows title + note + optional `whyMatters` (PriceBody, MarketPage.tsx:489-556). The detail page (`/regulations/[id]`) is the same regulatory-fact-document detail render. There is no surface that produces an 8-section Market Signal Brief. | The Resource type has no fields for Section 2 (Who's Driving It), Section 3 (Conversion Triggers), Section 5 (Competitive Implications), Section 6 (Talking Points), Section 7 (Workspace Should Do Now). The whole format is absent. |
| Severity labels (ACTION REQUIRED / COST ALERT / WINDOW CLOSING / COMPETITIVE EDGE / MONITORING) per env-policy SKILL.md:154-161 | MIS-FRAMED | Lifecycle labels at MarketPage.tsx:107-112: `Watch / Elevated / Stable / Informational` derived from `priority` enum CRITICAL / HIGH / MODERATE / LOW. | The build's vocabulary is one level removed from the spec's severity labels. `Watch` (built) ≠ `ACTION REQUIRED` (spec) ≠ `COST ALERT` (spec) ≠ `WINDOW CLOSING` (spec). The five-label severity vocabulary that drives the spec's business-evaluation framework cannot be reverse-engineered from the four-tier lifecycle. |
| Workspace-anchored output (env-policy SKILL.md:82-96) | PARTIAL | EmptyState rewritten Build 7 to be workspace-anchored (MarketPage.tsx:854-871). FreightRelevanceCallout copy is sector-aware (FreightRelevanceCallout.tsx:64-67). | The card-level content (title, note, whyMatters) is regulation-style text, not anchored to the workspace's role / cargo verticals / transport modes / trade lanes. The cause-and-effect chain by vertical (env-policy SKILL.md:170-180) is not produced. |
| Four-lens requirement: substantive + competitive + client-conversation + action (env-policy SKILL.md:110-117) | MISSING | The build delivers the substantive lens only. FreightRelevanceCallout is editorial framing, not competitive positioning. There is no `What competitors are doing` section, no `Client talking points` section, no `What the workspace should do now` section. | Cross-Format Lens Requirement applies to every brief in env-policy. Market Intel cards do not serve three of the four lenses. |
| Tier + recency + signal-strength credibility signals (source-credibility-model SKILL.md:300) | PARTIAL | Tier rendered via `SourceBadge` in PolicySignals (PolicySignals.tsx:311-371) and tier label map at line 33-41. Recency rendered via `RecencyChip` mounted in PolicySignals, KeyMetricsRow, WatchlistSidebar, and per-card body (MarketPage.tsx:467, 550). `signal-strength` is absent. | No surface or data field foregrounds signal-strength. The closest analog is the `priority` enum, but the spec separates signal-strength from priority (signal-strength is about credibility of the signal's underlying source convergence; priority is about decision urgency). |
| Intersection detection (env-policy SKILL.md:551-627) consumed on the page | MISSING | No reference to `related_items`, `intersection_summary`, `operational_scenario_tags`, or `compliance_object_tags` in MarketPage.tsx or any market component. | The intersection layer is the platform's headline capability for non-obvious cross-coupling between regulations and market signals. Market Intel is the natural surface for "EU ETS allowance price moved + ReFuelEU enforcement deadline + your ocean lane fuel mix" intersections; none of this is wired. |
| Page-scope drift prohibition (SKILL.md:322 anti-pattern) | MIS-FRAMED | MARKET_SCOPE at page.tsx:15-18 includes `technology` + `innovation` item types and domains `[2, 4]`. Tech tab heading at line 238 is `Energy & Technology Innovation`. | Tech items belong in Technology Profile format per env-policy SKILL.md:194. The build conflates technology profile content (which has its own 8-section spec at env-policy SKILL.md:325-364) with market-signal content. This is exactly the page-scope drift the SKILL.md anti-pattern warns about: "putting [content] in Market Intel scope when they belong in [their own surface]." |
| Phase language anti-pattern compliance (SKILL.md:321) | PRESENT | Build 7 closed the phase-language leaks. WatchlistSidebar renamed `Highest-priority indicators` (WatchlistSidebar.tsx:101). EmptyState rewritten (MarketPage.tsx:854-871). CostTrajectoryChart removed. KeyMetricsRow period selector removed. OwnersContent returns null when empty. | Build 7 closures are spec-aligned and should be preserved through any rebuild. |
| Alerts wiring (OBS-18 closure) | PRESENT | AlertsSideCard (MarketPage.tsx:878-946) is interactive: aria-pressed toggle, click filters to CRITICAL items, second click clears. | Build 7 OBS-18 closure landed. The mechanism (a click-through to a CRITICAL filter) is correct as a chrome affordance, though the underlying definition of CRITICAL on Market Intel is still tied to the regulation-derived priority enum. |
| Fallback to unfiltered slim payload when category-routed call returns empty (page.tsx:44-46) | UNAUTHORIZED (potential) | When `marketIntel.resources.length` is zero, the page renders `fallback.resources` which is the same unfiltered payload `/operations` historically shared. | The fallback re-introduces the taxonomy-bleed failure mode the spec called out (SKILL.md:65 `taxonomy bleed because /market and /operations share the same unfiltered payload`). On anon or misconfigured paths the customer gets the pre-Sprint-2 broken-state experience. |
| `getResourcesOnly()` always fetched in parallel (page.tsx:36-40) | UNAUTHORIZED (potential) | Even when the category-routed payload has rows, the unfiltered slim is also fetched. | Wasted RPC plus the same fallback-reintroduction risk if the conditional at line 44 inverts. Minor performance gap, more meaningful integrity gap. |

### Coverage of the four named customer questions

The framing operator gave names four questions the freight forwarder asks at `/market`. Per-question coverage:

**Q1: "What's happening in my routes that affects my margins?"**

Built? NO. The page has no route-anchored filtering and no margin-impact framing. Items carry `modes` (transport mode strings) and `jurisdiction` (single string per item; the legacy `jurisdiction` field is documented as deprecated in favor of `jurisdictionIso`, resource.ts:131-133). No "your routes" filter exists. Margin impact is reduced to a generic `whyMatters` paragraph (PriceBody, MarketPage.tsx:521-547) authored at brief-generation time, not synthesized against the customer's lane profile.

**Q2: "Is SAF pricing going to break my air-freight cost model?"**

Built? PARTIALLY VISIBLE, NOT ANSWERED. The AiPromptBar chip "SAF cost outlook" (MarketPage.tsx:97) hints the customer should ask the Assistant. The FreightRelevanceCallout default tech copy at FreightRelevanceCallout.tsx:48 mentions SAF feedstocks generically. No SAF price card, no forward curve, no cost-model integration. The customer must take the question to the Assistant; the page itself does not surface the answer.

**Q3: "Are ocean rates moving on the Strait of Hormuz?"**

Built? NO. No chokepoint-anchored data. The Price Signals tab subhead mentions `shipping chokepoint monitoring` (MarketPage.tsx:254) but no chokepoint signal aggregation exists. No data field captures chokepoint geography (lat/lon, strait name, region risk index). The Map cross-cutting capability is for Regulations content only (caros-ledge-platform-intent SKILL.md:143-152), not Market Intel.

**Q4: "What technology shifts threaten or help my business?"**

Built? PARTIALLY. The tech tab surfaces technology items grouped by topic, with lifecycle pills, but framed as TRL/IEA-readiness signals (MarketPage.tsx:418), not as competitive-threat signals. The four-lens requirement (env-policy SKILL.md:110-117) demands `competitive lens` content; the build delivers a generic editorial callout (FreightRelevanceCallout) instead of named-competitor positioning per item. Closest the build comes to answering is the FreightRelevanceCallout copy, which is editorial sector-aware narrative, not item-specific competitive positioning.

Summary: zero of the four named customer questions are fully answered by the current page. Q4 is most-served (around 30 percent). Q1, Q2, Q3 are at or near zero.

---

## Section 4: Missing data shapes

The current Resource type (`fsi-app/src/types/resource.ts`) is regulation-centric. The Market Intel surface borrows that shape with a thin `marketData` sub-object (7 fields, line 162-168), and surfaces all items through the same `/regulations/[id]` detail page. The data shapes the spec implies but the current data layer does not produce:

1. **Market Signal Brief 8-section structure as a stored artifact.** No `market_signal_brief_full` field, no per-section JSON, no surface that consumes Section 3 (Conversion Triggers), Section 5 (Competitive Implications), Section 6 (Client Talking Points), or Section 7 (Workspace Should Do Now) separately from Section 1 (What's Moving) and Section 8 (Sources). The detail page does not differentiate by `format_type`.

2. **Severity label as a first-class field.** `priority` enum CRITICAL / HIGH / MODERATE / LOW exists. The spec's five severity labels (ACTION REQUIRED / COST ALERT / WINDOW CLOSING / COMPETITIVE EDGE / MONITORING) are mapped lossy onto priority per the locked map in env-policy SKILL.md:774-780 (severity_to_priority). The reverse direction (priority → severity) is not unambiguous; the original severity is lost or inferable only from text. UI consumes priority, not severity. Customer never sees `COST ALERT` or `WINDOW CLOSING` as labels.

3. **Operational scenario tags + compliance object tags.** Env-policy SKILL.md:509-549 names two tag vocabularies (around 36 open-vocabulary scenarios + 18 closed-vocabulary roles) that drive intersection detection. No reference to these tags in the Market page render layer. The Resource type has no `operationalScenarioTags` or `complianceObjectTags`. The intersection data must exist in the DB (per migration history) but is not consumed.

4. **Route-anchored signal filtering.** `transport_modes` array exists per row, but there is no UI filter for "show me Market Intel items affecting my air-EU-Asia lanes." Workspace profile defines lanes; page does not project them.

5. **Cargo-vertical anchored signal filtering.** Sector profile flows from `useWorkspaceStore` (MarketPage.tsx:144) but only to the FreightRelevanceCallout copy tail and the EmptyState helper text. No item-level vertical filter or vertical-impact projection.

6. **Comparative trends / direction / magnitude vs prior period.** `marketData.previousPrice` is one field for one snapshot. Per the KeyMetricsRow.tsx:16-19 comment, seed data populates zero rows. No time-series schema, no rolling average, no momentum indicator, no comparison-vs-90-day-average. The CostTrajectoryChart placeholder was removed in Build 7 (commit da608f3) precisely because the underlying time-series schema decision was not made.

7. **Cost-model integration / margin pass-through math.** `marketData.freightCostImpact` is a free-text field (resource.ts:167). No quantitative join from a signal (e.g. EU ETS allowance price = €X) to a calculated impact on the customer's cost model (e.g. "+$Y per TEU on your EU-North-Atlantic ocean exposure"). The customer is told a price moved; they do their own math.

8. **Vendor + supplier movement as a first-class data type.** Spec says corporate announcements (vendor claims, capital flows, supplier shifts, capacity changes) are explicit Market Intel content. No `vendor` table, no `corporate_announcement` row type, no `supplier_movement_signal` view. The closest analog is the `industry` source_role which the build's PolicySignals filter explicitly DEMOTES via the vendor-resource exclusion at PolicySignals.tsx:53-99.

9. **Signal-strength field (source-credibility-model Q9).** Section 8 of the credibility skill names `signal-strength` as the third Market Intel credibility signal. No field on the source or item carries signal-strength. Tier and recency are wired; signal-strength is missing.

10. **Conversion triggers / expected timeline / "what would convert this from signal to active rule."** Env-policy Market Signal Brief Section 3 calls for `Expected Trajectory and Conversion Triggers`. No data shape captures `expected_trigger_event` or `expected_trigger_date_window`. The closest is regulation's `complianceDeadline` (resource.ts:156), which is regulation-bound not signal-bound.

11. **Cross-reference linking to Regulations entries (the "CBAM enforcement window closing" pattern).** No `cross_reference_regulation_id` or "this signal relates to that regulation" join. The intersection layer (`related_items`, `intersection_summary`) exists in env-policy spec and migration history but is not consumed by Market Intel UI.

12. **Source category coverage for the spec-named publishers.** No registered sources for BloombergNEF, MSCI, Moody's, Workiva, S&P Global Sustainable1, ESG Today, Bloomberg Green, Carbon Pulse, FT Moral Money, Reuters Sustainable Switch. The `sources.category` routing assumes these rows exist; without them, Market Intel ingests whatever happens to share `sources.category = 'market_news'` regardless of fit.

---

## Section 5: Questions for the operator before rebuild

1. **What is the Market Intel detail-page format?** Today every Market card links to `/regulations/[id]` (MarketPage.tsx:443, 495). The spec calls for Market Signal Brief (8 sections) per env-policy SKILL.md:411-446, which is a different shape from Regulatory Fact Document (14 sections). Does the rebuild ship `/market/[id]` as a new route with a Market Signal Brief renderer, or does the detail page polymorphically branch on `format_type`?

2. **Tech items: stay on Market Intel, or move?** MARKET_SCOPE at page.tsx:15-18 includes `technology` and `innovation` item types. Per env-policy SKILL.md:194 these map to Technology Profile (8 sections), not Market Signal Brief. Is the rebuild scoping (a) Market Intel as `market_signal` + `initiative` ONLY with tech items relocating to a Technology surface; (b) Market Intel as a wider container with tech profiles co-tenanting; (c) tech items absorbed into Operations as the place customers reason about regional tech feasibility; or (d) something else?

3. **Severity labels: surface the spec's five-label vocabulary, or keep the four-tier lifecycle?** The build maps the spec's `ACTION REQUIRED / COST ALERT / WINDOW CLOSING / COMPETITIVE EDGE / MONITORING` lossy onto `CRITICAL / HIGH / MODERATE / LOW` and renders as `Watch / Elevated / Stable / Informational`. The spec's severity vocabulary is decision-pressure-coded; the build's is tier-coded. Rebuild authorizes which vocabulary the customer sees?

4. **Cross-reference linking pattern: how aggressive?** Spec example: "CBAM enforcement window closing" surfacing on Market Intel linking back to the Regulations entry. Is this a manual editorial pickup, an intersection-detection-driven auto-generated card, or a third pattern? This drives whether the rebuild needs (a) `signal → regulation` join schema, (b) intersection-detection wiring into the Market page, or (c) both.

5. **Predictive timing scope.** Spec calls for "predictive timing on market movements" (SKILL.md:59) and "Expected Trajectory and Conversion Triggers" (env-policy SKILL.md:424). Predictive in what sense? Editorial expert judgment captured in the brief, deterministic forward-curve data from commercial price providers, or LLM-extrapolated trajectory? Rebuild scope and cost vary by an order of magnitude across these options.

6. **Source registry expansion for commercial-research and trade-press names.** Spec names BloombergNEF / MSCI / Moody's / Workiva / S&P Global Sustainable1 / ESG Today / Bloomberg Green / Carbon Pulse / FT Moral Money / Reuters Sustainable Switch. Most are subscription-gated. Rebuild needs an explicit answer on which the platform pays for, which it tracks via free-tier / RSS, and which are surface placeholders with operator-uploaded brief content.

7. **Route + cargo-vertical filtering UX.** Workspace profile carries `sector_profile` and (implied) transport modes and trade lanes. The page consumes sector_profile only for editorial-callout flavor text. Does the rebuild ship per-customer route/vertical filter chips at the page level, or stay with "the data feed is already workspace-scoped per RPC, customer relies on that"? The four named customer questions (Q1 routes, Q2 air freight cost model, Q3 specific chokepoint, Q4 tech-vs-business) all imply chip-level filtering, not just feed-level scoping.

---

## Audit caveats

- **Build 7 closures should be preserved.** OBS-18 alerts wiring (MarketPage.tsx:878-946), OBS-20 workspace-anchored EmptyState (MarketPage.tsx:854-871), WatchlistSidebar honest-rename (WatchlistSidebar.tsx:101), CostTrajectoryChart removal, KeyMetricsRow period selector removal, OwnersContent null-when-empty (OwnersContent.tsx:63) all close spec anti-patterns and should survive a rebuild.

- **Category routing wiring (Sprint 2 Build 4) is correct.** The `runCategoryRpc` mechanism (supabase-server.ts:1005-1074) trusting `sources.category` (post-migration 084) is spec-aligned. The architectural foundation for Market Intel routing is in place. The gap is upstream (which sources are registered, what items they produce) and downstream (how the page renders them), not in the routing layer itself.

- **Q9 chip mounts (citation count + recency) are spec-aligned partial coverage.** Build 7 mounted CitationCountChip + RecencyChip on PolicySignals, KeyMetricsRow, WatchlistSidebar, TechBody, and PriceBody. This satisfies two of the three Market Intel signals per source-credibility-model SKILL.md:300 (tier + recency). The missing third (`signal-strength`) is a data-layer gap, not a UI gap.

- **Adjacent surfaces intruding.** The MARKET_SCOPE union of `["technology", "innovation", "market_signal"]` + `domains: [2, 4]` co-tenants Technology Profile content on the Market Intel page. The Tech tab framing (`Energy & Technology Innovation` heading + TRL methodology disclosure) is Technology Profile content that has wandered onto Market Intel because there is no Technology surface to host it and because the source taxonomy does not have a dedicated category for tech profiles. A Market Intel rebuild needs to resolve this co-tenancy question with the broader surface-taxonomy operator (env-policy + caros-ledge-platform-intent), not in isolation.

- **The Operations surface is a downstream pressure point.** Operator's diagnosis already names Operations as built-to-wrong-spec. Several Market Intel gaps (cost-model integration, regional resource availability, cross-regional cost comparison) overlap Operations scope per caros-ledge-platform-intent SKILL.md:86-108. Rebuild scoping for Market Intel needs to settle the Market / Operations boundary explicitly: signals (Market) versus jurisdictional cost-baseline content (Operations).

- **The Intelligence Assistant absorbs gap when the page does not.** AiPromptBar at MarketPage.tsx:225-228 with chips at line 97 directs the customer to the Assistant for the four named questions. Per caros-ledge-platform-intent SKILL.md:132-140 the Assistant is a research helper, not a synthesis engine. If the rebuild leans on the Assistant to answer Q1-Q4, that is consistent with the platform-intent skill PROVIDED the page itself surfaces the structured content the Assistant grounds against. Today the structured content is thin (regulation-shaped Resources with optional whyMatters paragraphs), so the Assistant has limited grounding material on Market-Intel-shaped questions.

- **The four customer questions in the framing context are illustrative, not exhaustive.** A rebuild scope should probe whether they are the right four. Q3 (Strait of Hormuz) reads like a regional/geopolitical signal that may belong in a chokepoint sub-surface; Q4 (technology shifts) reads like a Technology Profile question. Operator's intuition on which questions Market Intel must answer in 30 seconds determines the rebuild's headline shape.

## Related

- [[spec-audit-operations-2026-05-23]] — Shared taxonomy-bleed: /market and /operations consume the same unfiltered fallback payload; audit says the Market/Operations boundary must be…
- [[spec-audit-research-2026-05-23]] — Both flag tech/innovation item-type routing drift vs the item_type-derived Format Mapping (Technology Profile)
- [[ADR-002-tier-model]] — Section-8 credibility signal set (tier + recency + signal-strength) the audit measures builds on the tier model
- [[SOURCE-TYPE-TAXONOMY-PROPOSAL]] — Market Intel gap is unregistered spec-named publishers; this proposal governs the source-type taxonomy that would route them
- [[source-classification-framework-2026-05-10]] — sources.category routing (migration 084) the audit depends on is defined by this classification framework
