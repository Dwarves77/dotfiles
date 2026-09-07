# Handoff: Caro's Ledge — UI system overhaul

## Overview

One canvas defines the whole product UI: an **artboard 0 system sheet** where every shared part is defined once, and **17 page artboards** (dashboard, four lists, four details, map, watchlist, community, admin, account, settings, auth, onboarding) built only from those parts. Two option turns sit above the system sheet for decisions still open (see *Open decisions*).

The governing constraint is consistency: two previous redesigns drifted because pages were migrated one at a time. Implementation should follow the same rule — build the shared parts first from artboard 0, then assemble pages from them. Any page-local deviation belongs in a deviation log, not in a page's stylesheet.

The product is a subscription freight sustainability and regulatory intelligence service. The reader is a professional at a forwarder, importer or exporter who needs to know what is binding on them, when it bites, and what it costs. 1,434 items across five surfaces; every item carries a jurisdiction, transport modes, a source set with a credibility tier, and one urgency band.

## About the design files

`Caros Ledge UI System.dc.html` (+ `support.js`) is a **design reference created in HTML** — a prototype of intended look and structure, not production code to copy. The task is to **recreate these designs in the fsi-app codebase** using its existing React/Next patterns and `src/app/theme.css` tokens. Markup in the file is inline-styled for streaming reasons; do not port inline styles. Port the *values* into the codebase's token layer and components.

Open it in a browser. The canvas pans and zooms; each artboard is labelled with its route.

## Fidelity

**High fidelity.** Colours, type, spacing, row geometry, and states are final and should be matched. Content is realistic sample data (real regulation titles, plausible counts) — not fixtures to ship. Copy inside the auth artboard (16) is placeholder and will be replaced by the client.

## The system (artboard 0)

Sections in the file: `0.1` surfaces and tone, `0.2` urgency scale, `0.3` the frame, `0.4` components, `0.5` detail architecture, `0.6` loading.

### 0.2 Urgency — the one scale

Four bands, one vocabulary everywhere (the audit found five competing vocabularies for this one system). Words are always these words:

| Band | Window | Hex | Tint | Use |
|---|---|---|---|---|
| Immediate | ≤ 90 days | `#DC2626` | `#FEF2F2` | row spine, tile, pill, marker |
| Action | ≤ 6 months | `#F97316` | `#FFF7ED` | " |
| Monitor | 6–12 months | `#2563EB` | `#EFF6FF` | " |
| Awareness | background | `#16A34A` | `#F0FDF4` | " |

Red and orange are hot, blue and green cool: the step from Action to Monitor is where the reader can relax, and the hue change says so. The four-band gradient rule (3px, segment widths proportional to the live band counts) is the brand mark — it tops the frame and the masthead.

### 0.3 The frame — on every page, including admin, account, auth and onboarding

- Frame width `1440`, page background `#FAFAF8`, canvas/desk `#E9E6E0`.
- **Nav `252px`, always** — one width, so the page never shifts on navigation (the audit found two nav widths).
- Content grid: `padding: 20px 40px 40px; grid-template-columns: minmax(0,1fr) 300px; gap: 28px; align-items: start`. At 1440 that is a **778px content column** and a **300px rail**.
- Nav card: white, `border-radius:10px`, `margin:16px 0 16px 16px`, band-gradient 3px cap, sections `Brief / Intelligence / Network / Operator`, counts right-aligned in each row.
- **Masthead** convention stays: `VOL IV · No. 36 · <date>` line, Anton title (34px list/dashboard, 28px detail), dek or breadcrumb, then the command bar.
- **Command bar** replaces every per-page ask panel: 40px tall, `⌕` glyph, placeholder "Search or ask across 1,434 items…", `⌘K` hint, dark `Ask` button. Typing searches; Ask sends the same text to the assistant scoped to the current page.
- Below 1280 the rail stacks under the content.
- Tab rows (account, settings) span the frame **above** the two-column grid, so rail cards align with the first content card.

### 0.4 Components — defined once, used everywhere

**Band tiles.** Four per row on every list surface. Card: white, radius 10, `padding:14px 16px 0`, flex column; stacked label (`10.5px/800/.08em` uppercase in band colour) over window (`10.5px` muted); Anton numeral 34px in band colour; the 4px band rule is pinned to the card's bottom edge (`margin:auto -16px 0`) so all four rules align regardless of label length. Each tile filters the list.

**List row — one anatomy** for Regulations, Market, Research, Operations, Watchlist, Dashboard:
`grid-template-columns: 3px 56px 1fr 88px 84px 76px 40px 44px; gap: 0 14px; min-height:56px`
= band spine (full-bleed 56px block in the band colour) · jurisdiction code · title + meta line · impact meter · due date + days · timeline · tier · `⋯`.
Hover `background:#FAFAF8`; row divider `1px solid rgba(0,0,0,.06)`; the whole row is the click target (the audit found two competing click affordances — this is the only one). Title truncates with ellipsis; meta line is `11px` muted.

