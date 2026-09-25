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
- Content grid: `padding: 20px 40px 40px; grid-template-columns: minmax(0,1fr) 300px; gap: 28px; align-items: start`. At 1440 that is a **780px content column** (measured; ruled 2026-09-25) and a **300px rail**.
- Nav card: white, `border-radius:10px`, `margin:16px 0 16px 16px`, band-gradient 3px cap, sections `Brief / Intelligence / Network / Operator`, counts right-aligned in each row.
- **Masthead** convention stays: `VOL IV · No. 36 · <date>` line, Anton title (34px list/dashboard, 28px detail), dek or breadcrumb, then the command bar.
- **Command bar** replaces every per-page ask panel: 40px tall, `⌕` glyph, placeholder "Search or ask across 1,434 items…", `⌘K` hint, dark `Ask` button. Typing searches; Ask sends the same text to the assistant scoped to the current page.
- Below 1280 the rail stacks under the content. Below 768 the layout is one column and the nav becomes a drawer (see *Mobile 390*).
- Tab rows (account, settings) span the frame **above** the two-column grid, so rail cards align with the first content card.

### 0.4 Components — defined once, used everywhere

**Band tiles.** Four per row on every list surface. Card: white, radius 10, `padding:14px 16px 0`, flex column; stacked label (`10.5px/800/.08em` uppercase in band colour) over window (`10.5px` muted); Anton numeral 34px in band colour; the 4px band rule is pinned to the card's bottom edge (`margin:auto -16px 0`) so all four rules align regardless of label length. Each tile filters the list.

**List row — one anatomy** for Regulations, Market, Research, Operations, Watchlist, Dashboard:
`grid-template-columns: 3px 56px 1fr 88px 84px 76px 40px 44px; gap: 0 14px; min-height:56px`
= band spine (full-bleed 56px block in the band colour) · jurisdiction code · title + meta line · impact meter · due date + days · timeline · tier · `⋯`.
Hover `background:#FAFAF8`; row divider `1px solid rgba(0,0,0,.06)`; the whole row is the click target (the audit found two competing click affordances — this is the only one). Title truncates with ellipsis; meta line is `11px` muted.

**Impact meter** (kept and used everywhere). Four scored dimensions (cost, compliance, client-facing, operational), each 0–3, summed to `N/12`. **Row variant (revised 2026-09-18):** four rising bars, 8px wide, heights 6 / 9 / 12 / 15, gap 2, track `#E5E1DB`, radius 1.5. The bars are a stepped fill of the TOTAL, not the four dimensions: each bar holds 3 points and fills from the bottom, left to right (`fill_i = clamp(N − 3i, 0, 3) / 3` of its height). All filled bars share one colour, read off the severity ramp at `N/12`: green `#16A34A` at 1 → amber `#CA8A04` at 4 → orange `#F97316` at 7 → red `#DC2626` at 12 (linear interpolation between stops; never through olive). A 1/12 is one low green stub; a 12/12 is four full red bars; two rows with the same total look identical. `N/12` beside it in tabular numerals. Column header reads "Impact" only. No score yet = four dashed outlines plus "needs scoring inputs" (ruled 2026-09-25). The per-dimension breakdown is shown only in the **full variant** (detail rail, dashboard): one continuous bar per dimension over the green→orange→red ramp, revealed from the left by the score.

**Milestone timeline** (kept and used everywhere). Passed = filled green dot; next = larger dot in the item's band colour with a ring; ahead = hollow dot; track green to today, `rgba(0,0,0,.12)` beyond. Row variant is 76px wide; the detail header carries the full-width version with date labels, and the callout is always the next obligation.

**Fact card** — replaces every `FACT: … *Source: …*` paragraph the pipeline currently re-buries in prose. Three variants told apart by form, not just colour: solid ink edge on white = sourced fact (quote, operative date, tier, link); dashed border on raised paper, italic = inference, not citable; orange edge = needs counsel. Raw URLs never appear in running text.

**State note strip** — `border-left:3px solid <band>; background:<band tint>; border-radius:0 6px 6px 0; padding:9px 12px`, text left, one action link right. Sits at the foot of the primary card on every page that has a state worth declaring (lists, map, watchlist, admin, account, settings) and under the timeline on detail pages. Neutral variant uses `#5A5552` on `#F5F2EE`.

