# Spec audit: /operations built vs caros-ledge-platform-intent SKILL (2026-05-23)

Read-only audit. No code changes. No prescriptions for the rebuild beyond what the operator needs to scope it.

Compares `/operations` post-Migration-101 against `fsi-app/.claude/skills/caros-ledge-platform-intent/SKILL.md` (the OPERATIONS surface block at lines 85-108 and the binding framing at lines 100-104) and `fsi-app/.claude/skills/environmental-policy-and-innovation/SKILL.md` (Operations Profile format at lines 367-405, plus the source-category mapping references).

Scope note: this audit reflects the post-Migration-101 reality named in `docs/plans/fix-d-scope-2026-05-23.md`. After backfill, the Operations Facility sub-tab (`d=6`) holds 0 items. The NREL Warehouse Solar ROI item (item_type `research_finding`) now routes to `d=7` (Research) instead of `d=6` (Operations Facility), per the rule treating item_type as canonical.

## Section 1: Spec excerpt (verbatim)

### caros-ledge-platform-intent SKILL.md, lines 85-108, OPERATIONS surface

> ### OPERATIONS
>
> **Scope.** Jurisdictional decision intelligence. Surfaces structured content across:
>
> - Regulatory feasibility by region (which regulations apply where, with what enforcement)
> - Regional resource availability (materials, recyclables, qualified suppliers)
> - Labor markets (regional wage data, workforce availability)
> - Materials sourcing (regional supplier base, qualified mills)
> - Infrastructure capacity (ports, rail, terminals, charging)
> - Operational cost data (electricity, diesel, SAF, port handling, drayage)
>
> Examples of decisions Operations supports:
>
> - HVAC monitoring system versus hiring two people manually (cost and labor)
> - Cross-regional efficiency and cost comparison
> - Recyclable materials availability by region (materials sourcing)
> - PPWR packaging compliance feasibility by region given material supply (regulatory feasibility integrated with regional resources)
> - Solar versus automation versus hire decisions across regions
>
> **Build framing (binding).** Operations surfaces structured content. The customer reads the content and uses the Intelligence Assistant for cross-cutting questions during research. Synthesis happens through structured content plus Assistant plus customer judgment, NOT through a separate decision-engine UI. Operations is a content build, not a synthesis-engine build. Anyone scoping Operations as a separate "cross-functional decision engine UI" build is scoping wrong; this is the framing that the prior version of this skill propagated and that the alignment audit absorbed.
>
> **Source category mapping.** `regional_data` (Operations Profile format, 8 sections) plus cross-references from `regulatory` and `market_news` items.
>
> **Current state.** Broken. Stub gallery with regex chip matchers (Solar, Electricity, Labor, EV Charging, Green Building) that mis-attribute wiring gaps as coverage gaps (OBS-19). Phase-language banner "Coming soon, Phase D" leaked to customers (anti-pattern; see Section 11). No real content for most jurisdictions.

### environmental-policy-and-innovation SKILL.md, lines 367-405, Operations Profile (8 sections) for `regional_data`

> The reader question: in this region, what is cheaper, what is possible, what changes my plans here versus elsewhere, and how does my position compare to competitors?
>
> Section 1: Operational Cost Baseline for the Region. Industrial electricity rates per kWh, diesel and SAF prices, labor rates for warehouse operations and drivers, port handling charges, drayage rates. Each line item sourced and dated.
>
> Section 2: Feasibility of Specific Operational Choices. On-site solar (or whether power is monopolized by a state utility). BESS for peak shaving (regulatory permits, grid interconnection rules). Specific equipment. In-region material sourcing. Each feasibility question: the answer (possible / restricted / prohibited), the reason, the source.
>
> Section 3: Cost Comparison Against Alternatives. Manual labor for HVAC management versus automated BMS, on-grid versus on-site solar with permit and connection cost included, owned facility versus leased, in-region material sourcing versus import. Breakeven analysis, payback period, conditions where the answer flips.
>
> Section 4: Cross-Regional Strategic Implications. If solar is cheaper in this region and prohibited in another, what does that mean for where to consolidate operations, where to invest in equipment, where to rent versus own, where to source materials, where to locate production.
>
> Section 5: Competitive Positioning in the Region.
>
> Section 6: Client Conversation Talking Points.
>
> Section 7: Pending Changes That Shift the Calculus.
>
> Section 8: Sources.

