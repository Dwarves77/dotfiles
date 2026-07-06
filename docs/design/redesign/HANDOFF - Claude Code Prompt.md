# CARO'S LEDGE — UI IMPLEMENTATION HANDOFF
## Prompt for Claude Code · v1 · July 3, 2026

You are implementing an approved UI redesign of Caro's Ledge (carosledge.com), a freight-sustainability regulatory-intelligence platform, in the **existing Next.js + Tailwind + shadcn/ui codebase** (`fsi-app/`). This is an incremental, template-by-template migration — **no big-bang rewrite, no new framework, no new component library.**

---

## 0. SOURCE OF TRUTH

The approved design is a set of 11 standalone HTML mocks shipped alongside this prompt. Open them in a browser; they are interactive and self-contained:

1. `Pages - 01 Dashboard.dc.html`
2. `Pages - 02 Regulations.dc.html` — archetype for ALL index pages
3. `Pages - 03 Regulation Detail.dc.html` — archetype for ALL detail/reader pages
4. `Pages - 04 Market Intel.dc.html`
5. `Pages - 05 Signal Detail.dc.html`
6. `Pages - 06 Research.dc.html`
7. `Pages - 07 Operations.dc.html`
8. `Pages - 08 Admin.dc.html`
9. `Pages - 09 Map.dc.html`
10. `Pages - 10 Account.dc.html` — standard user surface (profile + settings + user menu)
11. `Pages - 11 Community.dc.html`

Precedence rules:
- **Layout, hierarchy, spacing, color, interaction pattern → the mock wins.** Lift exact values from the mock markup (inline styles carry the real px/hex).
- **Content, counts, dates → the production database wins.** Mock numbers are real snapshots from the live registry (94 regulations, 1,328 queue items, WTI $95.96…); wire the same fields, never hard-code the snapshot.
- **Anything in the mock labeled "Engineering note" is an instruction to you, not UI copy to render.**

---

## 1. NON-NEGOTIABLE PRODUCT RULES

1. **No invented data, ever.** If a field has no sourced value, render the honest-pending pattern (§4), never a placeholder number, never an inherited average. State law is state-level data — a US state without a sourced figure shows pending, not a national number.
2. **Counts are computed, never hard-coded.** Every badge/total derives from the rows it summarizes (the Admin issues-queue total is `sum(queue rows)`). A badge that can contradict its list is a bug.
3. **No internal machinery in customer copy.** No schema names, no gapped section numbers, no "Always · 5" scheduling strings, no seed/fallback identifiers.
4. **Epistemic grammar is sacred** (§3). A reader must always know at a glance: law, signal, or our analysis.
5. **Editorial register.** Sentence case everywhere; ALL-CAPS only for eyebrows/tags (tracked, small); no emoji; no exclamation points; quantified urgency ("48 hours to close"), not adjectival.

---

## 2. DESIGN TOKENS (map to Tailwind config / CSS vars)

### Color
| Token | Value | Use |
|---|---|---|
| `bg-page` | `#FAFAF8` | app background |
| `bg-card` | `#FFFFFF` | cards/panels |
| `bg-plate` | `#F5F2EE` | section-header plates, avatar bg |
| `bg-accent-tint` | `#FFF7F0` / `rgba(232,97,10,0.09)` | selected/active tint |
| `ink` | `#1A1A1A` | primary text, active chips |
| `ink-secondary` | `#5A6B67` | secondary text, nav resting |
| `ink-muted` | `#7A6E6C` | meta, timestamps, eyebrows-on-cards |
| `accent` | `#E8610A` (hover `#D05509`) | THE action color: primary buttons, active nav, links |
| `accent-blue` | `#2563EB` | eyebrow/volume line, T-tier badges, VERIFIED |
| `sev-critical` | `#DC2626` | critical/immediate |
| `sev-high` | `#E8610A` | high |
| `sev-moderate` | `#CA8A04` | moderate |
| `sev-low` | `#16A34A` | low/awareness/background band |
| `epistemic-signal` | `#B45309` | unverified/early-signal (always with DASHED border) |
| `destructive-quiet` | `#9A3412` | Ban/Delete text actions |
| `brass` | `#8A6A2A` | pending-frame headers, theme eyebrows |
| `hairline` | `rgba(0,0,0,0.06–0.12)` | dividers/borders (0.12 card border, 0.06–0.08 row rules) |

