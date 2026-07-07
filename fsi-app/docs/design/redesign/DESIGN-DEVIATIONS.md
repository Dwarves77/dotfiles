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