### caros-ledge-platform-intent SKILL.md, lines 39-43, Current operational scope + dual posture (binding)

> **Current operational scope.** Freight forwarders specializing in art logistics, live events, luxury goods, automotive (classic, supercars, prototypes), and humanitarian cargo. Reflects the founding workspace and current customer cohort.
>
> **Architectural intent.** Multi-tenant SaaS designed to expand into the broader freight forwarding industry across air (primary), road (secondary), ocean (tertiary), and rail (rarely) modes.
>
> **Dual posture is the default.** Decisions about source coverage, classifier scope, jurisdiction taxonomy, ingest volume, page features, Community configuration, vendor directory entries, and onboarding flow must consider both current users (specialized verticals) and onboarding-time-future users (broader freight forwarding). Narrowing scope to current-only or expansion-only must be flagged explicitly. Silent narrowing is forbidden.

### caros-ledge-platform-intent SKILL.md, line 323, Section 11 anti-pattern (binding)

> **Operations as separate decision-engine UI build.** Wrong framing. The product shape is structured content on the page plus Intelligence Assistant for cross-cutting questions plus customer judgment. Anyone scoping a separate decision-engine UI is over-scoping per the prior version of this skill's mis-framing.

The spec is therefore self-contradictory in surface, the framing prohibits a separate "decision-engine UI" but the substantive content requirements (Operations Profile sections 1-7) require the page to surface "cheaper / possible / what changes my plans here vs elsewhere / position vs competitors" content. The resolution is structured content + Intelligence Assistant for cross-cutting questions, not chips and accordions over uncomparable per-jurisdiction blobs.

## Section 2: Current built reality (post-Migration 101)

### Routing layer

- `fsi-app/src/app/operations/page.tsx` lines 35-74 fetches three things in parallel: `getOperationsItems()` (category-routed RPC for sources where `category = 'operational_data'`, formerly `source_role = 'statistical_data_agency'`), `getResourcesOnly()` (the full slim workspace payload as fallback), `getScopedWorkspaceAggregates({ item_types: ["regional_data"], domains: [3, 6] })` (lines 11-14 OPERATIONS_SCOPE).
- Lines 22-29 define `REGULATION_ITEM_TYPES = {regulation, directive, standard, guidance, framework, law}` and pass items matching `r.domain === 1 || REGULATION_ITEM_TYPES.has(r.type)` through as `regulationsByRegion` (line 65).
- Fallback to the unfiltered slim payload kicks in when `opsItems.resources.length === 0` (lines 55-57). After Migration 101 stripped 8 mis-classified `d=5` items and 4 mis-classified `d=6` items, the fallback path is doing more of the work than it was at Build 9 time.

### Page surface (`fsi-app/src/components/pages/OperationsPage.tsx`)

- Lines 219-230 render `EditorialMasthead` with title "Operations Intelligence" (line 220) and a meta line of the form `<date> · <N> items in scope · <M> jurisdictions in scope` (line 215).
- Lines 54-59 define a 4-color legend strip: Critical / High / Moderate / Low with helpers "Block / immediate cost impact", "Plan ahead", "Monitor", "Background awareness".
- Lines 160-165 render a 4-up StatStrip (Critical primary tile) by counting `priority === "CRITICAL" / HIGH / MODERATE / LOW` across the union of regional+facility items.
- Line 61 defines the chips presented to the AiPromptBar at line 234: `["Warehouse costs in Dubai", "EV charging in the EU", "Solar permitting timelines"]`, with placeholder text "Ask anything about your operations - e.g. What are warehouse costs in Dubai?".
- Lines 239-242 render two tabs: "By Jurisdiction" and "Facility Data".

### By Jurisdiction tab (lines 244-251, 310-396)