**Impact meter** (kept and used everywhere — it existed on one screen in twenty). Four scored dimensions (cost, compliance, client-facing, operational), each 1–3. In rows: four 9px bars on a 1px baseline, **sorted ascending left→right**, colour by value (`1 #16A34A · 2 #F97316 · 3 #DC2626`), so green is always left and red always right; the sum `N/12` sits beside it in tabular numerals. Unscored = a dashed baseline and an em dash, never "NOT SCORED" as a second row. Full variant (detail rail, dashboard): one continuous bar per dimension over the full green→orange→red ramp, revealed from the left by the score.

**Milestone timeline** (kept and used everywhere). Passed = filled green dot; next = larger dot in the item's band colour with a ring; ahead = hollow dot; track green to today, `rgba(0,0,0,.12)` beyond. Row variant is 76px wide; the detail header carries the full-width version with date labels, and the callout is always the next obligation.

**Fact card** — replaces every `FACT: … *Source: …*` paragraph the pipeline currently re-buries in prose. Three variants told apart by form, not just colour: solid ink edge on white = sourced fact (quote, operative date, tier, link); dashed border on raised paper, italic = inference, not citable; orange edge = needs counsel. Raw URLs never appear in running text.

**State note strip** — `border-left:3px solid <band>; background:<band tint>; border-radius:0 6px 6px 0; padding:9px 12px`, text left, one action link right. Sits at the foot of the primary card on every page that has a state worth declaring (lists, map, watchlist, admin, account, settings) and under the timeline on detail pages. Neutral variant uses `#5A5552` on `#F5F2EE`.

**Chips.** Only band chips carry colour (tinted pill, band dot, band-coloured label). Tier is a bordered square `T1`–`T6`. Kind, mode and topic are neutral tags on `#F5F2EE`. Filter chips are grouped in labelled sets (Mode / Band / Region) so a wrapped group keeps its label.

**Absence.** A small-caps reason from a fixed vocabulary sits where the value would: `not in primary source · pending · unscored · connect data`. No grey boxes, no red, never a second full row.

**Buttons / stat blocks.** One primary per view, in ink `#5A5552`. Stat block (label / Anton numeral / note) is what profile and admin counters use — never a band tile.

**Hit targets.** 44px minimum on every toggle row and control; the `⋯` control is a 28px glyph inside a 44px cell with a `1px` left divider.

### 0.5 Detail architecture — one shape for all four detail surfaces

Header (band pill + tier + title + meta) → full timeline → state note → sticky section index (`S1 · S2 · S3 …`) → sections of fact cards at ≤72ch → rail. Section names vary by surface; the shape, rail and index never do. Opening an item from a list returns to the same scroll position, and the rail's "In this list · 4 of 15" keeps the reader's place (AlphaSense behaviour). No tabs, no per-tab ask bar, and no "Complete brief" toggle — that control is an unwired `<span>` today and is removed.

### 0.6 Loading

Nav and masthead render immediately; tiles and rows arrive as skeletons in their final geometry so nothing jumps. A count still loading shows a skeleton, never `0` — a zero is a fact, not a placeholder.

## Screens

Each artboard in the file carries its route and its own note. In order:

| # | Screen | Route | Notes |
|---|---|---|---|
| 1 | Dashboard — Your brief | `/` | Band tiles → Due next → What changed; rail = across the platform, watchlist, legend |
| 2 | Regulations list | `/regulations` | Facets always visible with live counts; 56px rows; 15 rows above the fold where there were 7 |
| 3 | Regulation detail | `/regulations/eu-ets-maritime` | The one detail architecture |
| 4 | Market list | `/market` | Signal kind is a tag, urgency is the band; price ribbon is one row |
| 5 | Market signal detail | `/market/packaging-material-input-costs` | Identical architecture to 3 |
| 6 | Research list | `/research` | Themes are a second facet row, not a second tile system |
| 7 | Research finding | `/research/mission-innovation-shipping` | Eleven frames become six anchored sections; every FACT paragraph a card |
| 8 | Operations list | `/operations` | Six dimension tiles collapse into the matrix header; Facts row open by default |
| 9 | Operations profile | `/operations/singapore-regional-operations-profile` | Port-dues paragraph becomes a concession table |
| 10 | Map | `/map` | Map + register side by side; markers use the band scale |
| 11 | Watchlist | `/watchlist` | Same row, one block, plus a re-check column |
| 12 | Community | `/community` | Rooms are tiles; a room is a **discussion board** — threads carry replies and last activity, not impact, timeline or tier |
| 13 | Platform admin | `/admin` | Same frame and masthead; counters are stat blocks; every action on a source is on its row |
| 14 | Account | `/profile` | One tab row; stat blocks, not band tiles |
| 15 | Settings | `/settings` | Sub-tab of Account; Light only (dark mode retired); 44px toggle rows |
| 16 | Sign in / Sign up | `/login`, `/signup` | Never captured; designed from the system. **Copy is placeholder** |
| 17 | Onboarding | `/onboarding`, `/workspace/new` | Three steps: workspace, modes + jurisdictions, sectors; the band scale is taught here once |

