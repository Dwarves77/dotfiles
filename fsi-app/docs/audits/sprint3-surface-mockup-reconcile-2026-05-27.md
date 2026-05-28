---
title: Sprint 3 Surface ↔ Mockup Reconcile (Research + Market)
date: 2026-05-27
scope: /research and /market customer-facing surfaces vs full-draft mockups landed in commit 83adebc
status: investigation complete; awaiting operator fix-scope pick
authoritative_inputs:
  - design_handoff_2026-05/research.html (845 lines, full draft)
  - design_handoff_2026-05/market-intel.html (768 lines, full draft)
  - fsi-app/src/components/research/ResearchView.tsx (~1113 lines)
  - fsi-app/src/components/pages/MarketPage.tsx (~846 lines)
precedent: Brief-Drift Precedent (mockup is authoritative when scope language conflicts)
---

## Section 1 — Summary findings

The implementations of `ResearchView.tsx` and `MarketPage.tsx` were built against partial-draft mockups (research.html at 37% coverage, market-intel.html at 68% coverage in commit e05368a). The full mockups landed in commit 83adebc and disclose primitives the partial drafts did not include. Both implementations are structurally close to the mockup spine — masthead, stat zone, theme/band rail, AI bar, 2-col layout with right rail — but each diverges on multiple sub-elements that are decorative on the page but load-bearing on the editorial intent.

### Research drift counts

| Category | Count | Highlights |
| --- | --- | --- |
| MATCH | 9 | masthead, priority legend, 4 stat tiles, theme rail (7 cells), AI bar, vertical filter chips, window filter chips, 2-col layout, right-rail "In your sector" + "Source coverage" + "Methodology" cards |
| PARTIAL | 7 | featured-finding shape, theme-section cards, finding-card layout, finding-card right column, bias tag pills, "+ N more" tail, byline-source attribution |
| MISSING | 6 | featured-finding "Does NOT resolve" callout, "What it changes" callout on every card, theme-section count-with-vertical-overlay, repositioning disclaimer banner (mockup L36-37), kicker `.tag` ALL-CAPS topic label, bottom-of-page "view as flat chronological feed" link |
| EXTRA | 1 | featured-flag "Featured" eyebrow text appended after severity pill (mockup never emits this string) |
| VISUAL drifts | ~8 | masthead eyebrow `Vol IV · No. 21 · Sunday` missing; mh-title 44px Anton uppercase intent ambiguous in TSX (uses EditorialMasthead abstraction); separator characters use ASCII commas in TSX where mockup uses middle dot |
| STRUCTURAL | 3 | featured-finding "Does NOT resolve" rail callout, "What it changes" body callout, repositioning disclaimer |

**Net: Research surface ships the spine and the right rail. It misses the editorial "what it changes / does NOT resolve" callout system on cards — which is the mockup's primary differentiator and appears on every single finding card (mockup L488, L507, L513, L524, L529, L538, L545, L568, L574, etc.). That callout is what makes a finding feel like editorial intelligence rather than a headline list.**

### Market drift counts