- Heading: "Regional Operations Intelligence" (line 346).
- Sub-copy (lines 347-348): "Regulatory feasibility, regional resources, energy tariffs, labor markets, materials sourcing, infrastructure capacity, and operational cost data by jurisdiction." This sub-copy promises all six spec scope bullets; the rendered UI delivers a `RegionCard` accordion per jurisdiction.
- Each `RegionCard` (lines 398-578) renders:
  - Header: region name + worst-priority badge + rolled-up CitationCountChip + RecencyChip + count line `<N> data point(s) · <K> regulation(s)`.
  - Closed by default (per accordion default-state policy at lines 358-361).
  - When open: a `RegulatoryFeasibilitySection` (lines 584-672) showing up to 8 regulation rows for that jurisdiction, each linking to `/regulations/<id>`.
  - Then a chip grid (lines 559-572) of `ChipCell` instances for chips with items present. Chip taxonomy at lines 80-92 is: Solar, Electricity, Labor, EV Charging, Green Building, Materials Sourcing, Infrastructure, Other regional data (catch-all).
  - Each `ChipCell` (lines 691-761) renders the first item title + optional note + citation chips + a `+N more` drill-down list.
- Side rail (lines 375-393): Coverage card ("<N> jurisdictions with data") and Methodology card.

### Facility Data tab (lines 252-254, 820-979)

- Heading: "Warehouse & Facility Optimization" (line 847).
- Sub-copy (lines 849-850): "Electricity tariffs, solar ROI, battery storage, labor benchmarks, and green building certifications by location."
- Renders one `FacilityCategoryCard` per `topic || sub || "Uncategorized"` grouping of `r.domain === 6` items.
- Post-Migration-101: `d=6` is empty, so this tab now renders the empty state at lines 858-874 ("No facility data for this workspace yet"). The NREL Warehouse Solar ROI item that was the canonical Facility Data anchor at Build 9 is now `d=7` and routes to Research.

### Framing assessment

The framing is jurisdictional cataloging. The customer sees a list of regions; opening one shows what regulations apply there plus a chip grid of whatever regional_data items happen to mention solar / electricity / labor / EV / green building / materials / infrastructure (matched by `inferChipKey` regex at lines 80-91, 115-121). There is:

- No comparison framework (no side-by-side rendering of two or more jurisdictions on a shared axis).
- No decision-support UI per any of the spec's named decision examples (HVAC vs hire, solar vs automation vs hire, PPWR feasibility integrated with material supply, cross-regional cost comparison).
- No cost-model integration (no per-jurisdiction cost estimate against a hypothetical decision the customer is evaluating).
- No permit-timeline view structured by permit type across jurisdictions.
- No worked examples for any vertical (art logistics, live events, luxury, automotive, humanitarian).
- The "Operational cost data (electricity, diesel, SAF, port handling, drayage)" spec bullet at line 94 has no first-class surface; cost items must arrive as `regional_data` rows tagged into the Electricity chip, which only renders the head item title + note. Diesel, SAF, port handling, drayage have no chip slots at all.

## Section 3: Line-cited gap analysis

