# Spec audit, /research, built vs caros-ledge-platform-intent spec

**Date**: 2026-05-23
**Branch**: chore/spec-audit-research
**Scope**: READ-ONLY audit of the customer-facing /research surface against the binding spec for Research in `fsi-app/.claude/skills/caros-ledge-platform-intent/SKILL.md`, with companion specs from `fsi-app/.claude/skills/environmental-policy-and-innovation/SKILL.md`.
**Constraint**: no code changes, no rebuild prescriptions, gap analysis only.

---

## Section 1, Spec excerpt

### 1.1, Research surface block (caros-ledge-platform-intent SKILL.md, lines 67 to 83)

> ### RESEARCH
>
> **Scope.** Horizon-scan content with analytical or quantitative depth. Includes:
>
> - Peer-reviewed academic journals (Journal of Sustainable Transportation, transport research journals)
> - Think-tanks and policy analysis (IEA, IRENA, IPCC, World Bank, OECD, ICAP, Carbon Trust)
> - Quantified climate research (Project Drawdown)
> - Industry analytical press with named editorial provenance (Loadstar, FreightWaves Sustainability, Edie, GreenBiz, Environmental Finance, Splash247 Green, Supply Chain Digital)
> - Reuters Sustainable Business analytical reporting (distinct from the trade-press Sustainable Switch newsletter which lives in Market Intel)
>
> Research is BROADER than peer-reviewed academic. The discriminator is analytical and horizon-scanning depth, not academic publication form.
>
> **Source category mapping.** `research_finding` (Research Summary format, 6 sections); some `technology`, `innovation`, `tool` items (Technology Profile format) also surface here when the substance is horizon-scan rather than market-signal.
>
> **Current state.** Broken. Currently functioning as an editorial draft-staging queue for Regulations content rather than as a horizon-scan destination. The `publishedThisWeek` callout titles render as `<b>` text without Links. No live ingest pipeline producing Research Summary briefs from the analytical-press sources; the sources are registered as legacy resource entries only. Source coverage matrix is a hardcoded placeholder with the tab hidden.
>
> A repositioning decision is open: does Research stay as the editorial draft-staging queue (and the customer-facing horizon-scan destination needs a different surface), or does Research become the customer-facing horizon-scan destination (and editorial draft-staging moves to admin chrome)? Operator decides in Sprint 2 planning.

Key spec language extracted:

- "Horizon-scan content with analytical or quantitative depth" (line 69).
- "Industry analytical press with named editorial provenance" (line 74).
- "Research is BROADER than peer-reviewed academic. The discriminator is analytical and horizon-scanning depth, not academic publication form." (line 77).
- Source category mapping: `research_finding` produces Research Summary format (6 sections); some `technology` / `innovation` / `tool` items also surface (lines 79 to 80).
- "Currently functioning as an editorial draft-staging queue for Regulations content rather than as a horizon-scan destination." (line 81). Spec itself names the mismatch.

### 1.2, Research Summary format (environmental-policy-and-innovation SKILL.md, lines 449 to 477)

The Research Summary format is the binding data shape for `research_finding` items per the skill's Format Mapping (line 193). Six named sections, integrity-ruled (no invented facts), workspace-anchored:

> ### Section 1: What the Research Found
> Headline finding, methodology in brief, scope and limitations. Honest about the study's limits.
>
> ### Section 2: Why This Finding Matters Operationally and Commercially
> The mechanism by which the finding affects freight operations or commercial positioning. Filtered by cargo vertical and transport mode.
>
> ### Section 3: What the Finding Changes for Strategy, Claims, or Decisions
> Specific decisions impacted: sustainability claims, operational choices, regulatory anticipation, vendor selection.
>
> ### Section 4: Client Conversation Talking Points and Public Position
> What the workspace can credibly say or claim based on this finding. What questions to pose to clients. Pitfalls to avoid (overclaiming, citing studies the workspace has not read).
>
> ### Section 5: What the Finding Does Not Resolve
> Limits of the study, open questions, conditions for translation into action. Related research that converges or contradicts.
>
> ### Section 6: Sources
> The research paper, peer review status, related research that converges or contradicts. Source list with type labels.