### Type
- **Anton** (Google Fonts) — mastheads, page titles (uppercase, 42px/1.0, letter-spacing 0.02em), section headers (26px), big figures (20–38px). Never for body.
- **Plus Jakarta Sans** — everything else. Body 12–13.5px; card titles 13–14.5px/800; eyebrows 9–10.5px/800, letter-spacing 0.10–0.18em, uppercase.
- Key figures: Anton, in the severity color of their context.

### Geometry
- Sidebar 208px fixed, sticky. Content padding 26–36px. Rails 300–320px.
- Radii: cards/panels 8px; buttons/inputs 6px; chips 999px (pills) or 4px (tag chips). 4px masthead strip: `linear-gradient(90deg,#E8610A 0%,#2563EB 100%)` — identical on every page.
- No box-shadows anywhere. Elevation = hairline border + background step.
- Grids: `gap` everywhere, never margin-stacked siblings. Tile grids `repeat(auto-fill,minmax(200–250px,1fr))`.

---

## 3. THE EPISTEMIC GRAMMAR (centerpiece — apply everywhere)

Three states, one visual language, identical on briefs, cards, map, sources, community:

1. **VERIFIED FACT** — blue `#2563EB`. Solid 1px border chip, `Verified` / tier badge `T1–T7` (blue chip). Citations attached.
2. **EARLY SIGNAL** — amber `#B45309`. **Dashed** 1px border chip: `Unverified · early report` / `Unverified · peer signal`. Dashed = not yet load-bearing, by design.
3. **LABELED ANALYSIS** — ink on paper, prefixed label in caps: `OUR ANALYSIS · DO NOW`, `Analytical inference`, `Operational implication`, `Legal confirmation required`. Never colored as fact.

Conversion moments are explicit UI: "Request verifier sign-off" (community), "Legal Confirmation Required" (briefs), source promote/reject (admin).

---

## 4. HONEST-STATE SYSTEM

One pattern for empty/pending/stale, everywhere:
- **Frame:** `border: 1px dashed rgba(0,0,0,0.25)`, bg `#FAFAF8`, radius 8.
- **Header:** brass eyebrow, bold one-liner stating what's absent.
- **Body:** why it's absent + what makes it appear + (when true) "lands when X ships". Customer-facing words only.
- **Recovery:** filters that can yield zero always render a "Clear filters" action in the empty state.
- A missing figure inside a populated card renders as an em-dash `—` with a one-line reason, in muted ink — never `0`, never blank.

---

## 5. SHELL SPEC (identical on all pages)

- **Sidebar (208px):** wordmark plate → nav: Dashboard, Regulations, Market Intel, Research, Operations, Map — divider — Community. **Admin is NOT in the nav**: it lives in the footer row as a small uppercase bordered button beside the user chip. Active item: `rgba(232,97,10,0.09)` bg + 2px orange left border + ink text. Footer: avatar chip (opens Account/user menu) + Admin button.
- **Masthead:** 4px gradient strip → blue eyebrow `VOL IV · NO. 27 · FRIDAY` (volume/issue/day from data — one issue date app-wide) → Anton title → one muted sub-line with the page's key counts (each count bold ink, criticals red).
- **Detail pages** replace the volume eyebrow with a breadcrumb: `Index / Group / Item` (segments never wrap mid-segment) and add the action row: primary `Export brief` (solid orange) + quiet `Share` / `Watch`, then the tab row (3px orange underline on active, tabs nowrap).

---

## 6. TEMPLATE-BY-TEMPLATE (adopt in this order)

Each template ships alone; do not refactor neighbors. After each: screenshot desktop 1440 + verify checklist (§8).

### 6.1 Regulations index (archetype)
Severity tiles (clickable filters, count in Anton, colored bottom rule) → Ask bar → search + sort segment + Filters → **banded ledger** (one card per severity band: 4px severity gradient strip, tinted head row with count, item rows: jurisdiction tag / title / meta / tier chip, "All N {band} →" expander, "next band" footer). Kanban is dead — do not reintroduce it.