| Spec requirement | Status | Build evidence / line citations |
|---|---|---|
| Regulatory feasibility by region (regulations applicable per jurisdiction) | PRESENT | `RegulatoryFeasibilitySection` at `OperationsPage.tsx:584-672`, fed by `regulationsByRegion` filter at `page.tsx:65`. Up to 8 rows per region, each a link to `/regulations/<id>`. This is the strongest piece of the page. |
| Regional resource availability (materials, recyclables, qualified suppliers) | MIS-FRAMED | Materials Sourcing chip at `OperationsPage.tsx:86` with regex matcher `/material\|mill\|supplier\|recycl\|aluminium\|aluminum\|steel\|fiber\|fibre\|composite/i`. ChipCell at lines 691-761 renders only the first item title plus a `+N more` drill. No structured "qualified suppliers per region" content shape. No supplier-base comparison across regions. |
| Labor markets (regional wage data, workforce availability) | MIS-FRAMED | Labor chip at `OperationsPage.tsx:83` with regex `/labor\|labour\|wage\|salary\|workforce\|wages/i`. No wage benchmarking against alternatives. No comparison across jurisdictions. The customer's question "How do labor costs compare across the regions I operate?" cannot be answered without opening every RegionCard sequentially and reading the head item in the Labor chip. |
| Materials sourcing (regional supplier base, qualified mills) | MIS-FRAMED | Same Materials Sourcing chip as above. Spec contemplates qualified mills, certification status, in-region vs import comparison; chip surfaces only first matching item title. |
| Infrastructure capacity (ports, rail, terminals, charging) | MIS-FRAMED | Infrastructure chip at `OperationsPage.tsx:87` matches `/port\|rail\|terminal\|airport\|drayage\|handling/i`. EV Charging is a separate chip at line 84. No infrastructure-capacity comparison view across jurisdictions. |
| Operational cost data (electricity, diesel, SAF, port handling, drayage) | MISSING (mostly) | Electricity chip exists at `OperationsPage.tsx:82`. No chips for diesel, SAF, port handling, drayage. The Operations Profile Section 1 in `environmental-policy-and-innovation` SKILL line 375 names all of these as first-class line items "Each line item sourced and dated". Built reality: 1 of 5 cost dimensions has a chip. None has cost-trend rendering. |
| Decision example: HVAC monitoring system vs hiring two people manually | MISSING | No surface element compares automated BMS vs manual labor. The Labor chip and (absent) HVAC chip do not converge into a comparison or breakeven view. The customer cannot answer "should I automate HVAC at this facility?" from `/operations`. |
| Decision example: Cross-regional efficiency and cost comparison | MISSING | No multi-region comparison view exists anywhere on the page. Each `RegionCard` is closed by default (line 366, 408) and rendered in alphabetical region order (line 109). Opening two regions side-by-side requires manual scrolling and reading; the UI provides no comparison shape. |
| Decision example: Recyclable materials availability by region | MIS-FRAMED | Captured under Materials Sourcing chip regex (line 86, includes `recycl`). Same shortcomings as materials sourcing in general. |
| Decision example: PPWR packaging compliance feasibility by region given material supply | MISSING | The spec wants regulatory feasibility integrated with regional resources for a single decision (PPWR). The build renders RegulatoryFeasibilitySection and chip grid in the same accordion but they are NOT linked. A regulation row does not surface "and here is the material-supply picture in this region for the materials this regulation governs." Two adjacent uncoupled lists. |
| Decision example: Solar vs automation vs hire decisions across regions | MISSING | Solar chip exists (line 81) but is not paired with Labor / Automation chips into a decision shape. The NREL Warehouse Solar ROI item that anchored this use case at Build 9 is now `d=7` and surfaces on `/research`, NOT `/operations` (Fix D, `fix-d-scope-2026-05-23.md` lines 5-13). |
| Build framing: structured content + Intelligence Assistant + customer judgment (binding, lines 100-104) | PRESENT (architecturally) but UNDER-EXPLOITED | `AiPromptBar` at lines 233-236 with chips ["Warehouse costs in Dubai", "EV charging in the EU", "Solar permitting timelines"] (line 61). The Assistant is wired. The structured content it is supposed to ground in is thin and not decision-shaped, so the Assistant grounding has little to bind to. |
| Operations Profile format (8 sections, per `environmental-policy-and-innovation` lines 367-405): rendered per regional_data item | MISSING | The page renders items as chip-head + note + drill-list. None of the 8 sections (Cost Baseline, Feasibility, Cost Comparison Against Alternatives, Cross-Regional Strategic Implications, Competitive Positioning, Client Conversation Talking Points, Pending Changes That Shift the Calculus, Sources) appear as structured rendering on the page. Operations Profile items render flat. |
| Source category mapping: `regional_data` + cross-references from `regulatory` and `market_news` (line 106) | PARTIAL | `regional_data` items consumed via `getOperationsItems()` and the fallback. Cross-references from `regulatory` items handled by `RegulatoryFeasibilitySection`. Cross-references from `market_news` (Market Intel) are NOT surfaced. No "what is moving in the market that changes this region's cost picture" pointer back to `/market`. |
| Sub-tab: Facility Data (`d=6`) | PRESENT but EMPTY post-Migration-101 | Tab button at line 241, panel at `OperationsPage.tsx:820-879`. After Migration 101 (per `fix-d-scope-2026-05-23.md` lines 5-17), `d=6` has 0 items. The tab renders the empty state at lines 858-874. This is the open architectural question in Fix D. |
| Dual posture: current verticals (art / live events / luxury / automotive / humanitarian) AND expansion (broader freight forwarding) (lines 39-43) | MISSING | The chip taxonomy is generic. No vertical-specific content shape. No worked example by vertical. The current cohort cannot see "art logistics warehouse in Singapore vs LA on labor + solar + permits" without leaving the page and synthesizing manually. Expansion cohort (generic freight forwarder) gets identical generic content. Silent narrowing risk: the page does not serve either cohort's decisions concretely. |
| No phase-language leakage (Section 11 anti-pattern at line 321) | PRESENT (closed) | Build 9 commit `8e91271` replaced "Coming soon" banners with `NoDataBanner` at `OperationsPage.tsx:989-1025`. EmptyJurisdiction at lines 796-816 and Facility empty state at lines 858-874 use workspace-anchored copy. This anti-pattern is closed. |
| Operations as separate decision-engine UI (anti-pattern at line 323) | NOT PRESENT (correctly avoided) | The build is structured content + AiPromptBar. No bespoke decision-engine UI was built. The framing is honored at the architectural level. |
| StatStrip "Critical / High / Moderate / Low" tile counts as primary navigation | PRESENT but unauthorized (no spec anchor) | Lines 160-165, 219-229. The spec block at lines 85-108 does NOT name a severity-tile navigation pattern for Operations. Severity labels are defined in `environmental-policy-and-innovation` SKILL (lines 153-160) as content-level labels per item, not as a primary navigation control. The StatStrip is borrowed from the Regulations design language and re-used here without a spec grounding. |
| Citation count and recency chips on region/chip/regulation rows | PRESENT but unauthorized (no spec anchor in OPERATIONS surface block) | Lines 514-515, 657-660, 727-732, 966-969. Mounted per the Q9 "Operations credibility signal set" referenced in commit `8e91271` and per `source-credibility-model` SKILL. Not called for in the OPERATIONS spec block. Not harmful, but signals that the page accreted credibility chrome instead of decision shape. |