## What this fixes (audit findings)

Five urgency vocabularies → one. Two token sets → one. Two priority scales sharing names → one. Two brand accents → one. Two nav widths → 252 everywhere. Five detail architectures → one. Two click affordances → one. Dead "Complete brief" toggle removed. Hit targets ≥44px. "NOT SCORED" second rows replaced by the absence convention. Extracted facts surfaced as fact cards instead of being re-buried in paragraphs.

## Rejected — do not reintroduce

Decorative or stock imagery of any kind. Dark mode. The GOV.UK, Federal Register and FT looks. `docs/design/redesign/` in the repo (superseded 2026-07 package; its README claims the mock wins — it does not).

## Open decisions

- **Artboard 19** — the line at the top of the masthead: four candidates. Pages currently render the band-proportion gradient rule (3px, segment widths = live band counts). Confirm before build; whichever wins applies to all 17 pages.
- **Artboard 18** — how sections sit on the page: four treatments of the same content, one to be chosen and applied everywhere including the system sheet.
- **Not yet designed, captures needed**: mobile 390, tablet 1024, logged-out, loading states as built, overlays (Export brief, Share, per-row `⋯`, Ask AI), data-rich extremes, and the non-owner roles (plain member, read-only viewer).

## Design tokens

Lift these into `theme.css` as the single token set.

```
/* surfaces */
--desk        #E9E6E0   canvas behind the frame
--page        #FAFAF8   page background, row hover, card foot
--card        #FFFFFF
--tag         #F5F2EE   neutral tag / chip background
/* ink */
--ink         #1A1A1A   primary text
--ink-2       #5A6B67   secondary text
--ink-3       #7A6E6C   muted labels
--brand       #5A5552   primary button, brand rule, active chip
/* bands */
--immediate   #DC2626   tint #FEF2F2
--action      #F97316   tint #FFF7ED
--monitor     #2563EB   tint #EFF6FF
--awareness   #16A34A   tint #F0FDF4
/* lines */
--line-1      rgba(0,0,0,.12)   card border
--line-2      rgba(0,0,0,.08)   header divider
--line-3      rgba(0,0,0,.06)   row divider
/* elevation */
--shadow-card 0 1px 2px rgba(26,26,26,.04), 0 4px 14px rgba(26,26,26,.06)
--shadow-frame 0 1px 3px rgba(0,0,0,.06), 0 8px 30px rgba(0,0,0,.06)
/* radius */  6 (controls) · 10 (cards) · 999 (pills)
/* spacing */ 2 4 6 8 10 12 14 16 18 20 28 40
```

**Type.** Display: **Anton**, uppercase, `letter-spacing:.04em` — page titles (34/28), card titles (20), numerals (34/26/18). Text: **Plus Jakarta Sans** 400/500/600/700/800. Scale in use: 8.5 / 9.5 / 10 / 10.5 / 11 / 11.5 / 12 / 12.5 / 13 / 14 px. Row title 14/600; row meta 11; column headers 9.5 uppercase `.12em`/700; rail labels 10.5 uppercase `.12em`/700; body in detail sections 13/1.6 at ≤72ch. Numerals use `font-variant-numeric: tabular-nums`.

**States.** Row hover `#FAFAF8`; tile/card hover `border-color: rgba(0,0,0,.3)`; links underlined at `rgba(0,0,0,.3)`, full ink on hover; selection `#DCE7FB`.

## Assets

None. No imagery is used or wanted. Icons are text glyphs (`⌕ ⋯ ⌘ → ↓`) — substitute the codebase's icon set at the same optical size. Fonts are Google Fonts (Anton, Plus Jakarta Sans); self-host in production.

## Files

- `Caros Ledge UI System.dc.html` — the canvas: system sheet + 17 page artboards + 2 option turns
- `support.js` — runtime needed only to open the HTML locally; not for production
- `screens/` — full-height PNG of every artboard at 1x, in canvas order:
  `00-system-sheet` · `01-dashboard` · `02-regulations-list` · `03-regulation-detail` · `04-market-list` · `05-market-detail` · `06-research-list` · `07-research-detail` · `08-operations-list` · `09-operations-profile` · `10-map` · `11-watchlist` · `12-community` · `13-admin` · `14-account` · `15-settings` · `16-auth` · `17-onboarding` · `18-section-treatments` · `19-masthead-line-options`

Mobile (390) and tablet (1024) artboards are not in this bundle — desktop 1440 only, by decision.
