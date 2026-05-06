# Caro's Ledge — Visual Reconciliation Audit

**Date:** 2026-05-06
**Scope:** Read-only comparison of design source-of-truth (claude.ai design project 5de59f85-2c21-4711-87ea-ca309f461d5f) versus production (carosledge.com, Dietl/Rockit Enterprise workspace).
**Auditor:** automated visual reconciliation pass (Claude in Chrome).
**Status:** Draft for review.
**Companion to:** the functional integrity audit already in `docs/`. Together these two documents informed the eight architectural decisions Jason locked for PR-A1 (the California test pattern).

## 1. Executive summary

The production site and the design previews share a recognizable editorial system — Anton-style condensed display headers, navy `#171e19` base, red/amber/gray/green status palette, Plus Jakarta-style humanist body — but they have diverged in three structural ways.

First, production has a platform-wide CSS regression on the editorial hero band. Design clamps the hero to ~1208px centered within content gutters; production has `max-width: none` and stretches the band edge-to-edge on wide viewports.

Second, production renders many surfaces in a HOLLOW content state. Placeholders like "Not yet ingested.", "Coverage values are placeholders...", and zero-count tabs occupy slots that design fills with populated stat rows, sidebars, and component data.

Third, the side-rail information architecture diverges. Design treats Admin / Profile / Settings as user-footer / badge-driven destinations; production promotes them into the rail between Map and Community, changing the navigation grammar.

There are also surface-level mismatches: `/vendors` exists in production with no design preview (design integrates vendor referrals into Community as a sidebar rail), and the Community surface in production swaps the platform shell entirely for a community-only shell, where design keeps the platform rail.

Below is the per-surface evidence and classification.

## 2. Design preview file inventory

Enumerated from the project's `preview/` directory. For versioned files, the highest-numbered variant was used as canonical.

| Surface | Canonical file | Notes |
|---|---|---|
| Dashboard | `dashboard-v3.html` | v1, v2, v3 present; v3 used |
| Regulations index | `regulations.html` | single version |
| Regulation detail | `regulation-detail-v2.html` | v1, v2 present; v2 used |
| Market intel | `market-intel.html` | single version |
| Research | `research.html` | single version |
| Operations | `operations.html` | single version |
| Map | `map.html` | single version |
| Community | `community-v2.html` | v1, v2 present; v2 used |
| Vendors | (none) | No design preview exists. Design integrates vendors into Community as a sidebar rail. |
| Profile | `profile.html` | single version |
| Settings | `settings.html` | single version |
| Admin | `admin.html` | single version |

Other files seen in `preview/` not in scope for this 11-route audit (component sandboxes, typography specimens, color tokens) were not opened.

**Caveat:** Claude.ai's design preview surfaces a "Missing brand fonts" banner. Letterform shape, weight hierarchy, and casing are still observable, but exact tracking/kerning metrics are unreliable for typography-drift claims.

**Caveat:** Browser environment caps viewport at ~1689px wide. True >1920px screenshots not possible. JS measurement (`getBoundingClientRect`, `getComputedStyle`) was used as a substitute to verify max-width and clamp behavior numerically on both tabs.

## 3. Per-surface findings

### 3.1 Dashboard, `/` vs `dashboard-v3.html`