### Direct answers to the four named customer questions

| Customer question | Does the current build help? | How |
|---|---|---|
| "Where should I locate my next facility?" | NO | No location comparison shape. Customer would have to open every RegionCard, read every chip head, mentally cross-tabulate by hand. No vertical-specific worked example. No infrastructure capacity comparison. No labor + solar + permit + cost roll-up per candidate location. |
| "Should I install solar at the warehouse?" | NO (and worse, post-Migration 101) | Solar chip at line 81 shows first matching item title per region. The canonical decision-support item (NREL Warehouse Solar & BESS ROI) is now `d=7` and lives on `/research`, not `/operations` (Fix D). No solar-permit-by-jurisdiction view. No solar ROI calculator. No "is on-site solar permitted in this region" rendering. The Operations Profile Section 2 promise of "On-site solar (or whether power is monopolized by a state utility) ... possible / restricted / prohibited" is not rendered. |
| "How do labor costs compare across the regions I operate?" | NO | Labor chip per region (line 83) shows only the first matched item title. No comparison view. No wage table across jurisdictions. No workforce availability dimension. Customer must read N regions in sequence and remember numbers. |
| "What permits will slow me down where?" | PARTIALLY | RegulatoryFeasibilitySection (lines 584-672) lists regulation rows per jurisdiction with priority badges. This is the closest the build comes to answering a customer question. But: (a) regulations are listed without permit-timeline structure (deadline, processing window, agency); (b) there is no cross-jurisdiction view of "this permit type across all my regions"; (c) the rows link to `/regulations/<id>` so the customer leaves the Operations surface to read details. The answer requires customer-side aggregation across N region accordions. |

## Section 4: Missing data shapes

The data layer (`getOperationsItems` + `fetchOperationsItems` at `supabase-server.ts:1097-1101`) returns a flat `CategoryRoutedResult` of `regional_data` rows with the standard Resource columns (title, note, jurisdiction, priority, tags, topic, sub, plus citation enrichment). The spec implies the following shapes that the data layer does not produce. Each item below is a prompt for the rebuild scope, not a prescription.