### 6.2 Regulation detail (archetype)
Hero (breadcrumb, chips: `• IMMEDIATE` bullet chip + type + tier, actions) → tabs (Summary / Exposure / Penalty schedule / Timeline / Sources) → Ask bar with page-scoped suggestion chips → Short/Full summary toggle → accordion sections (+/− toggles, ALL OPEN by default, closed shows one-line italic summary) → interactive milestone timeline (clickable dots, detail panel, green progress fill) → sources tab = structured rows with tier chips, never a raw table dump.

### 6.3 Dashboard
Priority tiles (5/42/26/186 pattern) → Ask bar → what-changed cards (urgency eyebrow + date cluster right, T-chip) → surface list with counts → Watchlist / By owner (honest empties with CTA) → Housekeeping (coverage gaps, awaiting review) → Supersessions ledger (REPLACED chips, "never mix into active lists"). Pending decision: making dashboard tiles filter like every other page — flagged, awaiting operator approval; build the plumbing to allow it.

### 6.4 Market Intel
Five severity tiles (Action required / Cost alert / Window closing / Competitive edge / Monitoring) + B1/B2/B3 band strip — all combinable filters → signal cards: head = one severity chip + dashed Unverified chip + **key figure top-right (Anton, severity color)** + `Full analysis →` (solid orange, links to signal detail) + expander; body on expand = trajectory / What it changes / Conversion trigger panels. Signals with no price dimension show the honest `—`.