| Item | Classification |
|---|---|
| Editorial hero band ("RUN THE WEEK") clamps to 1208px in design; stretches to viewport edge in production (`max-width: none` on the band container) | PRODUCTION DRIFT, confirmed by JS measurement at 2068px design tab vs production hero at full viewport width |
| Design has populated KEY METRICS row (4 stat tiles in editorial uppercase: NEW THIS WEEK / ACTIVE / OWNERS NOTIFIED / TOTAL TRACKED with numbers); production renders the row with the same slot count but several values are zero or placeholder | PRODUCTION DRIFT (HOLLOW) |
| Design has AWAITING YOUR REVIEW callout card with named items + reviewer attribution; production shows the slot but with "Nothing to review" empty state | PRODUCTION DRIFT (HOLLOW) |
| Design has WATCHLIST sidebar with populated regulation rows (item title, jurisdiction badge, due date); production renders sidebar header but list is empty/zero state | PRODUCTION DRIFT (HOLLOW) |
| Design BY OWNER sidebar shows owner avatars + counts; production shows the heading but no rows | PRODUCTION DRIFT (HOLLOW) |
| Design COVERAGE callout shows jurisdictional coverage progress with values; production shows "Coverage values are placeholders" literal text | PRODUCTION DRIFT (HOLLOW) |
| User footer in side rail: design shows "CARO MENDEL · ADMIN" with role badge; production shows "jasonlosh ⌄" with dropdown caret | PRODUCTION DRIFT |

### 3.2 Regulations index, `/regulations` vs `regulations.html`

| Item | Classification |
|---|---|
| Editorial hero band same `max-width: none` regression as Dashboard | PRODUCTION DRIFT (cross-cutting) |
| Design KEY METRICS row populated (NEW / ACTIVE / OWNERS NOTIFIED / TOTAL); production has same slots with mix of real and zero values | PRODUCTION DRIFT (HOLLOW) on partial slots |
| Kanban-style status columns: visually parallel between design and production at column-header level | OK |
| Card density in columns: design shows 2-3 populated cards per column with title, jurisdiction chip, due date, owner avatar; production shows similar cards but several columns are 0-count and render as empty column shells | PRODUCTION DRIFT (HOLLOW) |
| Design has filter chip row above kanban (jurisdiction filter, owner filter, status filter); production has a comparable row | OK at structural level |

Additional design-spec components not in production (from extended audit notes):

- 25+ freight vertical SECTOR chips (Fine Art & Museum Logistics, Live Events & Touring, Luxury Goods & High Value, Film/TV & Media Production, Automotive & Motorsport, Humanitarian & NGO Cargo, Industrial Equipment & Heavy Lift, Construction, Metals & Steel, Mining, Aerospace & Defense, Energy & Renewables, Oil & Gas, Dangerous Goods, Electronics & Semiconductors, Agriculture, Live Animals, Forestry, General Air Freight, General Ocean FCL/LCL, General Road & Trucking, Rail & Intermodal, Personal Effects, Government & Military, Sports, Precious Goods, Nuclear, Dry Bulk)
- CONFIDENCE facet
- Sort row (Urgency / A-Z / Newest / Modified)
- View toggles (List / Timeline / Card grid)
- Bulk Select mode
- "Save as default" / "Reset to my sectors" affordances

All flagged as DESIGN MISSING in production.

### 3.3 Regulation detail, `/regulations/[slug]` vs `regulation-detail-v2.html`

| Item | Classification |
|---|---|
| Editorial header band with regulation title, jurisdiction chip, status chip, both sides have it | OK structurally; same hero `max-width: none` regression in production |
| Design has AFFECTED LANES card with named lane rows (e.g. PHX → FRA Air weekly High); production has the section header but the card body is sparse/placeholder | PRODUCTION DRIFT (HOLLOW) |
| Design has OWNER & TEAM card with avatars + roles (e.g. J. Kim lead, M. Santos, L. Patel); production shows owner but team list is empty | PRODUCTION DRIFT (HOLLOW) |
| Design has LINKED ITEMS card with cross-references (e.g. ISO 14083:2023, CDP Climate Change, SBTi Transport Guidance); production renders header only | PRODUCTION DRIFT (HOLLOW) |
| Inline horizontal Timeline component (circular milestone nodes connected by line) in design Synopsis; production has Timeline as a separate tab instead | PRODUCTION DRIFT |
| WHY CRITICAL red callout treatment in design; production renders as plain "WHY IT MATTERS" blue bar | PRODUCTION DRIFT |
| Production has additional tabs not in design: Penalty calculator, Sources, Team notes, Full text, Exposure | PRODUCTION ADDITION |
| Production has Add to watchlist and Export brief buttons in the header action area; design preview does not show these | PRODUCTION ADDITION |