**Chips.** Only band chips carry colour (tinted pill, band dot, band-coloured label). Tier is a bordered square `T1`–`T6`. Kind, mode and topic are neutral tags on `#F5F2EE`. Filter chips are grouped in labelled sets (Mode / Band / Region) so a wrapped group keeps its label.

**Absence (revised 2026-09-25).** If the value exists in the data, show it. If it can't exist yet, a small-caps line names the data it needs, starting with "needs": `needs primary-source figure · needs one more month of series · needs your shipment data · connect ↗ · needs scoring inputs`. The words "pending", "unscored" and "not scored" never render. No grey boxes, no red, never a second full row.

**Buttons / stat blocks.** One primary per view, in ink `#5A5552`. Stat block (label / Anton numeral / note) is what profile and admin counters use — never a band tile.

**Detail action row — always visible.** `Export brief` (primary, ink) · `Share` · `☆ Watch` · `＋ Tag`, all four on the detail header, 8px gap, `padding:8px 14px; radius 6`, secondary = white with `rgba(0,0,0,.25)` border and `#F5F2EE` hover. These are not folded into the `⋯` menu; that menu holds only rare and destructive items. Watch renders filled (`★`) when the item is watched.

**Workspace tags.** User-applied labels, shared across the workspace, distinct from pipeline tags. Pill with a 6px **square** ink dot, `#F5F2EE` fill, `rgba(0,0,0,.14)` border, `11.5px/600`, removable `×`. Told apart at a glance from band chips (round dot, band colour) and pipeline tags (no dot, no border). They appear under the detail title, on the list row's second line, as a facet group on every list, and as the source for saved views. `＋ Tag` is a dashed-outline pill that opens a popover with type-ahead over existing tags plus a create option — needed as an overlay artboard.

**Hit targets.** 44px minimum on every toggle row and control; the `⋯` control is a 28px glyph inside a 44px cell with a `1px` left divider.

### 0.5 Detail architecture — one shape for all four detail surfaces

**Title rule (added 2026-09-18).** The masthead title is the item's DISPLAY NAME — Anton 28, max 2 lines, ≤ 72 characters (e.g. "Belgium packaging measures — Decision 1999/652/EC"). The full legal title is the first line of the dek, 12.5px `#5A6B67`, then the issuing body. Never set a legal title in Anton. If no display name exists in the record, derive one: `<jurisdiction> <subject> — <instrument short ref>`; flag it `derived` in the meta line.

**Fact card, v2 (2026-09-18, artboard 21).** Three zones. (1) **Kind band** across the top: 10.5px/800 uppercase kind word + 10.5px muted qualifier, on a tint. (2) **Body row**: figure lead (Anton 22, 132px column, coloured like the edge, with a 10px uppercase sub-label) · claim 13px/1.6 ≤66ch with figures in `<b>` · provenance column 150px (T-square, source, org, link ↗, accessed). (3) Left edge 3px. Kind sets the form: `ACTION REQUIRED` / `LEGAL CONFIRMATION REQUIRED` = `#F97316` edge, `#FFF7ED` band; `DEADLINE` / `BASELINE TARGET` / `NATIONAL TARGET` / `SCOPE` / `PENALTY` / `DEFINITION` = `#1A1A1A` edge, `#F5F2EE` band; `ANALYTICAL INFERENCE` = 1px dashed, `#FAFAF8` band, italic muted body, no figure lead, right note "not citable". The figure lead is the number, date or instruction the card exists for — extracted by the pipeline; when none exists the lead is a ≤3-word instruction ("Register"). Markdown never reaches the DOM.

**Item group header.** Inside S2, facts are grouped under the item's band pill + a 13px/600 item title + muted qualifier, separated by a 1px rule, and closed by an ACTION strip: the state-note component in the item's band tint (`#FEF2F2 / #FFF7ED / #EFF6FF / #F0FDF4`) with a 3px band left edge and the ACTION label in the band colour. Needs-counsel cards sit on `#FFF7ED`. Band tints behind text carry meaning (which band this item is in) and appear on every page that has a band context — lists (band blocks, state notes), details (callout, ACTION strips), dashboard. A section is never a flat stack of identical white cards.

Header (band pill + tier + title + meta) → full timeline → state note → sticky section index (`S1 · S2 · S3 …`) → sections of fact cards at ≤72ch → rail. Section names vary by surface; the shape, rail and index never do. Opening an item from a list returns to the same scroll position, and the rail's "In this list · 4 of 15" keeps the reader's place (AlphaSense behaviour). No tabs, no per-tab ask bar, and no "Complete brief" toggle — that control is an unwired `<span>` today and is removed.

