# Handoff: Caro's Ledge surface rebuilds (May 2026)

## Overview

This bundle redesigns the **six customer-facing surfaces** (Regulations index, Regulations detail, Market Intel, Research, Operations, Community) plus the **two cross-cutting surfaces** (Map, Admin) of the Caro's Ledge platform — a $500/mo/workspace freight-sustainability intelligence SaaS for director-level operators at global freight forwarders.

The designs honour the bindings in the platform's SKILL specs:
- `caros-ledge-platform-intent` — five-surface model (Regulations, Market Intel, Research, Operations, Community) + cross-cutting capabilities
- `environmental-policy-and-innovation` — the five format families (Regulatory Fact Document 14-section, Research Summary 6-section, Operations Profile 8-section, Market Signal Brief 8-section, Technology Profile 8-section)
- `source-credibility-model` — the T1–T7 tier vocabulary + bias tags + 5-label severity vocabulary (Action required / Cost alert / Window closing / Competitive edge / Monitoring)

## About the design files

The HTML/CSS files in this bundle are **design references**, not production code. They are pixel-fidelity prototypes showing the intended look and behaviour of the rebuilt surfaces against the production design tokens (Plus Jakarta Sans + Anton, orange `#E8610A` primary, navy `#1E3A8A` secondary, navy-to-red 4px top accent line, white surface cards with subtle box-shadow).

The task for Claude Code is to **recreate these designs inside the existing fsi-app codebase** using its established patterns (Next.js + Tailwind from the production tokens already shipped), replacing the current broken or misframed components on the live site at `carosledge.com`. The files reference `shared/tokens.css` which mirrors the production token set already in the codebase.

## Fidelity

**High-fidelity.** Every colour, spacing, type-stack, and component pattern is pinned to the production design system. The visual output should match the prototypes pixel-for-pixel after recreation in the codebase's React/Next.js components.

## What's currently shipping vs what to build

### 1. `/regulations` (Regulations index) — `regulations.html`

**Currently:** Kanban view across 4 priority columns. Each column renders every card stacked — 51 / 80 / 84 / 179 cards visible, requiring 6+ screens of vertical scroll.

**Change:**
- Cap each priority column at **8 visible cards**, sorted by next-deadline ascending
- Add a **sticky "Open all N →"** button at the bottom of each column. On click, slide in a focus-sheet (60% viewport width, ESC-dismissible) showing the full list of that column with the page-level toolbar replicated inside
- Card content: jurisdiction kicker + title + (optional) due date
- Toolbar above (search · view toggle · sort · view icons · bulk-select · filters) matches production
- 4 priority stat tiles at top
- Sidebar nav order: Dashboard, Regulations (active), Market Intel, Research, Operations, Map, divider, Community

### 2. `/regulations/[slug]` (Regulations detail) — `regulations-detail.html`

**Currently:** 1 of 14 spec-mandated sections rendered as first-class UI. 14-section Regulatory Fact Document content lives inside an opaque "Full text" markdown expander.

**Change:**

1. **Hero block**: orange-left-accent card with mode-tabs (Air/Ocean/Road), regulation type pill, action urgency pill, large Anton uppercase title, deck paragraph, source tags, action buttons (Export brief · Share · Add to watchlist), metadata row
2. **AI prompt bar** below hero — orange-tinted, regulation-aware chips
3. **Tabbed sub-nav**: Summary (default) · Exposure · Penalty schedule · Timeline · Sources
4. **Two-tier summary system**: Summary switcher (Short / Full) pill toggle. Short = single blue-tinted block. Full = 6-segment grid card titled "Operational briefing" (What it is / requires / affects / costs / what to do / open questions) + full-width 7th "Read the source"
5. **Impact Assessment card**: 4-row gradient bars (Cost / Compliance / Client-Facing / Operational), gradient `low → moderate → high → critical`
6. **Why it matters** block — left-blue-accent card with editorial 2-paragraph rationale
7. **§-numbered structured sections**: render 10 of 14 always-populated sections as bordered cards with header bar (orange §N badge + section name + Always/Conditional tag) + italic summary + body
8. **Render order**: §3 Issues requiring immediate action → §4 Compliance chain → §8 Substantive requirements → §10 Registration & reporting → §11 Operational systems → §14 Confirmed regulatory timeline
9. **§5 / §6** (Authoritative / Anticipated guidance) render as orange-left-bar conditional cards when populated
10. **Sources rail** at bottom is `§15 Sources`: tier-coded source list (T1 red, T2 amber, T3 navy, T4 ink, T5 muted)
11. **No right-rail** — content full-width up to 1100px