### 1.3, Companion routing rules (environmental-policy-and-innovation SKILL.md)

- Format Mapping (lines 188 to 196): `research_finding` to Research Summary; `technology, innovation, tool` to Technology Profile.
- Resource Taxonomy, "Research and Intelligence" (line 491): "FIATA, ICCT, ITF, NREL, MIT CTL, Sabin Center, Maritime Carbon Intelligence, FreightWaves, GreenBiz, Reuters Sustainable Business."
- Cross-Format Lens Requirement (lines 109 to 116): every brief serves four lenses, substantive content, competitive positioning, client-conversation, action.
- Cause and Effect Requirement (lines 162 to 182): every data point has cause, mechanical consequence, vertical-filtered effect, sourced at every link.
- Topic Categories (line 503): `research` is one of seven controlled vocabulary values.

### 1.4, Five-surface model and anti-patterns (caros-ledge-platform-intent SKILL.md)

- Five-surface model (lines 45 to 47): Regulations, Market Intel, Research, Operations, Community.
- Anti-pattern, page scope drift (line 322): "treating Research as academic-only when it includes industry analytical press."
- Anti-pattern, phase language leakage (line 321): "Allowing phase-language to leak into customer-facing UI."
- Dual-posture statement (lines 39 to 43): current operational verticals (art logistics, live events, luxury goods, automotive, humanitarian) plus expansion to broader freight forwarding across air, road, ocean, rail.

---

## Section 2, Current built reality

The surface renders the **editorial production pipeline for the platform's intelligence team**, with the title **"Research Pipeline"**. The customer lands on what looks like a publisher's content management system, not a horizon-scan briefing room.

### 2.1, Page header and meta line

- Title: `"Research Pipeline"` (ResearchView.tsx:452 in EditorialMasthead title prop).
- Meta line is generic count of `intelligence_items` rows, not research-specific (ResearchView.tsx:439): `${dateStr} · ${itemsCount} items in scope · ${jurisdictionsCount} jurisdictions in scope`. No mention of themes, findings, or horizon.
- A "Showing N of M" truncation banner appears when total exceeds page cap (ResearchView.tsx:454 to 472). Cap is 100 (page.tsx data path).

### 2.2, Stage legend strip (ResearchView.tsx:474 to 503)

A horizontal legend bar with four entries:

| Stage | Helper text (ResearchView.tsx:154 to 159) |
|---|---|
| Draft | "Internal, researcher building the file" |
| Active review | "Awaiting validator sign-off" |
| Published | "Live in regulations & intel" |
| Archived | "Superseded or out-of-scope" |

These names and helpers are defined as the `STAGE_LABEL` and `STAGE_HELPER` constants at ResearchView.tsx:133 to 159. The helper text is internal editorial-team workflow language ("researcher building the file," "validator sign-off"), shipped to the customer.

### 2.3, Four-tile StatStrip (ResearchView.tsx:506 to 508, tiles built at 404 to 416)

Four tiles, one per pipeline stage. Counts come from `intelligence_items.pipeline_stage` (ResearchView.tsx:351 to 362). The "active_review" tile is marked `primary: true` (ResearchView.tsx:410), so the visually dominant number on the page is the count of regulations currently awaiting validator sign-off, not anything horizon-scan.

Each tile is clickable; clicking sets the tab to "pipeline" and applies the stage filter (ResearchView.tsx:411 to 414).

### 2.4, AI prompt bar (ResearchView.tsx:512 to 519)

Placeholder text: `"Ask anything about your research pipeline, e.g. What's queued for the EU?"`. Chip suggestions:

1. "What's queued for the EU?"
2. "Partner-flagged this month"
3. "Show recent publishes"