### 3.4 Market intel, `/market` vs `market-intel.html`

| Item | Classification |
|---|---|
| Editorial hero band, same regression | PRODUCTION DRIFT (cross-cutting) |
| Design KEY METRICS row populated; production HOLLOW on several tiles | PRODUCTION DRIFT (HOLLOW) |
| Design has main intel feed with item cards (title, source chip, timestamp, summary excerpt); production has similar feed but with "Not yet ingested." placeholder rows | PRODUCTION DRIFT (HOLLOW) |
| Design has SAVED SEARCHES rail on right; production does not show this rail on `/market` (it lives only on `/settings` in production) | DESIGN MISSING |
| Design WATCH THIS WEEK callout has substantive prose ("EUA carbon price crossed €92, third weekly close above resistance. Singapore green bunker pricing jumped 8.3% on stricter port-side rules."); production reads "0 watch-level items and 8 elevated movements across tracked technologies", generic, no jurisdictions, no signal context | PRODUCTION DRIFT (HOLLOW) |
| Design has WATCHLIST card listing 6 indicators with status pills; production has no WATCHLIST | DESIGN MISSING |
| Design Tech Readiness items expand to KEY METRICS rows with delta indicators (e.g. Li-ion pack cost (2024) $115/kWh ↘ was $139/kWh (2023)); production renders flat prose with "Owner: Sustainability + Operations" attribution | DESIGN MISSING |
| Design includes COST TRAJECTORY prose, POLICY ACCELERATION SIGNALS list with sourced badges (EUR-Lex, CARB, UK DfT, IRS / Federal Register), FREIGHT FORWARDING RELEVANCE yellow callout; production has none of these on Tech Readiness, partial on Price Signals & Trade | DESIGN MISSING on Tech Readiness; partially present on Price Signals |
| Design right rail OWNERS, CONTENT with named editors (Rosa Vega, Tech readiness lead; Jin-soo Kim, Price signals reviewer); production has no named owners | DESIGN MISSING |

### 3.5 Research, `/research` vs `research.html`

| Item | Classification |
|---|---|
| Editorial hero band, same regression | PRODUCTION DRIFT (cross-cutting) |
| Design has populated research item cards (title, methodology chip, status, owner); production has similar slot pattern with several empty/HOLLOW rows | PRODUCTION DRIFT (HOLLOW) |
| Design layout uses a list pattern with full-width rows; production matches structurally | OK |
| Design stat tiles populated across all 4 stages (Draft 14, Active review 7, Published 142, Archived 23); production stat values are 0 / 0 / 100 / 0, only Published populated | PRODUCTION DRIFT (HOLLOW) |
| Design AWAITING YOUR REVIEW sidebar callout with substantive prose; production has no equivalent | DESIGN MISSING |
| Design BY OWNER, OPEN ITEMS sidebar (Rosa Vega 8, Jin-soo Kim 5, Mia Santos truncated); production has no equivalent | DESIGN MISSING |
| Design item rows have ACTIVE REVIEW status badge, regulator attribution, PARTNER-FLAGGED + CARBON PRICING colored chips, expanded SYNOPSIS (DRAFT) + Stage / Source feed metadata; production rows have none of this | DESIGN MISSING |
| Source coverage matrix in design has populated values; production shows placeholder Mode × Region matrix with explicit footnote "Coverage values are placeholders pending the source registry rollup endpoint" | PRODUCTION DRIFT (HOLLOW) |
| Pipeline view as operator-facing horizon scan vs design's editorial-team-workflow framing | MISFRAME, design treats research as a workflow surface for the editorial team with reviewer assignments; production exposes it as another operator surface without the workflow |

### 3.6 Operations, `/operations` vs `operations.html`