### 6.5 Signal detail
Hero price board (Anton figures with per-figure context lines; caption states figures are published statistics with next release dates — when the live feed lands these slots tick) → six tabs (What's moving / Drivers & trajectory / Cost impact / Client talking points / Do now / Sources) → trajectory = color-graded figure cards → cost impact by mode (Air/Road/Ocean; honest `—` where sources lack data) → talking points three columns (can-say blue / pitfalls rust / questions orange) → Do now sorted by deadline chips → persistent notes field.

### 6.6 Research
Tiles (0/1/0/38) → theme cards as filters (wrap, no dead cells, `N new` in Anton) → Ask bar → vertical chips + 7d/30d/90d/All window → theme bands; findings expand to "What it changes" / "What it does not resolve"; key figures promoted ($139/kWh, 14.3 MtCO₂e…).

### 6.7 Operations
Tiles → D1–D6 dimension chips (n/5 coverage) → region cards: whole header row clickable + explicit orange `Expand ▾` button; expanded = dimension grid; US card contains **By state** sub-list (per-state figures with own citations; pending frame for unsourced states). Same sub-region pattern reserved for EU member states.

### 6.8 Admin
Sections plate grid (Workspaces / Sources 531 / Ingest / Coverage) + Issues queue rail (computed total 1,328; rows: provisional 489, staged 0, materialization 3, quarantine 663, conflicts 131, spot-check 42) → Workspaces: usage overview row (Companies 1 / Individuals 2 / Newest join / Active-this-month pending) + org table + member rows with `Owner ▾` role chip, `Remove`, rust `Ban` (typed confirmation; last owner immovable) → Flags & rejections merged queue (797) with three-way filter + bulk-resolve for identical seed-fallback triggers → Coverage matrix 5×6 (15/25 populated, dashed pending cells). Destructive actions are words, never icons.

### 6.9 Map
**Keep the production map component (real basemap, zoom, fly-to). The mock's schematic SVG is a placeholder — do NOT copy it.** Adopt: filter bar (Modes / Priority / Regions chips + Split/Map/List segment), marker encoding (radius = item count, color = severity, count numeral inside), focus behavior (marker/tile click → focused-jurisdiction panel with Open in Regulations →), rail (Active heat, focused panel, Coverage gaps), and the **jurisdiction register band under the map** (compact tiles, auto-fill grid) so nothing lives below the fold. Mode filters on the map are pending item-level mode tags — render the honest note, link to Regulations where mode filters work.

### 6.10 Account (standard user surface)
Top tabs Profile / Settings. Profile: owner banner, stat tiles (sectors 6 / home jurisdictions 30 / member since / admin attention = computed queue total), sub-tabs (Personal form, Organization, Members & roles with Invite + role/Remove/Ban, Sector profile chips, Jurisdictions, Verifier badge, Activity = honest pending). Settings: appearance, home-section toggles, default sort/export/alert chips, full 40-sector checkbox grid with Select all/Clear + live count, notifications list (locked "always on" row for workspace invitations), briefing schedule (cadence/day/time, 84 jurisdiction weight chips, "All jurisdictions weighted equally" when none selected, in-app delivery, Save enabled only when dirty → "Saved to {workspace}"). User menu popover on the sidebar chip: email, workspace, ADMIN chip, Workspace profile / Admin panel / Settings / Dark mode / Sign out.

### 6.11 Community
Regional rooms grid (7 rooms; item counts + themes from the live registry; "You're here" from profile home jurisdictions; per-room discussion counts) → room panel: header + Join/Leave toggle, "Live in this region" (real ledger items linking into Regulations/Market Intel/Operations), Discussions card (composer posts on Enter/click; starter-question chips prefill; thread cards carry You·Owner chip + dashed Unverified + Reply / Cite source / Request verifier sign-off / Delete) → rail: Who's here (from home jurisdictions), Why post here (promotion pipeline → Admin pickups), Verifier status, vertical-groups pending frame. **New backend surface**: rooms, threads, presence, sign-off requests — coordinate endpoints before building UI state.

---

## 7. KNOWN NEW BACKEND WORK (design already gives these a home — do not fake them)
- Member management: role change, remove, ban (typed confirmation), last-owner guard.
- Per-account/org activity events (Admin usage row, Account Activity tab).
- Live price feed (signal hero board slots; until then show published-stat caption).
- Item-level mode tags for map filtering.
- State-level cost facts (minimum wage, fuel taxes) as first-class sourced records.
- Community rooms/threads/presence/verifier sign-off.
- Supersessions register feed for Settings → Data & supersessions.

---

## 8. MANAGING DESIGN ADJUSTMENTS (how you, Claude Code, handle deviations)

1. **Default: match the mock to the pixel.** Lift hex/px/weights from mock inline styles rather than approximating with the nearest Tailwind default. Extend `tailwind.config` with the §2 tokens; do not substitute `orange-600` for `#E8610A`.
2. **When the mock and codebase conflict** (existing shadcn component can't express the pattern): keep the shadcn primitive underneath, restyle to spec. Do not swap in new libraries.
3. **When live data is missing for something the mock shows:** render the honest-state pattern (§4) — never sample data, never hide the module silently.
4. **When you must deviate** (perf, a11y, data-shape reality): make the smallest deviation, and log it in `DESIGN-DEVIATIONS.md` — one entry each: template, what deviated, why, screenshot. The operator reviews this file; deviations are proposals, not decisions.
5. **Never "improve" unprompted.** No added shadows, animations, icons, gradients, empty-state illustrations, or copy rewrites. Restraint is the brand.
6. **Accessibility floor:** WCAG AA contrast (the muted inks pass on their assigned backgrounds — don't lighten them), all disclosure/accordion/tab patterns keyboard-operable with visible focus (2px ink outline, 2px offset), filter chips are real buttons with `aria-pressed`.
7. **Per-template acceptance checklist** (run before merging each):
   - [ ] Counts computed from data; no snapshot literals
   - [ ] All filters clickable AND clearable; zero-result state has recovery
   - [ ] Epistemic chips correct (solid blue verified / dashed amber signal / labeled analysis)
   - [ ] Honest-state frames for every absent field; no internal names in copy
   - [ ] Shell identical (nav order, Admin in footer, masthead strip, issue date from data)
   - [ ] Sentence case; no emoji; tabs/breadcrumbs/chips never wrap mid-segment
   - [ ] Keyboard pass + AA contrast spot-check
8. **Order of work:** 02 → 03 → 01 → 04 → 05 → 06 → 07 → 08 → 09 → 10 → 11. Index + reader archetypes first; everything else reuses their pieces.

---

## 9. OPEN DECISIONS (ask the operator, don't guess)
- Dashboard severity tiles as live filters (pattern-complete) — approved?
- Ask bar on Map/Community/Account — currently intentionally absent.
- Awareness band green vs. brand's no-green stance — currently green by operator choice.