All three chips are about the production queue, none about findings, themes, or horizon-scan content.

### 2.5, Two tabs (ResearchView.tsx:531 to 558)

Two tabs, "Pipeline" (default) and "Source coverage". No "Findings", "Themes", "What's emerging", "By cargo vertical", or any horizon-scan organization tab.

### 2.6, Pipeline tab content (ResearchView.tsx:561 to 825)

H3: `"Currently in pipeline"` (line 573).

Body copy (lines 575 to 585): `"The queue of regulations and consultations our team is tracking, items being drafted, awaiting validator sign-off, and recently published. Each row traces back to a primary source feed."` This explicitly describes the surface as a queue of **regulations and consultations** in the publishing pipeline.

Quick counter callout (ResearchView.tsx:588 to 623), four counts:

- N **in active review**
- N **in draft**
- N **published this week**
- N **live in regulations & intel**

"What's new this week" callout (ResearchView.tsx:626 to 678), visible only when there are recently-published items. Body: `"N regulations went live in the last 7 days"` (line 654). The list items are titles rendered as `<b>` text (line 665), not links, even though each row corresponds to an `intelligence_item` with a routable detail page. The spec's "current state" block explicitly flags this gap, "the `publishedThisWeek` callout titles render as `<b>` text without Links."

Filter bar (ResearchView.tsx:696 to 803), three controls:

1. **Stage** pills: All, Draft, Active review, Published (counts inline; archived omitted from filter row).
2. **Region** select dropdown, hard-coded label list at lines 178 to 178 (`EU, UK, US Federal, California, Singapore, China, UAE`).
3. **Free-text search** over title, summary, source name (lines 391 to 398).

There is no filter for cargo vertical, transport mode (the chip uses mode but no filter), severity, format type, research topic, or theme.

PipelineRow card (ResearchView.tsx:1023 to 1338). Each row card surfaces:

- Source name as a kicker (lines 1080 to 1104), with a `CredibilityBadge` tier chip when present.
- Stage pill (lines 1113 to 1127) using `STAGE_PILL_TONE` color map.
- Item title (lines 1128 to 1130) rendered as a `Link` to `/regulations/${id}` (line 1062). **Every row in /research links into /regulations**, confirming the spec's "draft-staging queue for Regulations content" framing.
- Metadata line, "First seen" date and optional Owner field (lines 1132 to 1151).
- Right-side chip cluster: `mode · region` chip, `CitationCountChip`, `RecencyChip`, `BiasBadge`, optional "Partner-flagged" chip, expand/collapse chevron.
- Expanded synopsis with summary text, primary source URL, and a "Meta" block (Stage, Region, Mode, Added, Owner).

Freshness color stripe on the left edge (ResearchView.tsx:1041 to 1046, freshness logic 997 to 1014): fresh (≤7d) emerald, warming (≤30d) blue, established (≤90d) slate, stale (>90d) gray. Based on `added_date`, the date the item was ingested into the platform, not the date the research was published or the date the finding was peer-reviewed.

### 2.7, Source coverage tab (ResearchView.tsx:828 to 977)

H3: `"Source feeds & coverage matrix"` (line 840).

Body copy (lines 845 to 852): `"Every regulation in the pipeline traces back to a primary source feed. This is what we monitor, how often, and where we still have gaps."` Again, "regulation in the pipeline" framing.

A 4 by 7 matrix table (lines 864 to 962):

- Rows (`COVERAGE_MODES`, line 177): Ocean, Air, Road, Facility.
- Columns (`COVERAGE_REGIONS`, line 178): EU, UK, US Federal, California, Singapore, China, UAE.
- Cells: dot color + label ("Full" / "Partial" / "Not yet") plus a numeric count of registered active Research-category sources for that (mode, region) pair. Thresholds: 0 to none, 1 to 2 partial, 3 or more full (`coverageStateForCount` at line 231).