1. **Cross-jurisdiction comparison tables.** The spec's "Cross-Regional Strategic Implications" (Operations Profile Section 4) and the decision example "Cross-regional efficiency and cost comparison" both require a comparison data shape: rows = jurisdictions, columns = decision dimensions (wages, electricity, solar permit window, infrastructure capacity, regulatory burden). The current layer returns rows; nothing in the data shape lets the UI render a true cross-tab.

2. **Decision dimensions as first-class structure.** Wages, on-site solar permission, HVAC operational cost, regional infrastructure permission, electricity cost, diesel cost, SAF availability, port handling, drayage, labor benchmarks, green building certification, materials supply, recyclables availability are not first-class fields on `regional_data` items. They live as free text inside title/note and are inferred by regex chip matchers. There is no per-dimension data column, so the UI cannot guarantee a chip slot is filled or render a chip-by-jurisdiction matrix.

3. **Cost-model integration.** Operations Profile Section 3 names breakeven analyses, payback periods, conditions where the answer flips. The data layer carries no cost-model fields (no `breakeven_months`, no `payback_years`, no `conditions_for_flip`). The spec expects "manual labor for HVAC management versus automated BMS" with breakeven; the build has no breakeven shape to render.

4. **Permitting timelines structured by jurisdiction + permit type.** The RegulatoryFeasibilitySection lists regulations but does not surface permit type, processing window, agency, fee structure, application requirements. The customer question "what permits will slow me down where?" requires a permit-timeline data shape that the layer does not produce.

5. **Feasibility statuses (possible / restricted / prohibited) per decision per region.** Operations Profile Section 2 line 381 specifies "the answer (possible / restricted / prohibited), the reason, the source". There is no `feasibility_status` or `feasibility_reason` field on `regional_data` items. The UI cannot color-code or filter regions by feasibility because the shape does not exist.

6. **Worked examples per vertical.** The dual-posture rule (lines 39-43) calls for content that serves both the current cohort (art logistics, live events, luxury, automotive, humanitarian) and expansion. No vertical-tagged regional content exists in the shape. No "art logistics warehouse in Singapore vs LA" worked-example record type. No vertical filter on the page.

7. **Cross-surface pointer from `market_news`.** The OPERATIONS spec mapping (line 106) names cross-references from `regulatory` AND `market_news`. The build pulls `regulatory` via `regulationsByRegion`. It does NOT pull `market_news` items for any "what is moving in the market that changes this region's calculus" surface (Operations Profile Section 7: Pending Changes That Shift the Calculus).

8. **Operations Profile sections per item.** When a `regional_data` item carries an 8-section Operations Profile in `intelligence_items.full_brief`, the page never renders it. Items appear as title + note + chip badge. The structured profile content the agent emitted is invisible.

9. **Competitive positioning per region.** Operations Profile Section 5. No competitor data shape. No "named competitors operating in this region" surface.

10. **Pending changes that shift the calculus.** Operations Profile Section 7. No "pending changes" rendering even when the underlying brief has the section. No deadline countdown for permits-in-flight. No "infrastructure under construction" surface.

## Section 5: Questions for the operator before rebuild

1. **Comparison framework: rows-by-jurisdictions or rows-by-decisions?** The spec's named decisions (HVAC vs hire, solar vs automation vs hire, PPWR feasibility) suggest decision-primary layout (pick a decision, see the cross-region answer). The current UI is jurisdiction-primary (pick a region, see what's there). Which does the rebuild lead with? Both? A toggle?

2. **Vertical-specific content vs generic content.** The current build is generic ("warehouse costs in Dubai"). The current cohort (art / live events / luxury / automotive / humanitarian) gets identical content to a generic freight forwarder. Should the rebuild ship vertical-tagged content with a vertical filter? Or stay generic and rely on the Intelligence Assistant to filter? The dual-posture rule (lines 39-43) prohibits silent narrowing in either direction; rebuild scope needs an explicit answer.

