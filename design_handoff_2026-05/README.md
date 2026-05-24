# Handoff: Caro's Ledge surface rebuilds (May 2026)

## Overview

This bundle redesigns the **six customer-facing surfaces** (Regulations index, Regulations detail, Market Intel, Research, Operations, Community) plus the **two cross-cutting surfaces** (Map, Admin) of the Caro's Ledge platform, a $500/mo/workspace freight-sustainability intelligence SaaS for director-level operators at global freight forwarders.

The designs honour the bindings in the platform's SKILL specs:
- `caros-ledge-platform-intent`, five-surface model (Regulations, Market Intel, Research, Operations, Community) + cross-cutting capabilities
- `environmental-policy-and-innovation`, the five format families (Regulatory Fact Document 14-section, Research Summary 6-section, Operations Profile 8-section, Market Signal Brief 8-section, Technology Profile 8-section)
- `source-credibility-model`, the T1-T7 tier vocabulary + bias tags + 5-label severity vocabulary (Action required / Cost alert / Window closing / Competitive edge / Monitoring)

## About the design files

The HTML/CSS files in this bundle are **design references**, not production code. They are pixel-fidelity prototypes showing the intended look and behaviour of the rebuilt surfaces against the production design tokens (Plus Jakarta Sans + Anton, orange `#E8610A` primary, navy `#1E3A8A` secondary, navy-to-red 4px top accent line, white surface cards with subtle box-shadow).

The task for Claude Code is to **recreate these designs inside the existing fsi-app codebase** using its established patterns (Next.js + Tailwind from the production tokens already shipped), replacing the current broken or misframed components on the live site at `carosledge.com`. The files reference `shared/tokens.css` which mirrors the production token set already in the codebase (`colors_and_type.css` in the design system project).

## Fidelity

**High-fidelity.** Every colour, spacing, type-stack, and component pattern is pinned to the production design system. The visual output should match the prototypes pixel-for-pixel after recreation in the codebase's React/Next.js components.

## What's currently shipping vs what to build

This section is the diff. For each surface, the current production state, the audit's finding, and the explicit change Claude Code should make.

### 1. `/regulations` (Regulations index), `regulations.html`

**Currently:** Kanban view across 4 priority columns (Immediate action / High / Moderate / Low). Each column renders every card stacked, 51 / 80 / 84 / 179 cards visible, requiring 6+ screens of vertical scroll.

**Audit finding:** Customer's first-screen scan is broken. The 4 priority columns are correct but each must be capped.

**Change:**
- Cap each priority column at **8 visible cards**, sorted by next-deadline ascending
- Add a **sticky "Open all N"** button at the bottom of each column. On click, slide in a focus-sheet (60% viewport width, ESC-dismissible) showing the full list of that column with the page-level toolbar (search, sort, filters) replicated inside
- Card content stays simple: jurisdiction kicker + title + (optional) due date
- Toolbar above (search, view toggle, sort by Newest/Priority/Confidence/A-Z, view icons cards/list/table, bulk-select, filters dropdown) matches production
- 4 priority stat tiles at top match production exactly; no "what we cover by topic" rail (the user rejected adding it)
- Sidebar nav order: Dashboard, Regulations (active), Market Intel, Research, Operations, Map, divider, Community

### 2. `/regulations/[slug]` (Regulations detail), `regulations-detail.html`

**Currently:** 1 of 14 spec-mandated sections rendered as first-class UI. The 14-section Regulatory Fact Document content lives inside an opaque "Full text" markdown expander.

**Audit finding:** The detail page is the primary value surface. Reader can't scan to find substantive requirements, immediate actions, or pending guidance without reading the entire markdown blob.

**Change:**

1. **Hero block** at top: orange-left-accent card with mode-tabs (Air/Ocean/Road), regulation type pill ("Regulation"), action urgency pill ("Immediate" / "Watch" / "Reference"), large Anton uppercase title, deck paragraph, source tags (EUR-Lex, EU law, Delegated act, Primary, T1), action buttons (Export brief, Share, Add to watchlist), metadata row (jurisdiction, ID, publication date, review date)

2. **AI prompt bar** below hero, orange-tinted with placeholder copy regulation-aware, chips ("What does this mean for me?" / "When does this hit force?" / "Who's affected?")

