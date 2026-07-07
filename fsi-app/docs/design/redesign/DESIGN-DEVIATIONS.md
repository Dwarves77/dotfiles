# Redesign — Design Deviations Log

Deviations are **proposals for operator review, not decisions** (HANDOFF §8.4). Each entry:
template · what deviated · why. The operator reviews and rules.

---

## TEMPLATE 02 — Regulations index (`feat/redesign-t02-regulations`)

### D02-1 · Tile / band-header / section-header counts read `by_priority`, not `by_severity`
- **What:** The T02 SHAPE binding says "severity tiles render `by_severity`." The four tiles,
  the four band headers, and the "N regulations" section header instead read
  `get_surface_counts.by_priority` (the verified-gated RPC priority distribution).
- **Why:** (a) migrations 148/149 — which populate `severity` / `signal_band` and backfill
  ops+reg severity — are **not applied yet** (the binding itself mandates fail-soft to current
  behavior until then); (b) migration 148's own header comment **explicitly holds** the card →
  `by_severity` migration for the operator ("deliberately NOT part of this migration's consumer
  wiring — surfaced to the operator as a held item"); (c) the listing rows carry `priority`
  (effective_priority) but not `severity`, so the four bands (Immediate/Action/Monitor/Awareness)
  group by priority. Sourcing tiles + bands + header from one `by_priority` bundle keeps them
  coherent (a tile can never contradict its band) and is exactly the fail-soft "current behavior."
  When `severity`/`signal_band` are backfilled and the hold is lifted, the tiles migrate to
  `by_severity` with no component-shape change.

### D02-2 · Mode / Topic facet chips carry no numeric counts
- **What:** The mock shows per-facet counts (Air 21, Road 29, topic counts…). The Mode and Topic
  facet chips render as **labels only**; only the Priority facet chips show counts.
- **Why:** No RPC returns a mode/topic distribution, and the count binding forbids both recomputing
  counts from the visible rows and hard-coding the mock's snapshot numbers. Priority facet counts
  are shown because they trace to `get_surface_counts.by_priority`. A future `by_mode` / `by_topic`
  RPC would let these light up.

### D02-3 · Row tier chips are absent on the index (field not carried by the listings RPC)
- **What:** Item rows render a `T{n}` tier chip only when `sourceTier` is present (clamped 1–7).
  `get_workspace_intelligence_listings` does not map source tier onto listing rows, so the chip
  suppresses itself for the whole index.
- **Why:** Chips must bind to a real backing field (DO-NOT-REVERT); an absent field renders no chip.
  This matches the mock (most rows show no tier). Surfacing tiers would require extending the
  listings fetcher — out of T02 scope.

### D02-4 · Row "next date" derives from `item_timelines` only
- **What:** The right-hand date derives from the nearest upcoming `item_timelines` milestone; red
  when within 90 days; absent → em-dash `—` with a muted "No upcoming milestone on record" reason.
- **Why:** The listings RPC does not carry `complianceDeadline`. The honest-state pattern (em-dash +
  reason) is used rather than guessing a semantic label like "In force."

### D02-5 · Kanban-era index affordances not carried into the banded ledger
- **What:** The prior `RegulationsSurface` inline priority-override dropdown, bulk-select/export,
  dismissed-stash, view toggles, and sector-chip + confidence facets are not present in the new
  `RegulationsLedger` (the T02 archetype). `RegulationsSurface.tsx` and its regulations-only
  sub-components remain on disk, now unreferenced.
- **Why:** "Kanban is dead" and the T02 mock is a clean read + filter ledger with none of these
  affordances. Left the old files in place (unreferenced) to keep this diff scoped; **proposed for
  removal in a follow-up.**

### D02-6 · Shell change is global (intended by §5) but ships with T02
- **What:** The 208px text-only sidebar, Admin-as-footer-button, 4px orange→blue masthead strip, and
  white masthead with blue eyebrow are shared-shell changes that affect **every** page's chrome.
- **Why:** §5 states the shell is "identical on all pages," so a global shell is intended. Flagging
  that not-yet-migrated surfaces now inherit the new shell.

### D02-7 · Content column is 1180px (mock); AppShell wrapper stays 1280px
- **What:** The ledger content column is centered at `max-width: 1180px` per the mock; AppShell still
  centers `main` at 1280px.
- **Why:** Left AppShell's wrapper untouched to avoid a blast-radius change to every surface; the
  visual difference is negligible.

### D02-8 · Masthead title keeps its responsive clamp (26–44px) vs the mock's fixed 42px
- **What:** PageMasthead renders the Anton title at `clamp(26px, 6.5vw, 44px)`; the mock is a fixed
  42px.
- **Why:** Pre-existing mobile-a11y adaptation in the shared masthead; at 1440px it renders ~44px,
  effectively matching the mock. Not reverted, to preserve the mobile behavior.
# Design deviations — redesign proposals

Deviations are **proposals**, not decisions. The operator reviews this file.
One entry per deviation: template, what deviated, why, screenshot.

---

## Template 03 — Regulation detail (`feat/redesign-t03-regulation-detail`)

### D1 — Detail-page action color is brand orange via new `--cl-*` tokens, not the existing `--accent` (navy)
- **What deviated.** The live editorial token set in `src/app/theme.css` deliberately
  sets `--accent: #1E3A8A` (navy) for post-2026-04 components. The approved T03 mock
  uses brand orange `#E8610A` as THE action color (Export brief, active tab underline,
  links, accents). HANDOFF §2 lists `accent = #E8610A`.
- **Resolution.** Rather than flip the shared `--accent` (which would restyle every
  neighbor surface — forbidden by the dispatch), I added an additive, detail-scoped
  token block (`--cl-*`) lifted verbatim from the mock, and the T03 surface consumes
  exact mock hex through a local `C` palette constant. No neighbor surface changes.
- **Why.** Smallest-deviation rule + "do not refactor neighbors" + "lift exact hex,
  do not substitute Tailwind defaults." When the redesign reaches the shell/global
  layer, the operator can promote `--cl-accent` to the canonical `--accent`.

### D2 — Hero gradient strip is supplied by AppShell, not re-drawn inside the hero
- **What deviated.** The standalone mock draws its own 4px `#E8610A → #2563EB` strip at
  the top of the hero card. In production, `AppShell` already renders the shell's 3px
  masthead gradient strip at the top of the content column on every page.
- **Resolution.** The T03 hero does NOT draw a second strip (that would render two
  parallel gradient strips a few px apart). The shell strip stands in for the mock's
  hero strip.
- **Why.** Avoids a visual artifact; keeps the masthead strip identical shell chrome
  across pages per HANDOFF §5. If the operator prefers the strip attached to the hero,
  it is a one-line addition.

### D3 — Breadcrumb replaces EditorialMasthead on the detail route
- **What deviated.** `/regulations/[slug]` previously rendered a separate back-link plus
  `EditorialMasthead` (Vol-eyebrow + Anton title + meta) above the surface. The mock puts
  the breadcrumb + Anton title + deck + actions + tabs together inside one hero.
- **Resolution.** The page now composes the breadcrumb middle segment (`Global · IMO`)
  and deck sub-line server-side from real fields and passes them to the surface, which
  renders the full hero. `EditorialMasthead` is untouched and still used by other pages.
- **Why.** HANDOFF §5: "Detail pages replace the volume eyebrow with a breadcrumb."
  Matches the mock's single-hero structure.

### D4 — "Watch" is a local pressed-state toggle (no persistence)
- **What deviated.** The mock shows a quiet "Watch" action. No watchlist table /
  per-workspace membership API exists yet (KNOWN NEW BACKEND WORK).
- **Resolution.** Rendered as a real `aria-pressed` button that toggles local state and
  states the honest pending status in its `title`. It does not fabricate persistence.
- **Why.** Honest-state discipline: render the affordance, do not fake the backend.
  Wire to the watchlist table when it ships.

### D5 — "Connected intelligence" renders the honest pending frame
- **What deviated.** The mock shows two illustrative connected-intelligence rows
  (Corroborates / References). There is no first-class cross-surface link graph on the
  Resource today (only `xrefIds` / `refByIds`, which render in the rail's Linked
  regulations card).
- **Resolution.** The Summary "Connected intelligence" panel renders the §4 pending
  frame rather than fabricating cross-surface rows. Linked regulations remain in the rail.
- **Why.** HANDOFF §1/§4: no invented data. The illustrative mock rows are content, not
  a data contract.

## Template 05 — Signal detail (`feat/redesign-t05-signal-detail`)

Inherits the T03 archetype (breadcrumb hero, action row, 3px orange tab underline,
meta rail, honest-state pending frames, structured Sources) and therefore inherits
T03 deviations **D1** (detail-scoped `--cl-*` tokens / local `C` palette rather than
flipping the shared navy `--accent`), **D2** (shell supplies the gradient strip),
**D3** (breadcrumb replaces `EditorialMasthead` on the detail route — the `/market/[slug]`
page now composes the deck server-side and the surface renders the full hero), and
**D4** (Watch is a local pressed-state toggle; no watchlist backend yet).

### T05-D1 — Hero price board is the honest published-statistics frame until the live feed lands
- **What deviated.** The mock shows four populated price figures (WTI / Brent / Jet fuel /
  ULSD) with context lines. HANDOFF §7 names the "Live price feed (signal hero board slots)"
  as KNOWN NEW BACKEND WORK; those figures are a real EIA snapshot, not a data contract.
- **Resolution.** Committed the backing store (`supabase/migrations/151_published_price_statistics.sql`,
  release-cadence-anchored published statistics, RLS read for authenticated) and read it
  fail-soft server-side. With **no rows** (the feed writer has not populated it) the board
  renders the §4 honest published-statistics pending frame — never faked ticks. When rows
  exist, each becomes an Anton figure card in its severity tone, with the published-stat
  caption + next-release line, and the "Next data drops" rail reads the same `next_release_at`
  values. No seed data is inserted.
- **Why.** Dispatch binding: "Live price feed is KNOWN NEW BACKEND — do NOT fake it; committed
  migration file + honest caption only." Honest-state §4.

### T05-D2 — Six tabs render the 8-section Market Signal Brief; no fabricated verified/analysis or per-mode split
- **What deviated.** The mock's tab bodies carry curated multi-column content — "Verified · EIA
  published statistics" vs "Our analysis" blocks (What's moving), a three-column can-say /
  pitfalls / questions split (Talking points), and Air/Road/Ocean cost cards. Production has the
  8 Market Signal Brief sections as prose in `intelligence_item_sections`, not a per-paragraph
  verified/analysis split or structured per-mode cost facts.
- **Resolution.** Each tab renders its real section(s) via the shared `ProseSection` primitive —
  What's moving = S1; Drivers & trajectory = S2·S3·S5 (+ price `TrajectoryBars` when
  `trajectoryPoints` present, + `conversionTrigger` callout); Cost impact = S4; Client talking
  points = S6; Do now = `recommendedActions` (sorted by priority, `timeframe` as the deadline
  chip) falling back to S7; Sources = structured tier-chip rows (the #172 `stripSources` pattern)
  + S8. Where a section is absent, the honest pending frame renders. The epistemic framing inside
  the prose is whatever the agent emitted; no VERIFIED/analysis chip is fabricated (same posture
  as T03-D6).
- **Why.** No invented data (§1); epistemic chips bind real fields only (§3); DO-NOT-REVERT
  "never a chip without its backing field." Per-mode cost facts are named KNOWN NEW BACKEND (§7,
  state-level cost facts as first-class sourced records) — the Cost impact tab states the em-dash
  convention for missing modes rather than inventing Air/Road/Ocean cards.

### T05-D3 — Do now sorted by `priority`, not a parsed deadline date
- **What deviated.** The mock sorts Do-now actions "by deadline". `RecommendedAction` carries a
  free-text `timeframe` ("Within 7 days", "Jun 9", "Standing") plus a numeric `priority`, but no
  structured deadline date.
- **Resolution.** Actions are sorted by `priority` (1 = highest — the reliable structured proxy)
  and each row shows its `timeframe` string as the deadline chip. The section meta reads "sorted
  by priority" (honest label), not "by deadline".
- **Why.** Sorting free-text timeframes would mis-order ("Standing" vs "Jun 9"); the honest label
  states the real sort key. Reconsider when a structured deadline date lands on the action record.

---

### D6 — Accordion contents bind the real operational briefing, not the mock's verified/analysis columns
- **What deviated.** The mock's Full-summary accordions show curated
  "Verified · checked against the source" vs "Our analysis" vs "confirm with counsel"
  columns. Production has the parsed operational-briefing prose (immediate action /
  what-it-is / compliance chain) + structured `intelligence_item_sections`, not a
  structured verified/analysis split per paragraph.
- **Resolution.** The accordions render the real parsed prose (with the immediate-action
  severity callout where the agent emitted a severity label) and the structured
  RegulationSections. Epistemic chips are only rendered where a backing field exists
  (clamped tier chips on sources; severity label on immediate action). No VERIFIED chip
  is fabricated absent a provenance field.
- **Why.** DO-NOT-REVERT: "never render a chip without its backing field"; epistemic
  grammar must bind real fields. The mock's three-column split is illustrative content.

---

## TEMPLATE 01 — Dashboard (`feat/redesign-t01-dashboard`)

### D01-1 · Dashboard priority tiles as live filters — PLUMBING BUILT, DISABLED (pending operator decision)
- **What:** HANDOFF §6.3 + §9 flag "make the dashboard tiles filter like every other page" as a
  pending operator decision. The plumbing is built (`DashboardHero.onSelectBand` + the
  `TILES_AS_LIVE_FILTERS` constant + a `setBandFilter` state in `HomeSurface`) but **DISABLED**:
  `TILES_AS_LIVE_FILTERS === false`. Until approved, clicking a tile scrolls to the `#priority`
  "This week" list (the mock's `href="#priority"` behaviour).
- **Why:** Explicit "build the plumbing to allow it … flagged, awaiting operator approval." Activation
  is a one-line flip once approved. **Needs Jason's ruling.**

### D01-2 · "Top priority" analysis line binds real `whyMatters`, labeled "Our analysis" (no per-item "do now" field)
- **What:** The mock's glance rows carry an imperative "OUR ANALYSIS · DO NOW" directive with a
  specific recommendation per item. No per-item do-now/recommendation field exists in the schema.
  The row renders the item's stored `whyMatters` under an **"Our analysis"** label (labeled analysis,
  epistemic grammar §3) plus the real `actionOwner` when present; the analysis line is omitted when
  `whyMatters` is absent. No directive text is fabricated.
- **Why:** No-invented-data + epistemic grammar. A structured `do_now` / operational-directive field
  is backend work (§7-class). When it lands, the row swaps `whyMatters` → the directive under a
  "Do now" label with no shape change. **Proposed: add a do-now field to the item contract.**

### D01-3 · Per-item severity eyebrow is priority-derived, not the mock's flavour labels
- **What:** The mock varies the glance-row eyebrow per item ("Action required" / "Window closing" /
  "Cost alert"). These map to no field. The row derives the eyebrow from `priority`
  (CRITICAL → "Action required", HIGH → "High priority").
- **Why:** Count/label integrity — a label must trace to a real field. Flavour labels would be
  fabricated. A future signal-band / severity-flavour field could restore the variety.

### D01-4 · "Top priority" glance-row deadline uses honest em-dash when no dated deadline
- **What:** The mock shows a mix of dates and the semantic status "In force." A row with no future
  `complianceDeadline` / `item_timelines` date renders `— no date` (muted, titled "No dated deadline
  on record") rather than asserting "In force."
- **Why:** Honest-state (§4) — never fabricate a status. Priority-list rows still render the date when
  one exists.

### D01-5 · "This week" change log renders the date-stamped honest state (THE WHATCHANGED RULE)
- **What:** The unified change log's "This week" half renders a summary line + a `checked {relative}`
  stamp derived from the last detection pass (`auditDate`). When new/updated items exist in the
  trailing window they are listed with an explicit "reflects the last detection pass … continuous
  change-detection is not yet live" note.
- **Why:** Binding gate — `item_changelog` writer is Phase 3 (unbuilt); the surface must never imply
  live change detection and must show no fabricated diffs. This is honest date-stamping, not a
  deviation from intent — logged for visibility of the gate.

### D01-6 · Weekly Briefing / Due-this-quarter cards dropped; prior dashboard components now unreferenced
- **What:** The prior dashboard's `WeeklyBriefing`, `DueThisQuarter`, `HousekeepingSection`,
  `TypesetSection`, and `SectionHeader` compositions are not part of the TEMPLATE 01 mock. `HomeSurface`
  no longer mounts them; the files remain on disk, now unreferenced (mirrors D02-5's approach).
- **Why:** The mock's "This week" left column is the top-priority glance list, not a weekly-briefing
  card. Left the old files in place to keep the diff scoped; **proposed for removal in a follow-up.**

### D01-7 · Content column 1180px; masthead title clamp — same as D02-7 / D02-8
- **What:** Dashboard body centers at `max-width: 1180px`; the shared masthead keeps its responsive
  Anton clamp. Both inherit the T02 shell decisions.
- **Why:** Consistency with the shipped shell; see D02-7 / D02-8.