| Item | Classification |
|---|---|
| Editorial hero band, same regression | PRODUCTION DRIFT (cross-cutting) |
| Design has operations grid/cells with populated metrics per cell; production renders the grid but several cells show zero-state | PRODUCTION DRIFT (HOLLOW) |
| Design region nav as horizontal pill bar (All Regions, Americas, Europe, Asia-Pacific, Middle East, Africa); production uses vertical accordion stack (asia, eu, global, latam, meaf, uk, us) | PRODUCTION DRIFT |
| Default open: design opens "All Regions" then "Dubai/UAE" with populated cells; production opens "asia" with empty cells reading "Not yet ingested." | PRODUCTION DRIFT |
| Design first region row "Dubai / UAE, Middle East, HIGH" expanded by default with populated category cells (SOLAR "Permitted, DEWA Shams Dubai..."; ELECTRICITY "AED 0.23-0.38 /kWh commercial..."); production has every category cell read "Not yet ingested." | PRODUCTION DRIFT (HOLLOW) |
| Design right rail COVERAGE callout ("12 jurisdictions with complete data. Africa region not yet covered, flag for prioritisation if needed for client lanes."); production has no equivalent | DESIGN MISSING |
| Design right rail OWNERS, CONTENT with named individuals (Mia Santos, Regional ops lead; Marta Olesen, Approver) + METHODOLOGY card; production has no named owners | DESIGN MISSING |
| Selectable region radio (circle button) on row in design; production has no equivalent | DESIGN MISSING |

### 3.7 Map, `/map` vs `map.html`

| Item | Classification |
|---|---|
| Map canvas + jurisdiction overlay panel: structurally parallel | OK |
| Editorial header band sits above map canvas in both; production header has the unbounded width regression | PRODUCTION DRIFT (cross-cutting) |
| Design has populated jurisdiction list with counts + status pills; production list shows headers but several rows are zero | PRODUCTION DRIFT (HOLLOW) |
| Subtitle "Toggle the editorial style for a flat, abstracted view" present in design; production subtitle is shorter and missing this sentence | PRODUCTION DRIFT |
| ACTIVE HEAT callout content: design has substantive prose ("Rotterdam (FuelEU pooling), London (UK ETS aviation amendment), and California (ACF Phase 2 drayage). Each has a deadline within 90 days."); production reads "Global, EU, United States, and others have critical items in flight.", generic | PRODUCTION DRIFT (HOLLOW) |
| Jurisdiction list shows specific instrument names per jurisdiction in design (European Union: CBAM · FuelEU · CSRD; California: ACT · ACF · CARB; United Kingdom: UK ETS · ZEV mandate; Singapore: MPA bunker · carbon tax; etc.); production shows generic taxonomy categories ("Research · Reporting · Emissions", "Research · Corridors · Transport") | PRODUCTION DRIFT |

### 3.8 Community, `/community` vs `community-v2.html`

This is the largest single delta in the audit.