3. **Tabbed sub-nav** under AI bar: Summary (default), Exposure, Penalty calculator, Timeline, Sources

4. **Two-tier summary system**, this is the key spec addition. Replace the single "AI Plain-Language Summary" block with:
   - **Summary switcher** (pill toggle): Short summary | Full summary
   - **Short summary** view (default): single blue-tinted block with the AI-generated ~3-line plain-language summary
   - **Full summary** view: 6-segment grid (2 col) inside a card titled "Operational briefing": (1) What it is, (2) What it requires, (3) Who it affects, (4) What it costs, (5) What to do, (6) Open questions. Plus a full-width 7th segment "Read the source" linking down to the structured sections below.

5. **Impact Assessment card** below summary: 4-row gradient bars (Cost Impact, Compliance Obligation, Client-Facing, Operational), each bar uses a `low to moderate to high to critical` gradient fill, score displayed as fraction + label ("3/3, High")

6. **Why it matters** block, left-blue-accent card with editorial 2-paragraph rationale

7. **Section-numbered structured sections** below, render the 10 of 14 always-populated sections as bordered cards with:
   - Header bar (raised background, 2px ink rule beneath): orange section badge + section name in heavy uppercase + section tag pill ("Always, N" or "Conditional, N")
   - Sec summary italic line under header
   - Sec body content

8. **Render order**: §3 Issues requiring immediate action (3-item numbered list with severity chips on right), §4 Compliance chain (prose with role highlights), §8 Substantive requirements (table: obligation / deadline / status / next action), §10 Registration & reporting, §11 Operational systems, §14 Confirmed regulatory timeline (past / future split, future rows with raised-background highlight)

9. **§5 / §6** (Authoritative guidance / Anticipated guidance) render as orange-left-bar **conditional** cards (amber tag pill) when populated

10. **Sources rail** at bottom is now `§15 Sources` as another bordered section: tier-coded source list (T1 critical-red border, T2 high-amber, T3 secondary-blue, T4 ink, T5 muted-grey)

11. **No right-rail** on this page, content is full-width up to 1100px

### 3. `/market` (Market Intel), `market-intel.html`

**Currently:** Generic news feed labeled "Energy & Technology Innovation" with mixed item types and a TRL framing.

**Audit finding:** Wrong information architecture. Spec calls for industry signals organized by signal type (Price, Corporate & capital, Corridors).

**Change:**

1. **Severity legend strip** + **4 stat tiles** at top matching Operations / Regulations: Action required / Cost alert / Window closing / Monitor

2. **"Market Intel, what we track by signal type"** breakdown rail (3 cells): B1 Price Signals, B2 Corporate & Capital, B3 Corridors & Routes, each showing active count + subcategory list + count of critical items

3. **AI prompt bar**

4. **Three signal bands** as bordered card sections, each with:
   - Header bar with orange Bx badge + band name + count
   - Italic band-summary line
   - Body content

5. **B1 Price Signals body:**
   - 4-tile current-price snapshot row (SAF / EUA / Jet A-1 / Diesel) with 4-week delta
   - Featured signal card (orange left accent, full Operations-card layout, see "Card pattern" below) with **trajectory bars** in right column (12-week sparkline, sourced from Argus / ICE / IEA / Platts weekly data, base 100 = Feb 2026 spot, colour grades cool-to-oxblood for upward trend)
   - Non-featured signal cards (same Operations card layout, no trajectory bars unless the signal has time-series data)

6. **B2 Corporate & Capital** + **B3 Corridors & Routes** bodies: featured signal card + standard signal cards (no trajectory bars, these signal types have no continuous index to plot)

7. **Right rail:** "Watch this week, click to filter" card (counts of action-required + cost alerts), "Highest-priority indicators" card (top 5-6 named signals with sparkline arrow), "Methodology" card (explains the 5-label severity vocabulary + Intelligence Assistant cross-cutting role), "Sources tracked, 14" card (named publishers)

### 4. `/research` (Research), `research.html`

**Currently:** Generic editorial draft-staging queue ("Research Pipeline") shipped to customers, with Draft/Review/Published stage chips and per-stage helper text.