### 3. `/market` (Market Intel) — `market-intel.html`

**Currently:** Generic news feed labeled "Energy & Technology Innovation" with mixed item types and a TRL framing.

**Change:**

1. **Severity legend strip** + **4 stat tiles**: Action required / Cost alert / Window closing / Monitor
2. **"Market Intel · what we track by signal type"** breakdown rail (3 cells): B1 Price · B2 Corporate & Capital · B3 Corridors & Routes
3. **AI prompt bar**
4. **Three signal bands** as bordered card sections, each with orange Bx badge + band name + count + italic summary
5. **B1 Price body**: 4-tile current-price snapshot row + Featured signal card (orange left accent, full Operations-card layout) with trajectory bars in right column (12-week sparkline) + non-featured signal cards
6. **B2 Corporate & B3 Corridors** bodies: featured signal card + standard signal cards (no trajectory bars)
7. **Right rail**: "Watch this week" + "Highest-priority indicators" + "Methodology" + "Sources tracked · 14"

### 4. `/research` (Research) — `research.html`

**Currently:** Generic editorial draft-staging queue shipped to customers, with Draft/Review/Published stage chips.

**Change:**

1. Same top frame as Market Intel: stat tiles + breakdown rail + AI prompt bar + filter row
2. **"Research · what we cover by theme"** breakdown rail (7 cells): Emissions accounting · Fuels & SAF · Packaging & circular · Carbon markets · Cold-chain & art · Last-mile EV · Disclosure regimes
3. **Theme-grouped findings sections**: each theme renders as bordered section with orange T1–T7 badge + theme name + count, italic summary, findings cards in Operations card layout
4. **One Featured finding** above all themes — Operations card layout, full content with byline, source tier pill, bias tags, "What it changes" + "Does NOT resolve" callouts
5. **Right rail**: "In your sector this week" + "Source coverage matrix" + "Methodology"
6. **Move the editorial pipeline to `/admin/research-pipeline`** — see Admin section below

### 5. `/operations` (Operations) — `operations.html`

**Currently:** Region accordions with chip-grid placeholders. Chip taxonomy is regex-matched titles.

**Change:**

1. Same top frame: priority legend + 4 stat tiles (Critical / High / Moderate / Low) + AI prompt bar + tabs (By Jurisdiction · Facility Data)
2. **"Operations · what we cover by dimension"** breakdown rail (6 cells): D1 Regulatory feasibility · D2 Regional resources · D3 Labor markets · D4 Materials sourcing · D5 Infrastructure · D6 Operational cost
3. **Coverage rail card** (right side): big number "5 jurisdictions with data of 54 in scope" + bar chart
4. **Region accordions** (`<details>`, EU open by default): globe icon + region name + priority pill + meta row
5. **Inside each region**, render all six D1–D6 dimensions as bordered sections with header (orange Dx badge + dimension name + count) + italic summary + body
6. **D1 Regulatory feasibility body**: regulation cards using the **Operations card layout** — orange left accent, item-head (severity pill + code + when), title h4, summary, byline, right column (severity pill + tier pill + due date + "What it changes" callout). Link to `/regulations/[slug]`.
7. **D2 / D3 / D4 / D5 / D6 bodies**: fact tables (NOT cards). Each row: label / value (with `var(--font-display)` numeric + unit / 4-week trend / source line). Every cell sourced and dated.
8. **Cross-surface "Pending changes that shift this region's calculus" panel** appears at the bottom of D6 in each region

### 6. `/community` (Community) — `community.html`

**Currently:** Generic forum, sidebar nav entry, no org context on authors, single-thread flat list.

**Change:**

1. Top frame: masthead + **5 tabs** (By Region & Group [default] · Industry Pulse · Hot Topics · People · Editorial Picks)
2. **Prominent "+ New post" composer** at top after tabs row
3. **"Activity by region" overview** — 4 region cards (Europe / Americas / APAC / MEAF), each with big thread number + meta + top-topics chip list
4. **"Topics this week, by region" matrix** — bordered card with topic name + subhead + region distribution chips + total count
5. **"Recent activity in your groups"** — group sections matching the Operations region pattern: group header (name + privacy pill + meta + topic chips) + 2–3 representative thread rows with avatars + full author identity line + footer with reply count + topic chips + → cross-surface reference chips + "All N threads in [Group] →" footer link
6. **Public forums in your network** — secondary group section list
7. **Right rail**: "Editor's pick · this week" + "Hot threads, last 24h" + "Orgs new to your network" + "Your groups · 4"