### 0.6 Loading

Nav and masthead render immediately; tiles and rows arrive as skeletons in their final geometry so nothing jumps. A count still loading shows a skeleton, never `0` — a zero is a fact, not a placeholder.

## Mobile 390 (artboard 20)

No new components. The frame collapses; every part is the desktop part at a smaller measure. All targets >= 44px.

- **Top bar** 56px, band rule above it, `☰` left, Anton page title centred, `⌕` and avatar right - each a 44px target. Replaces the desktop nav on the page.
- **Drawer** **288px**, not 208: after 18px padding the current 208 leaves 14px of text room. Same sections, same counts, same footer rows as the desktop rail, over a 30% black scrim (the app's existing scrim value).
- **Masthead** keeps the VOL line, a 24px Anton title, and the wrapped scope line. The command bar stays 44px with the `Ask` button; the `⌘K` hint drops.
- **Band tiles** 2x2, stacked label over window, Anton numeral 30px, bottom rule pinned as on desktop.
- **List row** 76px, two lines: line 1 jurisdiction code + title (wraps, no ellipsis at this width); line 2 meter / date + days / tier / workspace tag / `...` in a 44px cell. **The 76px timeline column is the only thing dropped** - it is on the detail page. Absence keeps its small-caps reason.
- **Filter chips** scroll sideways as whole labelled groups, so a group never loses its label. Facet counts and the workspace-tag facet open in a sheet from `Filters`.
- **Detail header** - the four actions become a 2x2 grid of 44px buttons (`Export brief` primary, `Share`, `★ Watch`, `＋ Tag`). None of them moves into `...`.
- **Timeline** rotates: 62px right-aligned date gutter, 14px dot column, label column. Same dot vocabulary (filled green / ringed band-colour next / hollow ahead) and the same next-obligation callout.
- **Section index** stays sticky at the top of the scroll container and scrolls sideways.
- **Rail** folds under the last section, place-keeping card first (`In this list - 4 of 13 in Action` with prev/next links).

Breakpoints: one column and drawer nav below 768; rail folds below 1280. **375 must not clip** - the row is fluid, not a fixed 390 layout. Tablet 1024 keeps the desktop row and rail at a 220px nav and is not yet drawn.

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
| 8 | Operations list | `/operations` | **Reworked 2026-09-08.** Matrix is a compact scoreboard: score or em dash per cell, 40px rows, nothing expands inside the table. Selecting a cell (region × dimension) opens that cell's facts BELOW the matrix at reading width as standard fact cards (headline figure Anton 18, quote 12.5px, source line). Row header opens the same panel in compare mode: one headline card per region, stacked. Arrow keys move the selection. Sticky first column, horizontal scroll for regions beyond five, "N regions · scroll →" hint. Never five columns of prose |
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

## Codebase constraints (read from Dwarves77/dotfiles@master, audit-2026-09-06)

Source of truth for these: `docs/design/audit-2026-09-06/ASSESSMENT.md` §3, §18, §25, §30–32.

- **Stack**: Next.js App Router, Tailwind v4 (`@theme inline` in `globals.css`), React. Fonts are self-hosted via `@fontsource` (`Anton`, `Plus Jakarta Sans`) — do **not** add the Google Fonts link used in the prototype.
- **Retire, do not extend, the two live token sets.** `theme.css` keeps a legacy orange/blue set alongside an editorial set specifically so unmigrated components keep rendering, with migration stated as "one screen at a time" — that policy is the documented cause of the drift and is replaced by this system. Casualties to remove: `--color-primary #E8610A` and `--accent #1E3A8A` (two brand accents), and the duplicate priority scales where `--moderate` is grey `#6B7280` in one set and `#EAB308` in the other, `--low` grey `#9CA3AF` vs green `#16A34A`.
- **Per-dimension impact colours are dropped.** The old set coloured the four impact dimensions (cost `#CA8A04`, compliance `#9333EA`, client `#0D9488`, operational `#2563EB`). In this system a meter bar's colour encodes its **score** (1 green / 2 orange / 3 red), sorted ascending; dimension identity comes from order and the legend, not hue.
- **Existing surface tokens that carry over unchanged**: `--color-bg-base #FAFAF8`, `--color-bg-surface #FFFFFF`, `--color-text-primary #1A1A1A`, `--color-text-secondary #5A6B67`, `--color-text-muted #7A6E6C`, border `.12 / .06 / .20`. Note `--color-bg-raised` is `#F5F2EE` in the repo; this system uses that value for neutral tags and `#FAFAF8` for row hover and card feet.
- **Nav width**: `Sidebar.tsx` currently hard-codes `width: 208` on the desktop rail (and the drawer). The system specifies **252**; change it in one place, both breakpoints.
- **Mobile nav already exists** — `md:hidden` hamburger, 30%-black scrim, 208px drawer carrying the same nav content. Content does not adapt: only 27 of 160 `.tsx` files carry any breakpoint rule and none of the data components do. Desktop-first is a deliberate scope decision for this bundle.
- **Scroll containment**: the real scroll container is an inner `<main class="overflow-y-auto">`, so browser scroll restoration does not apply. The "returns to the same scroll position" behaviour on list → detail → back must be implemented explicitly against that container.
- **Pagination**: `LIST_FIRST_PAGE_SIZE = 60`, `LIST_REMAINDER_LIMIT = 5000`. First paint is 60 rows of 1,316; the rest arrive after paint. Skeletons and counts must tolerate a list that grows after first render — and a count still loading shows a skeleton, never `0`.
- **CI gates a design must pass**: the rendering guard (`.discipline/rendering/run-rendering-guard.mjs` — overflow, placeholder leakage, hydration faults; new surfaces register a smoke spec), 32 fitness functions (`F35` maintains a `ROW_COMPONENTS` register; `F25` fails on any module built but unreachable — so a component must be wired, not drawn), and the memory gate (any `.tsx` change ships with a session-log entry including a UX compliance block).
- **DP-1 "Single-Pane Operator Review"** (`docs/design/design-principles.md`) is binding on operator surfaces only: every action on one item is reachable from one location. Artboard 13 follows it — every action on a source sits on that source's row. It does not apply to customer-facing UI.
- **Known dead control to delete, not restyle**: the "Complete brief" toggle on `/regulations/[slug]` is an unwired `<span>` with no handler, role or disabled state. Two summary depths, not three.
- **Superseded, do not read as specification**: `docs/design/redesign/` (2026-07 mocks; its README claims "the mock wins") and `design_handoff_2026-04/DESIGN_SYSTEM.md` (named in `theme.css`).

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
  `00-system-sheet` · `01-dashboard` · `02-regulations-list` · `03-regulation-detail` · `04-market-list` · `05-market-detail` · `06-research-list` · `07-research-detail` · `08-operations-list` · `09-operations-profile` · `10-map` · `11-watchlist` · `12-community` · `13-admin` · `14-account` · `15-settings` · `16-auth` · `17-onboarding` · `18-section-treatments` · `19-masthead-line-options` · `20-mobile-390` · `21-detail-parts` (added 2026-09-18: long-title masthead, merged action card, S2 fact-card hierarchy — the review picture for the FactCard, ItemGroup, SectionHeader, Masthead and CommandBar lanes)

Tablet 1024 is not in this bundle. Mobile 390 is artboard 20 (`20-mobile-390.png`).


## Undrawn cases — rulings 2026-09-20

1. **SectionHeader rule.** The 09-07 ruling stands: no rule under the section TITLE. §2.3's "1px rule below" is the rule under the whole header block (index + title + right meta), i.e. the card header divider. Panel 21c shows exactly that. Never a rule directly under the Anton title.
2. **CommandBar.** One bar, no toggle. Typing searches (GET /api/search, results inline below the bar as you type); Enter opens the results page; the Ask button (or ⌘↵) sends the same text to the assistant scoped to the page. Search is not dropped — the toggle is.
3. **Auth frame.** /login, /signup, /onboarding keep artboards 16–17: no nav card, no command bar. The Masthead part IS used there (eyebrow + Anton title + dek), inside the right panel.
4. **Dashboard "What changed".** Stays on ListRow. Strike it from the FactCard consumer list; FactCard consumers are the four details, the operations matrix panel, and research findings.
5. **Legend rail card.** One live ImpactMeter frozen at N=8 next to the text, exactly as artboard 0 and every list artboard draw it. No diagram.
6. **/market/series.** New route, same frame and masthead, "Market / Series board" eyebrow. The inline board comes off /market; the header link "Series board →" points to it.
7. **/admin sub-routes.** Inside the program. Every admin route is the same frame, masthead, SectionCard, StatBlock, ListRow. /admin/factors is a list surface using ListRow with the absence convention ("needs …") for factors that have no value yet.