Driven by the migration 100 RPC `get_research_source_coverage()` (data path: page.tsx:53, fetcher supabase-server.ts:886 to 910), which counts active `sources` rows where `category='research'`, grouped by transport_mode and jurisdiction_iso.

Footer text below the matrix (ResearchView.tsx:972 to 974): `"Cell state derives from the live count of active Research-bound sources per (mode, region). Coverage thresholds: none (0), partial (1-2), full (3+)."`

### 2.8, Data path

page.tsx fetches in parallel (lines 45 to 54):

1. `getResearchPipeline()` returns ResearchPipelineRows from `intelligence_items` where `is_archived = false`, ordered by added_date desc, capped at 100. **No category filter at the query level**, the slim payload is workspace-wide intelligence_items (supabase-server.ts:759 to 766).
2. `getResearchItems()` returns the category-routed Resource list via `get_research_items` RPC (supabase-server.ts:1086 to 1090), which filters on `sources.category='research'` per migration 084.
3. `getScopedWorkspaceAggregates(RESEARCH_SCOPE)` where `RESEARCH_SCOPE = {}` (page.tsx:21) means the aggregate degrades to workspace-wide totals.
4. `getResearchSourceCoverage()` for the matrix tab.

page.tsx:62 to 68 intersects pipeline rows with the allow-list of IDs from `getResearchItems`, falling back to unfiltered pipeline rows when the category RPC returns empty. This is Build 4's "category routing wiring" that the platform-intent skill calls out as Sprint 2 foundation work.

The intersection is the only place where Research-category semantics enters the surface. Every downstream display (StatStrip, callouts, PipelineRow) operates on `pipeline_stage`, not on `format_type`, `item_type`, `topic_tags`, or research-specific dimensions.

---

## Section 3, Line-cited gap analysis