### 7. `/map` — `map.html`

**Currently:** Inline blob SVG with placeholder continents.

**Change:**

1. **Implement with OpenStreetMap via Leaflet** (operator Decision 6)
2. **Layout:** filter row top + 2-column grid (1fr map + 320px right rail)
3. **Map frame (left, large):** tile layer + sized urgency markers (radius scaled by item count, colour = worst priority) + community-activity ink dots (7px black) + Key/legend bottom-left of map frame + marker click → flyToJurisdiction. 900px min-height.
4. **Right rail (320px):** "Active heat" card + "By jurisdiction · click to fly" list + "Coverage gaps"

### 8. `/admin` — `admin.html`

**Currently:** 11-tab strip across top, Issues Queue above tabs.

**Change:**

1. Cost-tracking strip at top (4 cells): Month-to-date · Agent runs · Errors · Mode
2. **6 section cards** in 2-column grid replacing the 11-tab strip:
   - Section 1 · Workspaces
   - Section 2 · Sources (orange left accent when provisional reviews pending)
   - Section 3 · Ingest
   - Section 4 · Coverage
   - Section 5 · Research pipeline (editorial draft-staging moved out of customer `/research`)
   - Section 6 · Community pickups (editorial review queue for community → intel promotion)
3. **Issues queue rail** (right side, 360px) with orange top accent: ranked list with critical/high/zero-state visual treatment
4. Each Section card click → its destination view (canonical pattern); legacy 11-tab strip slated for retirement in a separate Admin Restructure dispatch

## Interactions & behaviour