| Category | Count | Highlights |
| --- | --- | --- |
| MATCH | 10 | masthead, priority legend, 4 → 5 stat tiles (TSX expanded — see PARTIAL #1), category rail (3 bands), AI bar, B1 price snapshot row, 2-col layout, right-rail "Watch this week" + "Methodology" + "Sources tracked" cards |
| PARTIAL | 8 | featured signal layout, signal card layout, trajectory bars (mockup hardcodes vivid orange palette; TSX renders empty-state until data lands), "Highest-priority indicators" rail card, band-head meta-line, band summary copy, severity pill row, sources tracked list (no count "· 14") |
| MISSING | 7 | featured signal "Conversion trigger" rail callout (mockup L522, L601), featured signal "Cross-references" rail callout (mockup L684), "What it changes" callout on every signal card (mockup L532, L538, L555, L561, L610, L616, L627, L633, L644, L649, L693, L699, L710, L715), per-card trajectory bars on B1 secondary signals (mockup L541-545, L564-568), kicker tag eyebrow (e.g. `CARBON` L528, `FUEL` L551), byline-with-source-attribution line, t-pill display next to byline |
| EXTRA | 2 | 5th stat tile for `Competitive edge` (mockup ships 4 tiles only; legend covers 5 but tiles surface 4); honest "Trajectory data not yet available" placeholder on B1 cards (mockup has no placeholder — every B1 secondary card carries a trajectory) |
| VISUAL | ~6 | masthead eyebrow line missing, separator chars (commas vs middle dot), severity color tokens align but legend ordering differs, band-head label format (B1 prefix lives in masthead-prefix span vs band-head pill in mockup) |
| STRUCTURAL | 4 | "Conversion trigger" callout, "Cross-references" callout, secondary-card trajectory bars, "What it changes" callout on every card |

**Net: Market surface ships the band spine and the price snapshot. It misses the same "What it changes" callout system as Research, plus the featured-card "Conversion trigger" / "Cross-references" rail callouts, plus per-card trajectory rendering on B1 secondaries. The TrajectoryEmptyState is an honest Path-B response to absent data (matches integrity rule + Sprint 3 trajectory schema dispatch), so this is data-state divergence, not implementation divergence.**

---

## Section 2 — Research drift report

Implementation file: `fsi-app/src/components/research/ResearchView.tsx`. Mockup: `design_handoff_2026-05/research.html`. Line ranges below cite mockup L## / impl L##.

| # | Primitive | Mockup lines | Impl lines | Classification | Severity | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| R1 | Top gradient bar `.top-line` | L360 | (absent at this level — page chrome) | MISSING (n/a) | VISUAL | Lives in app shell, out of ResearchView scope; flag only if also missing from shell |
| R2 | Masthead title + eyebrow `Vol IV · No. 21 · Sunday` | L381-385 | L471-484 | PARTIAL | VISUAL | Title + meta render via `EditorialMasthead`; eyebrow line `Vol IV · No. 21 · Sunday` is not passed. Separators are ASCII commas vs middle dots |
| R3 | Repositioning disclaimer banner (`<!-- Note: open repositioning decision -->` + `.disclaimer`) | L35-37 (CSS only; the actual `.disclaimer` div is not rendered in this mockup but the CSS exists for it) | absent | MISSING | MICRO | The mockup has the class defined but never emits a `.disclaimer` div in the body; treat as MICRO. Confirm whether the disclaimer was an earlier version |
| R4 | Priority legend (4 chips: Action / Cost / Monitor / Background) | L387-392 | L488-503 | MATCH | — | Same 4 labels, descriptions, dot colors |
| R5 | 4 stat tiles in stat-zone | L393-398 | L504-538 | MATCH | — | Same 4 tiles, click-to-filter behavior added in impl (mockup is static) |
| R6 | Theme rail label `Research · What we cover by theme` | L402-403 | L542-562 | PARTIAL | VISUAL | Mockup uses middle-dot separator; impl uses comma. Sub label format matches |
| R7 | Theme rail (7 theme cells, num + label + sub) | L404-440 | L563-630 | MATCH | — | Same 7 themes, same labels. Impl wires count from data (mockup hardcodes); `cursor: pointer` active state aligns |
| R8 | AI bar with chips | L443-455 | L633-644 | MATCH | — | 4 chip labels match. Placeholder copy matches |
| R9 | Filter row — vertical chips + window chips | L458-466 | L647-687 | MATCH | — | 5 vertical chips + 4 window chips; semantic difference is impl default `verticalsOn` is empty set per Sprint 3 fix (intentional divergence documented at impl L364-368) |
| R10 | 2-col layout `1fr 300px` | L468 | L690 | MATCH | — | |
| R11 | Featured finding (article with severity pill + headline + body + byline + "What it changes" callout + "Does NOT resolve" callout) | L474-491 | L693-694, FindingCard L968-1090 | PARTIAL | STRUCTURAL | Featured card renders via shared `FindingCard featured` prop. Item-head shows severity pill + eyebrow + when; OK. Body + byline OK. **Missing the two right-column callouts**: `.changes-callout` "What it changes" (mockup L488) and the secondary `.changes-callout` "Does NOT resolve" with muted styling (mockup L489). Impl renders only tier pill + severity pill + bias tags. The "What it changes" callout is the editorial differentiator and appears on every card in the mockup |
| R12 | Theme-section card (`theme-sec` with head, summary, body, "+N more" footer) | L494-552 (T1 Emissions), L555-613 (T2 Fuels), L616-659 (T3 Packaging), L662-703 (T4 Carbon), L706-749 (T5 Cold-chain), L752-777 (T6 Last-mile), L780-803 (T7 Disclosure) | L697-775 | PARTIAL | STRUCTURAL | Section shell (head with T-num badge, name, count-with-vertical-overlay, summary paragraph, body, "+N more" link) MATCHES. **Inner finding cards diverge** — see R13 |
| R13 | Finding card inside theme section (item-head with optional severity pill + topic eyebrow + when; h4 title; optional body p; byline with source + t-pill + bias tags; right column with tier pill + severity pill + bias tags + "What it changes" callout) | L502-518 (T1 #1), L519-533 (T1 #2), L535-548 (T1 #3), L563-580 (T2 #1), L581-594 (T2 #2), L596-610 (T2 #3), L624-641, L642-656, L670-685, L686-700, L714-730, L731-745, L760-774, L788-801 | FindingCard L968-1090 | PARTIAL | STRUCTURAL | Implementation grid is `1fr 220px` MATCH. Item-head with severity pill MATCH. h4 title MATCH. summary p MATCH. **Missing**: byline format `<b>Source</b> · Type · t-pill · b-tags` (mockup L483, L506, L523, L539, L567, L585, L600, L628, L646, L674, L690, L718, L735); the b-tag pills (`foundation-funded`, `methodologically-transparent`, `peer-reviewed`, etc.) are partial — impl renders `biasTags.slice(0, 2)` in right column rather than inline with byline. **Missing**: the `.changes-callout` "What it changes" right-column block that EVERY card carries (e.g. L513, L529, L538, L545, L568, L574, L591, L600, L606, L629, L635, L647, L652, L675, L680, L691, L696, L719, L725, L736, L741, L765, L770, L793, L798). Impl renders no equivalent block. **Missing**: `meta` line at right-column foot (`cited 22× · cross-cutting`, mockup L516, L532, L546, L578, L639, L728, L744) |
| R14 | "Action required" / "Cost alert" / "Monitor" severity pills on cards | L477, L487, L566, L599, L689, L763 | SeverityPill L1092-1112 | MATCH | — | Same 4-label vocab. Background/border tones from same severity tokens |
| R15 | T-pill (tier badge) | L482, L514, L530, L546, L575, L592, L607, L636, L653, L681, L697, L726, L742, L771, L799 | L1050-1063 | MATCH | — | Same shape, render in right column |
| R16 | "+ N more in this theme →" footer link on each theme section | L551, L612, L658, L702, L748, L776, (no T7 footer) | L767-771 | MATCH | — | Mockup shows arrow `→`; impl shows plain text |
| R17 | Bottom-of-page footer: `All 34 findings this week organized by theme — view as flat chronological feed` | L805 | L777-779 | PARTIAL | CONTENT | Impl renders count + label only; missing the "view as flat chronological feed" link. Minor |
| R18 | Right rail — `In your sector this week` accent card | L812-816 | L791-803 | MATCH | — | Same shape. Impl suppresses card when `verticalCount === 0` (Sprint 3 documented divergence at impl L784-790) |
| R19 | Right rail — `Source coverage matrix` card with 5-row table | L818-828 | L805-824 | MATCH | — | Same 5 classes (Peer-reviewed, Think tank, Quantified research, Analytical press — note mockup row 5 is `Reuters Sustainable Business`, impl L290 documents this is merged into Analytical press) |
| R20 | Right rail — `Methodology` card | L830-833 | L826-833 | MATCH | — | Same copy paraphrased; minor wording differences |

### Research summary

The implementation faithfully reproduces the spine — masthead, stat zone, theme rail, AI bar, filter row, 2-col layout, theme sections, right rail cards. The drift is concentrated in two places:

1. **The "What it changes" callout system**, which appears on every finding card in the mockup (featured + 14+ secondaries) and is structurally absent from `FindingCard`. The mockup uses this callout as the editorial-intelligence differentiator: each finding tells the reader "here is what this regulatory finding changes for your operations." Without it, the card reads as a headline list.
2. **The featured card's "Does NOT resolve" secondary callout**, which acknowledges scope limits and is a small but high-signal editorial element.

Both drifts are STRUCTURAL: closing them requires extending the `FindingCard` (and likely the `ResearchPipelineItem` type) to carry a `whatItChanges` / `doesNotResolve` field that the agent runtime populates. The other drifts are mostly VISUAL/MICRO (eyebrow line missing, separators, "+ N more →" arrow).

---

## Section 3 — Market drift report

Implementation file: `fsi-app/src/components/pages/MarketPage.tsx`. Mockup: `design_handoff_2026-05/market-intel.html`. Line ranges below cite mockup L## / impl L##.

| # | Primitive | Mockup lines | Impl lines | Classification | Severity | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| M1 | Top gradient bar `.top-line` | L385 | (page-shell, out of scope) | n/a | — | |
| M2 | Masthead title + eyebrow + meta | L406-410 | L228-241 | PARTIAL | VISUAL | Eyebrow `Vol IV · No. 21 · Sunday` missing; "lanes: EU–US, EU–Asia (air primary)" missing from meta; separator chars differ |
| M3 | Priority legend (4 dots: Action / Cost / Window / Monitor) | L412-417 | L245-261 | PARTIAL | CONTENT | Impl shows **5** legend items (adds `Competitive edge`); mockup shows 4. Mockup defines 5-label severity but only legends 4 (per mockup L412-417 explicit ordering: critical / high / moderate / low) |
| M4 | Stat tiles (mockup: 4 tiles in 4-column grid) | L418-423 | L262-273 | PARTIAL | STRUCTURAL | Impl renders **5** tiles in 5-col grid. Documented at impl L262-266: "audit COUNT-MISMATCH" fix to surface `Competitive edge` distinctly. Diverges from mockup; per Brief-Drift Precedent, mockup wins unless operator authorizes 5-tile |
| M5 | Category rail header `Market Intel · what we track by signal type` | L427-428 | L278-298 | MATCH | — | Same wording, same sub label "3 bands · filtered to your lanes" |
| M6 | Category rail (3 cells: B1 Price / B2 Corporate / B3 Corridors) | L429-444 | L299-355 | PARTIAL | VISUAL | Cell shape MATCH (lbl / num / sub grid). Impl uses `<div>` not button (mockup uses `<div class="cat-cell">`). Mockup hardcodes `1 cost alert` / `1 edge` / `2 window closing` overlays in sub — impl renders subtitle only without overlay annotations |
| M7 | AI bar | L448-460 | L358-369 | MATCH | — | 4 chip labels match. Placeholder matches |
| M8 | 2-col layout `1fr 300px` | L466 | L372 | MATCH | — | |
| M9 | Band card shell (head with num pill + name + count meta, summary paragraph, body) | L472-478 (B1), L576-583 (B2), L659-666 (B3) | L380-427 | MATCH | — | Same shape across all 3 bands |
| M10 | B1 Price snapshot row (4-cell grid with lbl, val + unit, delta) | L481-486 | PriceSnapshotRow L610-659 | MATCH | — | Same 4 cells: SAF EU spot, EUA EU ETS, Jet A-1 Rotterdam, Diesel DE retail. Values hardcoded to match mockup |
| M11 | Featured signal in B1 (item-head with severity pill + eyebrow + when; h4; body p; byline with sources + t-pills; right column with severity pill + t-pill + trajectory bars + "What it changes" + "Conversion trigger") | L489-524 | SignalCard L661-756 with featured prop | PARTIAL | STRUCTURAL | Body renders. Right column renders severity pill + trajectory (when band=price). **Missing**: t-pill block (`T3 + T4`), the byline source-attribution line, "What it changes" callout right-column block, "Conversion trigger" muted callout |
| M12 | B1 secondary signals (mockup #1 Carbon Pulse, mockup #2 Reuters Sustainable Switch) | L527-548 (Carbon Pulse), L550-570 (Reuters Sustainable Switch) | SignalCard for non-featured | PARTIAL | STRUCTURAL | Item-head with severity pill + eyebrow MATCH (via `<span>{bandKey}</span>` in impl L727 but mockup shows topic eyebrow like `carbon · pricing` or `fuel · pricing`). h4 MATCH. **Missing**: byline source line. **Missing**: "What it changes" right column callout. **Missing**: per-card trajectory bars (mockup L541-545, L564-568 each render a 12-bar trajectory with hardcoded heights and palette). **Missing**: `meta` line at foot (`2-source signal`, mockup L546) |
| M13 | B2 featured signal (BYD raises $4B) with item-head, h4, body, byline, right-col severity pill + t-pill + "What it changes" + "Conversion trigger" | L586-603 | SignalCard featured | PARTIAL | STRUCTURAL | Same drift as M11 — missing right-column callouts. Note mockup uses severity `Competitive edge` which impl will assign via deriveSeverity based on keyword (`/competitive|edge|advantage|lock(ed)?|offtake|partnership/`). Whether the actual data triggers this match depends on item content |
| M14 | B2 secondary signals (Lufthansa Cargo, Kuehne+Nagel, Maersk) | L605-620 (Lufthansa), L622-637 (K+N), L639-653 (Maersk) | SignalCard non-featured | PARTIAL | STRUCTURAL | Same drift class as M12: missing byline, missing "What it changes" right column, missing meta foot line |
| M15 | B3 featured signal (Hormuz transit risk) with right-col severity + t-pill + "What it changes" + "Cross-references" | L669-686 | SignalCard featured | PARTIAL | STRUCTURAL | Same drift class — missing right-column callouts. Note mockup's "Cross-references" callout (`↗ Operations · Gulf bunkering · Cape route economics`) is unique to B3 — it links the corridor signal to canonical Operations/Regulations briefs |
| M16 | B3 secondary signals (CBAM enforcement window — flagged with `↗ Regulations` link; cross-Alpine rail) | L688-703 (CBAM), L705-719 (Italy-DE truck) | SignalCard non-featured | PARTIAL | STRUCTURAL | Same drift. Note CBAM card mockup shows `Caro's Ledge intersection` byline (mockup L692) — a distinctive intersection-detection signal — and renders `↗ Regulations` cross-link in the right column (mockup L701). Impl doesn't render either |
| M17 | Trajectory bars (12-bar vertical histogram with color gradient and base label) | L504-520 (featured B1), L541-545 (Carbon Pulse), L564-568 (e-SAF) | TrajectoryBars + TrajectoryEmptyState L767-823 | PARTIAL | VISUAL | Impl ships a `TrajectoryBars` component (gated on `trajectoryPoints` data) and a `TrajectoryEmptyState` placeholder. Mockup hardcodes 12 bars with stepped orange palette (`#FCD0BD → #FBA66C → #F88527 → #E8610A → critical`); impl uses muted gray placeholder until per-item data lands. **Path B (per Sprint 3 trajectory-schema dispatch) is intentional — fabricated data violates integrity rule**. This is data-state, not implementation drift |
| M18 | Right rail — `Watch this week · click to filter` accent card | L729-733 | L460-468 | MATCH | — | Same shape. Impl computes `watchAlertsCount = action + cost` MATCH |
| M19 | Right rail — `Highest-priority indicators` card (6-row list with num/▲/↗ symbol + bold label + meta) | L736-745 | L470-499 | PARTIAL | CONTENT | Same shape but rendering driven by data: impl shows up to 6 items filtered by `severity in (action, cost)`. Mockup hardcodes 6 specific indicators (SAF — EU spot, EUA — EU ETS, Lufthansa Cargo capacity, BYD solid-state, CBAM Q1 window, Hormuz transit risk). Mockup uses leading `€1,840` / `€78.40` / `▲` / `↗` micro-typography as `.num` float-right; impl renders only `▲` symbol. The numeric value hover at left is a high-signal differentiator and is missing |
| M20 | Right rail — `Methodology` card | L747-751 | L501-509 | MATCH | — | Same copy paraphrased |
| M21 | Right rail — `Sources tracked · 14` card with names list | L753-756 | L511-516 | PARTIAL | CONTENT | Same names list MATCH. Title MISSING the `· 14` count suffix. Mockup hardcodes 14; impl could count from data when source attribution lands |
| M22 | Per-card byline-with-source-attribution line (`<b>Source</b> · Type · t-pill` pattern) | L498 (B1 featured), L531 (Carbon Pulse), L554 (Reuters), L595 (BYD), L609 (Lloyd's List), L626 (ESG Today), L643 (FT Moral Money), L678 (Lloyd's + Bloomberg), L692 (Caro's Ledge intersection), L709 (Loadstar) | absent on SignalCard | MISSING | STRUCTURAL | Every signal card in mockup carries a byline line that shows publisher name + content type + tier pill. Impl renders `item.jurisdiction` (L738-742) but not the byline; the source field is not threaded into SignalCard. This is the editorial provenance signal — material drift |
| M23 | Featured card "Conversion trigger" muted-style callout | L522 (B1 featured), L601 (B2 featured) | absent | MISSING | STRUCTURAL | Featured cards in B1/B2 carry a secondary muted callout naming the event that converts the signal from observation to commercial pressure (e.g. "CORSIA Phase 2 review · Q4 2026", "First commercial pilot 2028 · charging-corridor agreement signing"). Editorial differentiator |
| M24 | Featured card "Cross-references" callout | L684 (B3 featured) | absent | MISSING | STRUCTURAL | B3 featured carries a `↗ Operations` cross-link to canonical brief. Different from `Conversion trigger`. Need to be aware whether all 3 bands' featured signals get this or only B3 (mockup shows it only on B3) |

### Market summary

The implementation reproduces the spine and the B1 price snapshot row. Drift concentrates in three places:

1. **The "What it changes" + "Conversion trigger" / "Cross-references" callout system on every card** — same shape as Research drift. Featured cards get two callouts; secondary cards get one. Impl carries none.
2. **The byline-with-source-attribution line under each card body** — missing entirely. Impl shows `item.jurisdiction`, not a publisher byline + content type + tier pill.
3. **The 5-tile vs 4-tile stat zone** — impl ships 5 (intentional COUNT-MISMATCH fix), mockup ships 4. Operator decision per Brief-Drift Precedent: mockup wins unless operator authorizes the 5-tile expansion.

The trajectory bars divergence (M17) is intentional Path B per integrity rule — the mockup's hardcoded palette is fabricated data; the implementation's empty-state placeholder is the honest answer until the trajectory schema lands.

---

## Section 4 — Recommended fix scope per surface

Per Brief-Drift Precedent: the mockup is authoritative when its scope language conflicts with prior dispatch scope. The operator picks one of three fix paths per surface.

### Research surface — recommended fix paths

**Path R-A — Targeted patches (recommended)**
- Add `whatItChanges: string | null` + `doesNotResolve: string | null` to `ResearchPipelineItem`. Source from agent runtime (extension to system-prompt.ts 13-field contract → 15 fields).
- Render the "What it changes" callout in `FindingCard` right column (or below body p) for every card.
- Render the "Does NOT resolve" muted secondary callout on the `featured` variant only.
- Add the byline-with-source-attribution line under body title (currently impl drops to `item.sourceName` only; mockup format is `<b>{sourceName}</b> · {sourceType} · <T-pill> <b-tag>...`).
- Pass eyebrow `Vol IV · No. 21 · Sunday` to `EditorialMasthead`.
- Add bottom "view as flat chronological feed" link.

Estimate: **~3-5 hours implementation + agent contract update + 1 regeneration pass (~$23) to populate the new fields across 155 items**. Schema change scope: type-only (no DB migration needed if agent stores in YAML body); add DB column if persistent storage required.

**Path R-B — Structural rebuild**
- Reframe FindingCard entirely as the editorial card per mockup, with the callout system as a first-class slot.
- Extend the data layer to support multiple callout types (changes, does-not-resolve, cross-references).
- Update the theme-section primitive to support the count-with-vertical-overlay sub element.

Estimate: **~8-12 hours + schema migration + agent contract rewrite + full regeneration**. Justified only if Path R-A leaves the surface visually inconsistent.

**Path R-C — Accept divergence**
- Mark current implementation as the new authoritative shape. Update the mockup HTML to match the implementation rather than the reverse.
- Net: ship the surface as-is.

Estimate: **<1 hour, update mockup, document divergence in `docs/design-principles.md`**.

### Market surface — recommended fix paths

**Path M-A — Targeted patches (recommended)**
- Add `whatItChanges`, `conversionTrigger`, `crossReferences` fields to the SignalCard data shape (extension to MarketPage `Resource` props or a richer signal type).
- Render the callout system: `whatItChanges` on every card; `conversionTrigger` on featured (B1/B2) only; `crossReferences` on featured B3.
- Add the byline-with-source-attribution line.
- Authoritative-source decision per Brief-Drift Precedent: collapse 5-tile stat zone back to 4-tile. Surface `Competitive edge` count via the legend (5-label legend stays) but only the 4 tiles in mockup get card treatment. Alternative: operator authorizes 5-tile; document the divergence.
- Pass eyebrow `Vol IV · No. 21 · Sunday · lanes: EU–US, EU–Asia (air primary)` to `EditorialMasthead`.
- Add `· 14` count suffix to `Sources tracked` rail card.
- Either: implement per-card trajectory bars on B1 secondaries (M17 — coupled to Sprint 3 trajectory schema dispatch landing per-item data), or document the placeholder as the canonical shape.

Estimate: **~4-6 hours implementation + agent contract update + 1 regeneration pass (~$23)**. The trajectory data work is separate (Sprint 3 trajectory schema dispatch — already documented in MEMORY).

**Path M-B — Structural rebuild**
- Rebuild SignalCard from scratch against the full mockup including all callout slots.
- Extend signal data model to support per-band right-column variations.
- Reframe trajectory rendering as a first-class data primitive.

Estimate: **~10-14 hours + schema migration + agent contract rewrite + trajectory data ingestion**. Pairs with Sprint 3 trajectory schema work.

**Path M-C — Accept divergence**
- Document current 5-tile decision, empty-state trajectory, simpler signal card as the new authoritative shape.
- Update mockup to match.

Estimate: **<1 hour to update mockup; document divergence**.

---

## Section 5 — Estimates per fix scope option

| Surface | Path | Implementation hrs | Agent contract change | Regeneration cost | DB migration | Total business-day estimate |
| --- | --- | --- | --- | --- | --- | --- |
| Research | R-A targeted | 3-5 | Yes (13→15 fields) | ~$23 (one full pass) | Optional (col add) | 0.5-1 day |
| Research | R-B rebuild | 8-12 | Yes (larger rewrite) | ~$23 | Likely yes | 1.5-2 days |
| Research | R-C accept | <1 | No | None | None | 0.1 day |
| Market | M-A targeted | 4-6 | Yes (3 new fields) | ~$23 | Optional | 1-1.5 days |
| Market | M-B rebuild | 10-14 | Yes + trajectory dispatch coupling | ~$23 + trajectory ingestion | Yes (trajectory + signal fields) | 2-3 days |
| Market | M-C accept | <1 | No | None | None | 0.1 day |

**Combined recommended scope (R-A + M-A)**: ~7-11 implementation hours, 1 combined agent contract update, 1 full regeneration pass (~$23, ~6 hours wall clock per b2-runner pattern), optional schema column add. ~1.5-2 business days end-to-end. Sprint 3 budget posture compatible.

**Combined defer scope (R-C + M-C)**: ~0.2 day to update mockups + document divergence in `docs/design-principles.md`. Ships current surfaces as-is. Acceptable per Brief-Drift Precedent **only if operator explicitly authorizes** mockup-update-to-match-impl, since default precedent is mockup wins.

**Mixed (R-A + M-C)**: only patch Research (the more substantial drift), accept Market divergence. ~0.6-1 day. Pragmatic if trajectory schema dispatch is the binding constraint on Market.

---

## Operator decision required

Three open decisions:

1. **Research scope**: R-A / R-B / R-C
2. **Market scope**: M-A / M-B / M-C
3. **5-tile vs 4-tile stat zone on Market** (independent of M-path): mockup ships 4, impl ships 5 with documented audit-COUNT-MISMATCH rationale. Either authorize the 5-tile divergence or revert to 4 per mockup.

Investigation surfaces three findings the agent recommends but does not act on without authorization:

- A1. Treat the "What it changes" callout as a first-class data field on both surfaces. It is the editorial-intelligence differentiator and missing it materially weakens the customer-facing shape on both pages.
- A2. The trajectory bar data state (Market M17) is correctly handled per integrity rule; no fix needed beyond Sprint 3 trajectory schema dispatch (already in progress per MEMORY).
- A3. Bring the byline-with-source-attribution line back on both surfaces. It's missing on both and carries the source provenance signal that the source-credibility model depends on.