| Spec requirement | Build status | Where the build sits (file:line) | Notes |
|---|---|---|---|
| Surface scope is "horizon-scan content with analytical or quantitative depth" (intent SKILL:69) | **MIS-FRAMED** | ResearchView.tsx:452 ("Research Pipeline"), 573 ("Currently in pipeline"), 583 ("queue of regulations and consultations our team is tracking") | The surface is framed as the platform's editorial production pipeline, not as a horizon-scan destination for customers. Title, body copy, tab name, stage chips, and AI prompt chips all reinforce the production-pipeline framing. |
| Research is broader than academic, includes industry analytical press with named editorial provenance, Loadstar, FreightWaves, GreenBiz, Edie, etc. (intent SKILL:74 to 77) | **MIS-FRAMED** | supabase-server.ts:1083 to 1090 (RPC filters on `sources.category='research'`); no display element surfaces editorial provenance distinctly | The category routing reaches the right source set per migration 084. The display does not differentiate analytical-press provenance, peer-reviewed academic, think-tank, or quantified-climate. All rows render identically as pipeline cards. The "named editorial provenance" dimension that the spec emphasizes is invisible in the UI. |
| Research Summary format (6 sections, environmental SKILL:449 to 477) is the binding data shape for research_finding items | **MISSING** | No reference anywhere in `src/app/research/` or `src/components/research/` to the six sections or to research_summary format_type | The surface does not render Research Summary briefs at all. PipelineRow displays a single `summary` field text dump (ResearchView.tsx:1266), not the six structured sections (What the Research Found, Why It Matters Operationally, etc.). No "Talking Points" panel, no "What the Finding Does Not Resolve" panel. The spec's binding data contract for `research_finding` items is unrendered. |
| Cross-Format Lens Requirement, four lenses, substantive, competitive, client-conversation, action (environmental SKILL:109 to 116) | **MISSING** | ResearchView.tsx PipelineRow expanded panel (1235 to 1336) renders only summary + Meta | No competitive-positioning lens, no client-conversation lens, no action lens. The expanded card shows summary text plus a Meta block of stage/region/mode/added. None of the four mandatory lenses surface on the customer-facing card. |
| Cause and Effect Requirement, vertical-filtered effect per data point (environmental SKILL:162 to 182) | **MISSING** | Not implemented in PipelineRow | No place to render cause, mechanical consequence, vertical-filtered effect. Customers cannot see which findings affect art logistics vs live events vs humanitarian. |
| Surface organization should let the customer answer "what's emerging in my cargo type / route / regulatory domain" | **MIS-FRAMED + MISSING** | Filter bar only offers stage, region, free-text (ResearchView.tsx:696 to 803) | No cargo vertical filter (the spec's dual-posture cohort, art logistics, live events, luxury goods, automotive, humanitarian, plus expansion-cohort freight verticals, is the spec's primary discriminator and is absent). No topic_tag filter (the spec's seven-category vocabulary at environmental SKILL:493 to 507). No theme grouping. No "what's emerging this month" or rolling horizon view. The customer cannot filter by anything that maps to their workspace profile beyond region. |
| Customer should encounter THEMES and FINDINGS, not SOURCES in a workflow (operator framing) | **MIS-FRAMED** | Entire surface organized around `pipeline_stage` enum (ResearchView.tsx:131 to 173; data path through migration 026 backfill) | The primary organizing axis is the editorial workflow state (draft, active review, published, archived). The customer sees the platform's internal production queue. There is no "theme" entity rendered, no "findings" grouping, no semantic clustering. Every row card surfaces `sourceName` as the prominent kicker (line 1098), making the source/publisher the visual entry point, not the finding. |
| `publishedThisWeek` callout items should be links (intent SKILL:81 explicit gap) | **MISSING** | ResearchView.tsx:665 (`<b style={{ fontWeight: 700 }}>{p.title}</b>`) | Titles render as bold text, not as Links. Customer cannot click "What's new this week" entries to navigate to the item detail. Spec's "current state" block names this explicitly. |
| Source coverage matrix should reflect a real registry breadth signal (intent SKILL:81 calls hardcoded placeholder broken) | **PRESENT** (since Build 8.5) | ResearchView.tsx:828 to 977 backed by migration 100 RPC at supabase-server.ts:886 to 910 | The Build 8.5 wire-up reads real Research-category source counts per (mode, region). This element matches the spec's call for a non-placeholder matrix. |
| Phase-language should not leak into customer-facing UI (intent SKILL:321 anti-pattern) | **PRESENT in build** (no leak detected on /research) | ResearchView.tsx scanned, no "Phase", "Coming soon", "Phase D", etc. | The /research surface does not currently leak phase language. The anti-pattern is observed on /operations per intent SKILL:108, not on /research. |
| Source category mapping: `research_finding` (Research Summary), plus some `technology / innovation / tool` items as horizon-scan (intent SKILL:79 to 80) | **MIS-FRAMED** | supabase-server.ts:1086 to 1090 (filters by `sources.category='research'`) | The routing is by `sources.category`, not by `item_type`. Items whose source is Research-bound surface; items whose source is elsewhere but whose `item_type` is `research_finding` may not. Conversely, items whose source is Research-bound but whose substance is not horizon-scan still surface here. The skill's `item_type`-derived format-mapping (environmental SKILL:188 to 196) is bypassed by the source-category filter. |
| Editorial pipeline as internal-team view should NOT be customer-facing (intent SKILL:83 open question) | **PRESENT but unauthorized** | Entire ResearchView.tsx | The spec leaves open whether the editorial pipeline UI should be admin-only or whether Research should be repositioned. Currently the pipeline IS the customer-facing surface, with stage helper text exposing internal workflow vocabulary ("validator sign-off," "researcher building the file") to end users. This is presented to customers without the spec authorizing it as the customer surface. |
| Stage helpers expose internal team vocabulary | **PRESENT but anti-pattern** | ResearchView.tsx:155 ("Internal, researcher building the file"), :156 ("Awaiting validator sign-off") | These strings make the platform's internal editorial workflow visible to the paying customer. The spec's anti-pattern list (intent SKILL:308 to 326) does not name this specifically, but it parallels the "phase-language leak" anti-pattern in spirit: internal-state vocabulary surfaced to customers. |
| Filter affordances should respect dual posture, current verticals (art logistics, live events, luxury, automotive, humanitarian) AND expansion freight forwarding | **MISSING** | Filter bar (ResearchView.tsx:696 to 803) offers stage + region + free text only | No cargo-vertical filter exists at all. Region filter list (ResearchView.tsx:178) is hardcoded to 7 entries, none of which map to the workspace profile or dual posture. |
| Severity labels (ACTION REQUIRED, COST ALERT, WINDOW CLOSING, COMPETITIVE EDGE, MONITORING) optional on research summaries when decision pressure exists (environmental SKILL:153 to 161) | **MISSING** | PipelineRow renders pipeline_stage chip only | No severity chip on Research items. Customer cannot see which research findings carry decision pressure vs which are background monitoring. |
| Intersection Detection consumption, "per-item metadata strip rendered above each brief in detail view, showing both the intersection_summary and the resolved related_items list" (environmental SKILL:624 to 626) | **MISSING** | PipelineRow expanded panel (ResearchView.tsx:1235 to 1336) has no intersection_summary or related_items render | A Research finding that intersects a Regulations item or a Market Signal does not surface the linkage. The skill's headline intersection-readiness capability is invisible on /research. |
| `topic_tags` (seven-category vocabulary: emissions, fuels, transport, reporting, packaging, corridors, research) surfaced as filter or display dimension (environmental SKILL:493 to 507) | **MISSING** | Not referenced in ResearchView.tsx | Items carry topic_tags in the data layer but the surface does not filter or group by them. |
| Workspace-Anchored Rule applied to display (no company names; output anchored to the workspace's role / verticals) (environmental SKILL:82 to 96) | **PARTIALLY MISSING** | The surface displays platform-internal vocabulary ("researcher", "validator") rather than workspace-anchored framing | The rule applies to brief CONTENT, which is not rendered here in structured form, so the strict applicability is limited. But the surface chrome itself is not workspace-anchored either; it shows the platform's view of its own queue. |

---

## Section 4, Missing data shapes

The spec implies several data shapes that the current data layer does not produce or surface for /research.

### 4.1, Research Summary format rendering shape

The 6-section Research Summary format (environmental SKILL:449 to 477) is the binding output shape for `research_finding` items. Today's `intelligence_items` row carries `summary` (a single flattened text field, see supabase-server.ts:780) and `full_brief` (the markdown body, per environmental SKILL:740 to 752). The 6 sections live inside `full_brief` as top-level markdown headings, per environmental SKILL:744. The surface never parses or renders them as discrete sections. There is no `ResearchSummary` component, no per-section accordion, no "Talking Points" panel. To render the spec's contract, the data layer would need either:

- A markdown parser that extracts the 6 sections from `full_brief` (display-only, no schema change), OR
- A structured `research_summaries` table or columns that hold each section as a discrete field.

Neither exists. The data is there in `full_brief` text but the read path does not extract it.

### 4.2, Theme / topic_cluster entity

The operator framing names "themes" as the customer-meaningful organization unit ("What's emerging in my cargo type / route / regulatory domain"). There is no `themes` table, no `topic_clusters` table, no `theme_memberships` join table in the schema. The closest existing structure is `intelligence_items.topic_tags` (the 7-value closed vocabulary at environmental SKILL:493 to 507) and `operational_scenario_tags` (~36-value open vocabulary at environmental SKILL:515 to 531). Both are item-level metadata, not first-class theme entities. A theme-organized view would require either:

- Grouping by `topic_tags` (display-only, no schema change), OR
- A new `themes` entity with curated content and `intelligence_item_themes` membership table, OR
- A classifier-generated clustering on top of intelligence_items.

### 4.3, Vertical (cargo vertical) filtering data

The spec's dual-posture statement (intent SKILL:39 to 43) names verticals explicitly: art logistics, live events, luxury goods, automotive (classic, supercars, prototypes), humanitarian, plus expansion-cohort freight forwarding. The Research Summary's Section 2 demands "Filtered by cargo vertical and transport mode" (environmental SKILL:461). `intelligence_items` carries `verticals: string[]` (per types/intelligence.ts:87 in the IntelligenceItem interface). The ResearchView never reads or filters on it. The display path projection at supabase-server.ts:762 does not even select `verticals`. The data exists; the surface does not consume it.

### 4.4, Format-type discriminator

`format_type` is part of the binding YAML emission contract (environmental SKILL:765, 782 to 788) and would naturally drive which rendering component a Research item uses (Research Summary vs Technology Profile vs Market Signal Brief). The surface does not branch on `format_type` at all; every item renders as a pipeline row regardless of its underlying format. The data layer does not project `format_type` into the ResearchPipelineRow (supabase-server.ts:718 to 734). The discriminator is unused by the read path.

### 4.5, Severity label on Research items

Severity labels are mandatory on most formats and "optional but encouraged on research summaries when a finding has clear decision-pressure implications" (environmental SKILL:153 to 161). The data layer can carry `severity` (per the YAML emission contract at environmental SKILL:761 to 762). The display path does not project or render severity for /research items.

### 4.6, Intersection summary + related items consumption

`intersection_summary` (string) and `related_items` (UUID array) are mandatory YAML fields per environmental SKILL:768 to 770, and the skill explicitly names "per-item metadata strip rendered above each brief in detail view, showing both the intersection_summary and the resolved related_items list" as a downstream consumer (environmental SKILL:624 to 626). Neither field is projected by `fetchResearchPipelineRows` (supabase-server.ts:759 to 766) nor rendered by PipelineRow. The intersection-detection capability is invisible on /research even though the data plumbing is in place.

### 4.7, Cause-and-effect chain rendering shape

Cause / mechanical consequence / per-vertical effect (environmental SKILL:162 to 182) is a per-data-point requirement that lives inside `full_brief` markdown. Same situation as the Research Summary sections: data is in the markdown, never extracted by the read path, never rendered as a discrete structure on cards.

### 4.8, Editorial pipeline vs customer view separation

Currently `intelligence_items.pipeline_stage` (set via migration 026) drives the customer-facing surface. The spec's open question (intent SKILL:83) is whether the pipeline view should become admin-only. There is no separate admin route for the pipeline view; if Research is repositioned, the pipeline UI either needs to migrate to admin chrome or be removed. The schema field itself (`pipeline_stage`) is sound; the question is who consumes it.

---

## Section 5, Questions for the operator before rebuild

1. **Themes vs raw findings clustered vs synthesis briefs.** Should the rebuilt /research surface organize content by curated themes (operator-edited topic clusters with their own copy), by raw classifier-generated clusters of related findings, or by individual Research Summary briefs without any cluster layer? Each implies a different data-shape investment (themes table vs classifier run vs none).

2. **Editorial pipeline UI disposition.** The current pipeline view (Draft / Active Review / Published / Archived) is internal-team-useful. Does it stay as an admin-only route (e.g. `/admin/research-pipeline`), get removed entirely, or stay accessible to power users on a toggle? The spec leaves this open at intent SKILL:83.

3. **Format-type rendering scope.** The Research surface should host `research_finding` items (Research Summary format, 6 sections) and "some `technology, innovation, tool` items" as horizon-scan (Technology Profile format, 8 sections) per intent SKILL:79 to 80. Does the rebuilt surface render both formats with their full section structures, or does it surface a unified card abstraction that compresses both? If the former, that's two distinct rendering paths plus selection logic.

4. **Cargo vertical filter source of truth.** Should the cargo-vertical filter pull from `intelligence_items.verticals` (item-level), from the workspace's `sector_profile` (workspace-level personalization), or both? The dual-posture statement implies both, but the UI needs to make the priority explicit (do I see everything or only items tagged for my workspace's verticals by default).

5. **Provenance differentiation in display.** The spec emphasizes "named editorial provenance" as a Research discriminator (intent SKILL:74). Should the rebuild visually differentiate peer-reviewed academic vs think-tank vs analytical trade press vs quantified climate research at the card level (chips, color coding, separate sections), or treat them uniformly with provenance as a chip among others?

6. **Severity and intersection metadata on cards.** The Research Summary format treats severity as optional and intersection_summary as required by the YAML contract. Should the rebuilt card always render severity when present, always render intersection_summary when present, neither, or both behind a "show metadata" toggle? Surface real estate is finite.

7. **Cross-cutting "what's emerging" landing experience.** Should the rebuild's default landing be a chronological "what's emerging this week / month" feed (time-organized), a theme-organized hub ("Decarbonization findings", "Materials & packaging research"), a workspace-personalized feed (sector_profile-driven), or a hybrid (e.g. a hero "What's new" rail above thematic sections)?

---

## Audit caveats

- **Research-adjacent surfaces.** The dashboard at `/` (app/page.tsx) carries a five-surface widget powered by `getSurfaceCoverageSnapshot` (lib/dashboard/surface-coverage.ts:1 to 100). The widget counts `intelligence_items` where `item_type IN (research_finding)` for the Research bucket (surface-coverage.ts:49). This count uses `item_type`, not `sources.category`, so its semantics differ from `/research`'s display routing. The widget does not render Research content itself but does set the customer's expectation that "Research" is a known surface count, which the actual /research surface does not deliver against.
- **Detail pages.** Items linked from PipelineRow cards route to `/regulations/${id}` (ResearchView.tsx:1062), not to a Research-specific detail page. There is no `/research/[id]` route. A research_finding item shares its detail surface with regulations.
- **The category-routing wiring (Build 4) is sound.** The `get_research_items` RPC plus migration 084 source category mapping correctly identifies the Research-bound source set per the skill's enumeration. The gap is not in routing accuracy; it is that the SURFACE on top of the correctly-routed payload is a publication workflow, not a horizon-scan reading experience.
- **The Build 8 sub-dispatches (8.1 to 8.5) added credibility chips (citation count, recency, tier badge, bias tags), a freshness stripe, and the real source coverage matrix.** These are real value adds to the current surface but they enhance the pipeline framing rather than replace it. They do not close the spec gap; they polish the wrong artifact.
- **No phase-language leak detected on /research.** The spec's "Coming soon, Phase D" anti-pattern (intent SKILL:108, 321) is observed on /operations only; /research is clean of phase language. The anti-pattern that does apply here is "page scope drift" (intent SKILL:322), framed by the spec's "current state" block as a fundamental mismatch.
- **The spec's "current state" block already names this gap.** Lines 81 to 83 of caros-ledge-platform-intent SKILL.md acknowledge the editorial-pipeline mis-framing and leave the repositioning decision open. This audit confirms and quantifies what the spec author already flagged. The operator's diagnosis matches what the code actually does.

## Related

- [[spec-audit-operations-2026-05-23]] — The NREL Warehouse Solar-ROI item moved from Operations d=6 to Research d=7 under Migration 101; both audits track it
- [[spec-audit-market-intel-2026-05-23]] — Both flag tech/innovation item-type routing drift vs the item_type-derived Format Mapping (Technology Profile)
- [[build-8-research-surface]] — Directly audits the Build 8 (8.1-8.5) research surface work including the migration-100 coverage matrix this build shipped
- [[fix-d-scope-2026-05-23]] — Fix D /research surface limitation is absorbed by the Research rebuild per the synthesis; audit shares the item-type-canonical framing
- [[source-classification-framework-2026-05-10]] — get_research_items routing on sources.category=research derives from this classification framework