- **Sidebar nav** sticky, 232px. 7 nav items in 2 groups separated by a horizontal rule: Dashboard / Regulations / Market Intel / Research / Operations / Map, then **divider**, then Community.
- **AI prompt bar** identical on every content page: orange-tinted pill row, sparkle icon, placeholder, orange Ask button. Beneath: 3–4 pre-populated chips contextual to the surface.
- **Tabs** under the AI bar use a 2px navy underline for active.
- **Region accordions** on Operations use `<details>`; first region (workspace's home) defaults open.
- **Map markers** use a sized circle with white border + ink shadow. Click fires `flyToJurisdiction(code)`.
- **Severity pills** (Action / Cost / Window / Edge / Monitor): Action=critical-red, Cost=high-amber, Window=moderate-yellow, Edge=secondary-navy, Monitor=text-muted-grey.

## Card pattern (shared across Operations D1, Market Intel signals, Research findings)

```
<a class="signal-card">
  <div class="body">
    <div class="item-head">
      <span class="severity-pill">Action required</span>
      <span class="kicker">price · featured · affects EU → US air</span>
      <span class="when">5 days ago · 4 sources converge</span>
    </div>
    <h4 class="title">Headline of the signal</h4>
    <p class="summary">Body paragraph with explanation, citations inline.</p>
    <p class="byline"><b>IEA</b> SAF Outlook Q2 2026 + <b>Argus</b> Bioenergy Weekly · T3 + T4</p>
  </div>
  <div class="right">
    <span class="severity-pill">Cost alert</span>
    <span class="tier-pill">T3 + T4</span>
    <!-- Optional: trajectory bars (price signals only) -->
    <div class="trajectory">…</div>
    <div class="changes-callout">
      <span class="lbl">What it changes</span>
      Q3 pass-through expected · +€84–€110 / chargeable kg
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

This section names the data shapes referenced by each surface that need to be projected through to the UI.

- **`intelligence_items.severity`** — 5-label vocabulary (Action required / Cost alert / Window closing / Competitive edge / Monitoring), mandatory.
- **`intelligence_items.signal_band`** — new field for Market Intel: enum of `price · corporate · corridor`.
- **`intelligence_items.signal_strength`** — new field for Market Intel: count of independent corroborating sources (1–5).
- **`intelligence_items.conversion_triggers`** — new JSONB field: array of `{event_label, expected_window, source_id}`.
- **`intelligence_item_sections`** — new table: one row per (item_id, section_key) for the structured §-numbered sections.
- **`community_posts.referenced_intelligence_item_ids`** — new uuid[] column populated when composer mentions intel item.
- **`profiles.org_id`, `profiles.workspace_role`, `profiles.sector`, `profiles.region`** — denormalize through posts API projection for author identity.
- **`sources.tier`** (1–7) — surface on every source pill site-wide.
- **`regions.operations_decisions`** + **`regional_data_facts`** — new tables for Operations D1–D6 content.

## Design tokens

All tokens live in `shared/tokens.css`. Key values:

**Colours**: `--color-primary` `#E8610A` (orange), `--color-secondary` `#1E3A8A` (navy), `--color-critical` `#DC2626`, `--color-high` `#D97706`, `--color-moderate` `#CA8A04`, `--color-low` `#059669`.

**Typography**: `--font-sans` Plus Jakarta Sans (primary); `--font-display` Anton (condensed all-caps for numbers + headings). Sizes 9–11px (kickers), 12–14px (body), 17–18px (card headlines), 22–28px (section headings), 44–56px (page titles / hero stats).

**Spacing**: Sidebar 232px, page content padding 40px L/R, detail-page max-width 1100px, right-rail 280–360px depending on page. `--radius-sm` 4px, `--radius-md` 8px, `--radius-pill` 999px.

**Top accent line** (every page): 4px high gradient `linear-gradient(90deg, #1E3A8A 0%, #DC2626 100%)`.

## Assets

No image assets in the design references. Production should use:
- Existing Caro's Ledge logo
- Lucide React or similar icon library for sidebar nav glyphs (currently Unicode placeholders — replace with real icons)
- OpenStreetMap via Leaflet for map tiles (operator Decision 6)

## Sequencing

1. **Sequence A — tactical fixes**: em-dash sweep, dead-route deletions, spec-doc corrections.
2. **Sequence B — cross-cutting decisions** (operator action): 5 questions to settle before rebuild scoping.
3. **Sequence C — substantive rebuilds**:
   1. Research (cleanest spec, highest leverage)
   2. Operations (named decisions, concrete)
   3. Market Intel (depends on Decision 04 — severity vocabulary)
   4. Community (depends on Decision 03 — cross-surface integration)
   5. Regulations Detail (depends on Decision 02 — format binding)
4. **Parallel**: Dashboard refinement, Map refinement, Admin reorganization.

## Files in this bundle

- `README.md` — this document
- `operations.html` — Operations rebuild
- `regulations.html` — Regulations index rebuild (Kanban with truncation pattern)
- `regulations-detail.html` — Regulations detail rebuild (14-section reader with summary switcher + Impact Assessment + structured §-numbered sections)
- `market-intel.html` — Market Intel rebuild (3 signal bands + 5-label severity + trajectory bars)
- `research.html` — Research rebuild (7-theme horizon scan + Research Summary 6-section findings)
- `community.html` — Community rebuild (region-and-group structured, author identity, topic-by-region matrix, 5 tabs)
- `map.html` — Map placeholder (production: OSM via Leaflet)
- `admin.html` — Admin rebuild (6 sections replacing 11 tabs)
- `shared/tokens.css` — Design tokens mirror of production

## Final notes

- **Production styling preserved.** These designs use the production tokens exactly. Plus Jakarta Sans for body, Anton for display, orange `#E8610A` for primary accents, navy `#1E3A8A` for secondary. No font swaps. No new colour additions.
- **Operations card pattern is the master.** Every signal card on Market Intel, every finding on Research, every regulation reference on Operations D1, and every signal-card-style block on the Regulations detail page uses the same grid (`1fr 220px`), the same item-head layout, the same right-column stacking, the same "What it changes" callout treatment. Match this pattern exactly when recreating any card-shaped content in the codebase.
- **D2-D6 are fact tables, NOT cards.** Per Section 5 item 7. The visual asymmetry between D1 (cards) and D2-D6 (tables) is intentional and content-driven: D1 = regulation cross-references that click into /regulations/[slug]; D2-D6 = sourced operational facts where the value IS the value, not a link target.
- **Community 5 tabs ARE the design.** Per Section 6. Each tab is a real view, not a placeholder. By Region & Group (default) + Industry Pulse + Hot Topics + People + Editorial Picks.