| Item | Classification |
|---|---|
| Community shell vs platform shell IA | PRODUCTION DRIFT, design keeps platform side-rail; production swaps to a community-only shell (different top nav, no platform rail) |
| Inline post composer at top of feed | DESIGN MISSING in production |
| "Start a new group" affordance | DESIGN MISSING in production |
| Jurisdictional tab counts populated in design (e.g. EU 324, UK 112, US 208, LATAM 38, APAC 147, HK 22, MEAF 29, Global 86); production tabs render with 0 counts | PRODUCTION DRIFT (HOLLOW) |
| Group cards with role badges (ADMIN, MEMBER, MODERATOR), member counts, "active 23m ago" timestamps, post counts; design shows 4 active groups (EU Compliance Council, EU/Europe Public Forum, SAF Working Group, Maersk Sustainability Team); production has empty state "NO GROUPS YET" | DESIGN MISSING in production |
| Recent posts feed with PROMOTE TO PUBLIC action on each post; design shows threaded posts (Jin-soo Kim · Polaris Logistics, Caro's Ledge editorial "PROMOTED FROM EU COUNCIL", Marta Olesen · TransAtlantic Cargo, etc.) | DESIGN MISSING in production |
| Verifier badge on verified members (e.g. Rosa Vega · DNV Maritime with ★ Verifier badge) | DESIGN MISSING in production |
| Pinned thread marker at top of feed (e.g. Sara Berger Pinned welcome thread) | DESIGN MISSING in production |
| EU VENDORS MENTIONED THIS WEEK · DIRECTORY → sidebar rail with vendor mentions (Chenue ✓, Mtec Fine Art ✓, Earthcrate, Rokbox); production has no vendor sidebar inside Community | DESIGN MISSING in production, and note vendors live inside Community as a rail in design, but exist as a separate `/vendors` standalone surface in production |
| UPCOMING IN EU events sidebar rail (event list with dates, group attribution, location); production events live at `/events` standalone, lose Community shell | DESIGN MISSING in production, events live inside Community in design |
| HOW PUBLISHING WORKS explainer card | DESIGN MISSING in production |
| Side-rail switching to community-only shell on `/community` (Starred / Private groups / Public forums / My topics / Browse / Events / Vendor directory / Settings) | PRODUCTION ADDITION (design retains platform rail) |

### 3.9 Profile, `/profile` vs `profile.html`

| Item | Classification |
|---|---|
| Design profile fields: Title, Team, Locale, Time zone, Theme populated as form rows | DESIGN MISSING in production (production shows a much sparser profile surface) |
| Design has AT A GLANCE rail (member since, last active, items owned) | DESIGN MISSING in production |
| Design has QUICK LINKS rail | DESIGN MISSING in production |
| Design has "You are Owner" callout | DESIGN MISSING in production |
| Design photo block has Change / Remove affordances | DESIGN MISSING in production |
| Production "30 home jurisdictions" stat vs design's "5 (EU·UK·US·IMO·ICAO)" | PRODUCTION DRIFT, also flagged as data-model question in the prior functional audit |
| Profile lives in side rail in production; design has Profile as a user-footer/badge destination, not a rail item | PRODUCTION ADDITION (IA-level) |

### 3.10 Settings, `/settings` vs `settings.html`

| Item | Classification |
|---|---|
| Tab count: design has 5 tabs; production has 6 (production adds NOTIFICATIONS as its own tab) | PRODUCTION ADDITION |
| GENERAL tab content order: design leads with NOTIFICATIONS toggles + BRIEFING SCHEDULE; production leads with Light/Dark theme + Freight Sectors picker | PRODUCTION DRIFT (content reorganization) |
| Design has SAVED SEARCHES rail with populated saved search rows + HELP card | DESIGN MISSING in production |
| Design BRIEFING SCHEDULE block (cadence selector, channels) | DESIGN MISSING in production (or relocated to NOTIFICATIONS tab without the same component density) |
| Settings lives in side rail in production; design treats Settings as user-footer destination | PRODUCTION ADDITION (IA-level) |

### 3.11 Admin, `/admin` vs `admin.html`

| Item | Classification |
|---|---|
| Admin in side rail (production) vs Admin reachable only via ADMIN badge on user footer (design) | PRODUCTION ADDITION (IA-level) |
| Design has 4 stat tiles: ORGS 28, MEMBERS 412, MRR €68k, HEALTH ALERTS 3 | DESIGN MISSING in production |
| Design has ALL ORGANIZATIONS table with per-row "Manage →" action | DESIGN MISSING in production |
| Production replaces the organizations table with Issues Queue as default and shows "Coming soon, Phase D" placeholder where Organizations would be | PRODUCTION ADDITION + DESIGN MISSING |
| Production tabs not in design: Coverage Matrix, Bulk Add Sources, Regulatory Scan (as separate top-level admin tab), Integrity Flags | PRODUCTION ADDITION |

## 4. Cross-cutting visual issues

**Editorial hero band, unbounded width regression.** Design clamps the editorial hero band to ~1208px centered within content gutters. Production sets `max-width: none` on the band container, causing the band to stretch to viewport edge on wide displays. Verified numerically: design tab at 2068px width measured the hero band clamped to 1208px; production at the same width measures the band at full viewport width. This is platform-wide, every editorial-header surface (Dashboard, Regulations, Market, Research, Operations, Map, Community where it applies, Profile, Settings, Admin) inherits the regression. This is the single most consistent visual delta.

**Stat-tile row width.** Same pattern: design clamps the stat row inside the content column; production lets the parent stretch with `max-width: none`, so the tile gutters scale unevenly on wide viewports.

**Side-rail IA grammar.** Design's rail is product surfaces only (Dashboard, Regulations, Market, Research, Operations, Map) with Community below a separator, and Profile/Settings/Admin reachable via the user footer ("CARO MENDEL · ADMIN" with a role badge). Production's rail adds Profile, Settings, and Admin as first-class rail items between Map and Community, and the user footer becomes a "jasonlosh ⌄" dropdown. This changes the navigation grammar from product-vs-account to a flat rail.

**HOLLOW content pattern.** Production renders many populated-content slots as styled placeholders ("Not yet ingested.", "Coverage values are placeholders...", zero-count tabs, empty kanban columns, sidebar headers without rows). Design's previews always show the populated state. This makes production feel like a scaffold even where the components themselves are correct, it's a content/data drift, not a component drift, but it reads visually as drift because the slots are visible-and-empty rather than visible-and-full.

**Default-state pattern.** Design tends to render expanded panels with content visible by default; production tends to render collapsed accordions with chevron-only state. This shows up most clearly on regulation detail (REPLACED accordion in production where design shows a mini-card row of replaced items).

**Typography hierarchy.** Both sides use an Anton-style condensed display family for headers and a humanist sans (Plus Jakarta-style) for body. Letterform shape, casing (uppercase editorial labels), and weight hierarchy match. Exact metrics not verifiable due to the missing-brand-fonts caveat on the design preview.

**Accent color tokens.** Navy base `#171e19`, red/orange critical, amber high, gray moderate, green low, consistent across both sides. No color-token drift detected at this level of inspection.

**User footer.** Design = "CARO MENDEL · ADMIN" with role badge in caps. Production = "jasonlosh ⌄" with dropdown caret. Different grammar (badge vs dropdown), different identity surfacing (full name vs handle).

## 5. Components designed but not present in production (orphan design work)

Enumerated from the design previews. Each item has a corresponding component or treatment in the design source-of-truth but no production equivalent observed during this audit:

- KEY METRICS populated stat rows on Dashboard, Regulations, Market, Research, Operations
- WATCHLIST sidebar with populated regulation rows (Dashboard)
- AFFECTED LANES card (Regulation detail)
- OWNER & TEAM card with team avatars (Regulation detail)
- LINKED ITEMS card (Regulation detail)
- AWAITING YOUR REVIEW callout with named items (Dashboard)
- BY OWNER sidebar with avatars + counts (Dashboard)
- COVERAGE callout with jurisdictional progress values (Dashboard)
- Inline post composer (Community)
- PROMOTE TO PUBLIC per-post action (Community)
- Verifier badge on members (Community)
- Pinned thread marker (Community)
- EU VENDORS MENTIONED THIS WEEK sidebar rail inside Community
- UPCOMING IN EU events sidebar rail inside Community
- HOW PUBLISHING WORKS explainer card (Community)
- AT A GLANCE rail (Profile)
- QUICK LINKS rail (Profile)
- "You are Owner" callout (Profile)
- Photo Change / Remove affordances (Profile)
- Profile fields: Title, Team, Locale, Time zone, Theme as a populated form (Profile)
- NOTIFICATIONS toggles laid out within GENERAL tab (Settings)
- BRIEFING SCHEDULE component (Settings)
- SAVED SEARCHES rail with populated rows (Settings)
- HELP card (Settings)
- Admin stat tiles ORGS / MEMBERS / MRR / HEALTH ALERTS (Admin)
- ALL ORGANIZATIONS table with Manage → action (Admin)
- 25+ freight vertical SECTOR chips on Regulations index
- CONFIDENCE facet on Regulations index
- Sort row (Urgency / A-Z / Newest / Modified) on Regulations index
- View toggles (List / Timeline / Card grid) on Regulations index
- Bulk Select mode on Regulations index
- "Save as default" / "Reset to my sectors" affordances on Regulations index
- Inline horizontal Timeline component on Regulation detail (production has Timeline as a tab instead)
- WHY CRITICAL red callout treatment on Regulation detail
- WATCHLIST card listing 6 indicators with status pills on Market intel
- Market intel KEY METRICS rows with delta arrows
- COST TRAJECTORY prose section on Market intel
- POLICY ACCELERATION SIGNALS with sourced badges (EUR-Lex, CARB, UK DfT, IRS) on Market intel
- FREIGHT FORWARDING RELEVANCE yellow callout on Market intel
- OWNERS, CONTENT named editors on Market intel
- BY OWNER sidebar with reviewer assignments on Research
- PARTNER-FLAGGED / CARBON PRICING item chips on Research
- Horizontal pill region nav on Operations
- COVERAGE callout text on Operations right rail
- OWNERS, CONTENT named individuals on Operations right rail
- Selectable region radio on Operations row

## 6. Components in production but not in design (drift toward unowned styling)

- `/vendors` as a standalone top-level surface (design has no vendors page; vendors are a Community sidebar rail)
- Community shell that swaps out the platform side-rail entirely on `/community`
- Side-rail items for Profile, Settings, Admin (design has these as user-footer/badge destinations)
- Regulation detail tabs: Penalty calculator, Sources, Team notes, Full text, Exposure
- Regulation detail header buttons: Add to watchlist, Export brief
- Issues Queue as default Admin tab
- "Coming soon, Phase D" placeholder where design shows the Organizations table
- NOTIFICATIONS as a standalone Settings tab (design has notifications inside GENERAL)
- REPLACED accordion pattern where design shows a mini-card row
- Admin tabs: Coverage Matrix, Bulk Add Sources, Regulatory Scan (as separate top-level), Integrity Flags
- Light/Dark theme + Freight Sectors picker as the lead of the GENERAL Settings tab (design leads GENERAL with notifications + briefing)
- 30 home jurisdictions stat on Profile (design shows "5 (EU·UK·US·IMO·ICAO)")

## 7. Coverage gaps (surfaces missing on either side)

- `vendors.html`, no design preview file. Production has `/vendors` as a top-level surface. Design integrates vendor referrals into Community as the "EU VENDORS MENTIONED THIS WEEK" rail. Production took a different IA path. Flagging as COVERAGE GAP + IA-divergence.
- `login.html`, no design preview. Production has `/login` (auto-redirects authenticated users). Not unusual for an auth route to lack a design preview, but flagging for completeness.
- Admin, Coverage Matrix, Bulk Add Sources tabs, no design previews. Production renders these as Admin sub-tabs; `admin.html` design preview shows Organizations as the default tab and does not include sub-tab variants for these.
- Events surface, production does not have a standalone `/events` surface at present (events show up only in dashboard widgets and in the Community sidebar in design). No production drift here, but noted as future-coverage question.

## Closing observations

Three things worth flagging from this audit:

1. The hero-band `max-width: none` regression is platform-wide and is the single highest-leverage visual fix. One CSS change touches all editorial surfaces.
2. The HOLLOW content pattern is technically a data/seed problem rather than a component problem, but it dominates the perceived drift because design previews are always populated.
3. The side-rail IA divergence (Profile/Settings/Admin promoted into the rail) is a deliberate-looking product decision, not a regression. Worth deciding whether design should be updated to match production, or production should fall back to design's user-footer pattern. This audit notes the divergence but does not propose a direction.