**Audit finding:** Editorial pipeline is platform-internal chrome, should live at `/admin/research-pipeline`. The customer-facing `/research` should be a **horizon-scan destination** for peer-reviewed journals, think tanks (IEA, IRENA, IPCC, ICCT, Project Drawdown), and named analytical press (Loadstar, FreightWaves Sustainability, Edie, GreenBiz, Environmental Finance, Reuters Sustainable Business).

**Change:**

1. Same top frame as Market Intel: 4 stat tiles + breakdown rail + AI prompt bar + filter row

2. **"Research, what we cover by theme"** breakdown rail (7 cells from the spec's topic-tag vocabulary): Emissions accounting, Fuels & SAF, Packaging & circular, Carbon markets, Cold-chain & art, Last-mile EV, Disclosure regimes, each cell shows "N new" count + 1-line topic summary + (when applicable) "<b>N affect your verticals</b>" marker

3. **Theme-grouped findings sections** below the breakdown rail. Each theme renders as a bordered section card matching the Market Intel band pattern:
   - Header bar with orange T1-T7 badge (theme number) + theme name + count
   - Italic theme-summary line explaining what the theme covers and why it matters
   - Body containing the findings cards for that theme, each in the Operations card layout
   - Sticky "+ N more in this theme" footer

4. **One Featured finding** above all themes, same Operations card layout, full content with byline, source tier pill, bias tags, "What it changes" + "Does NOT resolve" callouts in the right column

5. **Right rail:** "In your sector this week" card (count + explanation), "Source coverage matrix" card (Peer-reviewed / Think tank / Quantified research / Analytical press / Reuters Sustainable Business counts), "Methodology" card

6. **Move the editorial pipeline to `/admin/research-pipeline`**, see Admin section below

### 5. `/operations` (Operations), `operations.html`

**Currently:** Region accordions with chip-grid placeholders. Chip taxonomy is regex-matched titles, not first-class data.

**Audit finding:** Right idea (per-region intelligence) but underdeveloped. Spec calls for six dimensions per region with sourced, dated facts.

**Change:**

1. Same top frame: priority legend + 4 stat tiles (Critical / High / Moderate / Low) + AI prompt bar + tabs (By Jurisdiction, Facility Data)

2. **"Operations, what we cover by dimension"** breakdown rail (6 cells): D1 Regulatory feasibility, D2 Regional resources, D3 Labor markets, D4 Materials sourcing, D5 Infrastructure, D6 Operational cost, each cell shows coverage fraction ("5/5 jurisdictions") + gap notes ("gaps in UAE, UK, HK")

3. **Coverage rail card** (right side) with big number "5 jurisdictions with data of 54 in scope" + bar chart

4. **Region accordions** (`<details>` elements, EU open by default). Each accordion summary shows: globe icon + region name + priority pill (Critical/High/Moderate) + meta row (data points, regulations, citations, last updated)

5. **Inside each region**, render all six D1-D6 dimensions as bordered cards:
   - Header bar (raised background, 1px border-subtle below): orange Dx badge in `var(--font-display)` + dimension name in heavy uppercase + count/note on right (e.g. "12 regulations apply to your workspace, 3 with deadlines < 90d")
   - Italic dimension-summary line ("Loaded-cost wages and workforce availability for warehouse, driver, and art-handler roles. Inputs to automation-vs-hire and capacity decisions.")
   - Dimension body content

6. **D1 Regulatory feasibility body**: regulation cards using the **Operations card layout** (see "Card pattern" below), orange left accent, item-head (severity pill + code + when), title h4, summary paragraph, byline, right column with severity pill + tier pill + due date + "What it changes" callout. Link to `/regulations/[slug]`.

7. **D2 / D3 / D4 / D5 / D6 bodies**: fact tables (not cards). Each row: label / value (with `var(--font-display)` numeric + unit / 4-week trend / source line). Every cell sourced and dated.

8. **Cross-surface "Pending changes that shift this region's calculus" panel** appears at the bottom of D6 in each region: pulls related items from `/regulations` and `/market` via the intersection_summary projection. Each row tagged "REG" or "MKT" in brass-coloured kicker.

### 6. `/community` (Community), `community.html`

**Currently:** Generic forum, sidebar nav entry, "How publishing works" rail dominating, no org context on authors, single-thread flat list.

**Audit finding:** Spec calls Community "co-equal with the four intelligence pages." Right now it's a generic forum. Needs author identity (org + role + sector + region), region/group structure, and topic-by-region clustering.

**Change:**

1. Top frame: masthead + 5 tabs (By Region & Group [default], Industry Pulse, Hot Topics, People, Editorial Picks)

2. **Prominent "+ New post" composer** at top after tabs row (orange avatar circle + input + orange Post button)

3. **"Activity by region" overview**, 4 region cards (Europe / Americas / APAC / MEAF), each showing big number of threads + meta (groups, orgs active) + top-topics chip list

4. **"Topics this week, by region" matrix**, bordered card with rows like:
   - Topic name + subhead (CBAM Article 30, indirect-importer, charter filing)
   - Region distribution chips (EU 18, UK 4, Americas 1)
   - Total count

5. **"Recent activity in your groups"**, group sections (one per workspace group) matching the Operations region pattern:
   - Group header: name + privacy pill (Private / Public) + meta (members, orgs, threads this week, last active) + topic chips
   - 2-3 representative thread rows with avatars (verified when org-verified), full author identity line (name, org-in-orange, role, vertical, region), thread title h4, footer with reply count + topic chips + cross-surface reference chips
   - "All N threads in [Group]" footer link

6. **Public forums in your network**, secondary group section list

7. **Right rail:** "Editor's pick, this week" card (promoted thread, intel brief link), "Hot threads, last 24h" ranked list, "Orgs new to your network" card, "Your groups, 4" navigation list

### 7. `/map`, `map.html`

**Currently:** Inline blob SVG with placeholder continents.

**Audit finding:** Architecture is correct (regulations by jurisdiction) but rendering needs a real map library.

**Change:**

1. **Implement with Mapbox GL, Leaflet, or Google Maps** (operator's choice, the platform already has a tile provider preference in the design system specs)

2. **Layout:** filter row at top (Modes, Priority, Regions), then 2-column grid below: 1fr map frame + 320px right rail

3. **Map frame (left, large):**
   - Renders the chosen tile layer
   - Urgency markers as positioned overlays per jurisdiction: circle radius scaled by item count, colour = worst-priority urgency (critical-red / high-amber / moderate-yellow)
   - Each marker shows item count number in `var(--font-display)` centred
   - Community-activity ink dots (small black 7px dots) appear under markers where the jurisdiction has active Community threads
   - **Key/legend** anchored bottom-left of the map frame (not the right rail): "Key" label + 4 rows (Critical, 1+ items / High / Moderate / Community activity)
   - Marker click, fly to + open jurisdiction drawer
   - 900px min-height

4. **Right rail (320px):**
   - "Active heat" card (oxblood top accent): big number of jurisdictions with critical items + summary copy
   - "By jurisdiction, click to fly" list: rows with bold jurisdiction name + italic top-categories subhead + critical-coloured count chip on right
   - "Coverage gaps" card listing sub-national gaps

### 8. `/admin`, `admin.html`

**Currently:** 11-tab strip across top, Issues Queue above tabs, sprawling.

**Audit finding:** Operator chrome, but the 11 tabs encode three different operator jobs (workspaces, sources, ingest/coverage). Should be grouped.

**Change:**

1. Cost-tracking strip at top (4 cells): Month-to-date, Agent runs, Errors, Mode (Read-only)

2. **6 section cards** in 2-column grid replacing the 11-tab strip:
   - Section 1, Workspaces (Organizations, members, invitations)
   - Section 2, Sources (Registry, bulk add, provisional candidates), wears the orange left accent because of pending provisional reviews
   - Section 3, Ingest (Staged updates, integrity flags, rejections)
   - Section 4, Coverage (Jurisdiction review, matrix, gaps)
   - Section 5, Research pipeline (Editorial draft-staging that was moved out of customer `/research`)
   - Section 6, Community pickups (Editorial review queue for community to intel promotion)

3. **Issues queue rail** (right side, 360px) with orange top accent: ranked list of needs-attention rows with critical/high/zero-state visual treatment

4. Each Section card click, its own sub-page with the previously-tab'd sub-views inside

## Interactions & behaviour

- **Sidebar nav** is sticky, 232px wide. The 7 nav items live in two groups separated by a horizontal rule: Dashboard / Regulations / Market Intel / Research / Operations / Map, then **divider**, then Community. The divider visually expresses Community's distinct role (peer information sharing across forwarders, not intelligence content).
- **AI prompt bar** is identical on every content page: orange-tinted pill row with sparkle icon, placeholder input, orange Ask button. Beneath: 3-4 pre-populated query chips contextual to the surface.
- **Tabs** under the AI bar (where present) use a 2px navy underline for the active tab.
- **Region accordions** on Operations use a `<details>` element; first region (workspace's home region) defaults open.
- **Map markers** use a sized circle with white border + ink shadow. Click fires a `flyToJurisdiction(code)` callback.
- **Severity pills** (Action / Cost / Window / Edge / Monitor) use the 5-label vocabulary mapped to colour: Action=critical-red, Cost=high-amber, Window=moderate-yellow, Edge=secondary-navy, Monitor=text-muted-grey.

## Card pattern (shared across Operations D1, Market Intel signals, Research findings)

```
<a class="signal-card">
  <div class="body">
    <div class="item-head">
      <span class="severity-pill">Action required</span>
      <span class="kicker">price, featured, affects EU to US air</span>
      <span class="when">5 days ago, 4 sources converge</span>
    </div>
    <h4 class="title">Headline of the signal</h4>
    <p class="summary">Body paragraph with explanation, citations inline.</p>
    <p class="byline"><b>IEA</b> SAF Outlook Q2 2026 + <b>Argus</b> Bioenergy Weekly, T3 + T4</p>
  </div>
  <div class="right">
    <span class="severity-pill">Cost alert</span>
    <span class="tier-pill">T3 + T4</span>
    <!-- Optional: trajectory bars (price signals only) -->
    <div class="trajectory">...</div>
    <div class="changes-callout">
      <span class="lbl">What it changes</span>
      Q3 pass-through expected, +EUR 84-110 / chargeable kg
    </div>
    <!-- Optional: conversion-trigger callout in muted treatment -->
    <div class="changes-callout muted">
      <span class="lbl">Conversion trigger</span>
      CORSIA Phase 2 review, Q4 2026
    </div>
  </div>
</a>
```

CSS layout:
- Grid: `1fr 220px` with `22px` gap
- Card: white surface, `1px solid var(--color-border)`, `3px solid var(--color-primary)` left border, `radius-sm`, `shadow-card` box-shadow
- Hover: `shadow-card-hover`
- Body header has severity chip with strong colour contrast, then ALL-CAPS small kicker, then muted right-aligned when stamp

## State management

This section names the data shapes referenced by each surface that need to be projected through to the UI. Use the existing fsi-app data model where these already exist; add the missing ones.

- **`intelligence_items.severity`**, must be projected end-to-end. The 5-label vocabulary (Action required / Cost alert / Window closing / Competitive edge / Monitoring) is mandatory per `environmental-policy-and-innovation` spec. Replace current 4-tier lifecycle pills wherever they appear.
- **`intelligence_items.signal_band`**, new field for Market Intel: enum of `price, corporate, corridor` driving band placement.
- **`intelligence_items.signal_strength`**, new field for Market Intel: count of independent corroborating sources (1-5) per `source-credibility-model §8`.
- **`intelligence_items.conversion_triggers`**, new JSONB field: array of `{event_label, expected_window, source_id}` driving §3 of Market Signal Brief.
- **`intelligence_item_sections`**, new table (or robust agent-side markdown extractor): one row per (item_id, section_key) for the structured Regulatory Fact / Research Summary / Operations Profile / Market Signal Brief sections. This is what makes the Regulations detail page render structured section-numbered sections instead of opaque markdown.
- **`community_posts.referenced_intelligence_item_ids`**, new uuid[] column populated when the composer mentions `@reg:CBAM-2026-DA-14` or pastes an intel URL. Drives the "Peer discussion, N threads" panel on intel detail pages and the cross-surface reference chips on community threads.
- **`profiles.org_id`, `profiles.workspace_role`, `profiles.sector`, `profiles.region`**, denormalize through the posts API projection so author identity renders on every Community thread.
- **`sources.tier`** (1-7), already exists; surface on every source pill site-wide. Confidence facet rename to Tier.
- **`regions.operations_decisions`** + **`regional_data_facts`**, new tables for Operations D1-D6 content. Schema in the brief at `/briefs/04-operations.html`.

## Design tokens

All tokens live in `shared/tokens.css` (which mirrors the production `colors_and_type.css`). Key values:

**Colours**
- `--color-primary` `#E8610A` (orange, primary actions, accent left-borders, kickers)
- `--color-secondary` `#1E3A8A` (navy, masthead eyebrow, tabs active)
- `--color-critical` `#DC2626` (Action required, critical priority)
- `--color-critical-bg` `#FEF2F2`
- `--color-critical-border` `#FECACA`
- `--color-high` `#D97706` (Cost alert, high priority)
- `--color-moderate` `#CA8A04` (Window closing, moderate priority)
- `--color-low` `#059669` (Background, low priority, green)
- `--color-text-primary` ink
- `--color-text-secondary`
- `--color-text-muted`
- `--color-surface` white
- `--color-surface-raised` paper-tinted card background
- `--color-bg-base` page background
- `--color-bg-ai-strip` orange-tinted AI prompt bar background
- `--color-border` `#E5E5E5`
- `--color-border-subtle`
- `--color-border-ai` orange-tinted

**Typography**
- `--font-sans` Plus Jakarta Sans, primary
- `--font-display` Anton, condensed all-caps for numbers + headings
- Sizes: 9-11px (kickers / labels), 12-14px (body), 17-18px (card headlines), 22-28px (section headings), 44-56px (page titles / hero stats)
- Letter-spacing: `0.14-0.18em` on uppercase kicker labels; `0.02-0.03em` on Anton page titles

**Spacing / structure**
- Sidebar: 232px
- Page max-width: full (content padding 40px left/right)
- Detail-page content max-width: 1100px
- Right-rail: 280-360px depending on page
- `--radius-sm` 4px, `--radius-md` 8px, `--radius-pill` 999px
- `--shadow-card` subtle 1px-2px elevation
- `--transition-base` 0.2s ease

**Top accent line** (every page): 4px high gradient `linear-gradient(90deg, #1E3A8A 0%, #DC2626 100%)`

## Assets

No image assets in the design references. Production should use:
- Existing Caro's Ledge logo (already in fsi-app)
- Lucide React or similar icon library for sidebar nav glyphs (currently shown as Unicode placeholders, replace with real icons)
- Map tile provider per operator decision (Mapbox GL recommended)

## Sequencing

The full audit dossier in the source project lists these in dispatch order. Quick reference:

1. **Sequence A, tactical fixes** (single small dispatch): em-dash sweep, dead-route deletions, spec-doc corrections. Not in this bundle's scope.
2. **Sequence B, cross-cutting decisions** (operator action): 5 questions to settle before rebuild scoping. See `briefs/00-cross-cutting.html` in source project.
3. **Sequence C, substantive rebuilds** in this recommended order:
   1. Research (cleanest spec, highest leverage)
   2. Operations (named decisions, concrete)
   3. Market Intel (depends on Decision 04, severity vocabulary)
   4. Community (depends on Decision 03, cross-surface integration)
   5. Regulations Detail (depends on Decision 02, format binding)
4. **Parallel:** Dashboard refinement, Map refinement, Admin reorganization, small fixes runnable alongside any Sequence C dispatch.

## Final notes

- **Production styling preserved.** These designs use the production tokens exactly. Plus Jakarta Sans for body, Anton for display, orange `#E8610A` for primary accents, navy `#1E3A8A` for secondary. No font swaps. No new colour additions.
- **Operations card pattern is the master.** Every signal card on Market Intel, every finding on Research, every regulation reference on Operations D1, and every signal-card-style block on the Regulations detail page uses the same grid (`1fr 220px`), the same item-head layout, the same right-column stacking, the same "What it changes" callout treatment. Match this pattern exactly when recreating any card-shaped content in the codebase.
- **Audit references.** The 8 audit documents in the source project enumerate the specific code-level mismatches (file paths, line numbers, components). Use them when you need to find what currently exists and rip it out.