3. **Operations Facility sub-tab disposition (Fix D, `fix-d-scope-2026-05-23.md` lines 15-32).** Two unresolved options: keep the sub-tab and extend classifier vocabulary so research-finding-but-facility-applicable items land in `d=6`, or remove the sub-tab and treat Operations as Regional-primary. Should the Operations rebuild ABSORB this decision (making Fix D Operations Facility a sub-scope of the rebuild), or should Fix D ship first and the rebuild assume Option A or Option B has already landed? See "Caveats" below.

4. **Decision-support shapes vs Operations Profile fidelity.** Operations Profile sections 1-8 are the agent contract for `regional_data` briefs. Should the rebuild render these sections faithfully (e.g., a per-region brief view with all 8 sections expanded) and let the customer assemble decisions across regions, OR should it render decision-shaped views (HVAC comparator, solar permitting matrix, labor wage table) that consume Operations Profile content but reorganize it? The two are not mutually exclusive but the entry point matters.

5. **Cost-model integration scope.** Does the rebuild include any breakeven / payback rendering (Operations Profile Section 3 calls for it), or is cost-model output left to the Intelligence Assistant when the customer asks? If rendering: where do the breakeven inputs come from (operator-curated per item, agent-extracted from briefs, customer-input)? This is a cost discipline question per the user's standing rule on cost-incurring features needing manual gates.

6. **Cross-surface `market_news` pull-in.** The spec maps `market_news` items as a secondary input to Operations. Should the rebuild surface a "Market signals affecting this region" subsection per RegionCard or a top-level "What's moving in the markets you operate" panel? The pull-in is currently absent.

7. **Empty-state and coverage honesty.** Post-Migration-101 the page has thinner content than at Build 9. As ingest is restarted (per `ingest-restart-sequencing-2026-05-22.md`) the page will refill incrementally. Should the rebuild ship a coverage-status surface (named jurisdictions with no operational data, named decision dimensions with no data) so the gap is visible to the customer rather than hidden by the "open accordion to see nothing" pattern? OBS-19 is closed at the banner level but the structural emptiness is still hidden behind closed accordions.

## Inputs cited

- `fsi-app/.claude/skills/caros-ledge-platform-intent/SKILL.md` lines 39-43, 85-108, 321, 323
- `fsi-app/.claude/skills/environmental-policy-and-innovation/SKILL.md` lines 55, 192, 367-405, 786
- `fsi-app/src/app/operations/page.tsx` lines 11-14, 22-29, 35-74, 47, 65
- `fsi-app/src/components/pages/OperationsPage.tsx` lines 54-59, 61, 80-92, 99-110, 115-121, 125-258, 160-165, 219-230, 233-236, 239-242, 310-396, 398-578, 584-672, 691-761, 796-816, 820-979, 858-874, 989-1025
- `fsi-app/src/lib/data.ts` lines 600-681
- `fsi-app/src/lib/supabase-server.ts` lines 912-1101
- `docs/plans/fix-d-scope-2026-05-23.md` (entire)
- Commit `8e91271` Build 9 Operations

## Related

- [spec-audit-research-2026-05-23](./spec-audit-research-2026-05-23.md) — The NREL Warehouse Solar-ROI item moved from Operations d=6 to Research d=7 under Migration 101; both audits track it
- [spec-audit-market-intel-2026-05-23](./spec-audit-market-intel-2026-05-23.md) — Shared taxonomy-bleed: /market and /operations consume the same unfiltered fallback payload; audit says the Market/Operations boundary must be…
- [spec-audit-synthesis-2026-05-23](./spec-audit-synthesis-2026-05-23.md) — One of eight audits synthesized (commit 1f5a784); Operations rebuild absorbs the Fix D Facility decision
- [fix-d-scope-2026-05-23](./fix-d-scope-2026-05-23.md) — Audit reflects post-Migration-101 reality this doc defines; Facility sub-tab (d=6 empty) disposition is Fix D's open decision
- [ingest-restart-sequencing-2026-05-22](./ingest-restart-sequencing-2026-05-22.md) — Audit notes thin post-Migration-101 content refills as ingest restarts per this sequencing plan
