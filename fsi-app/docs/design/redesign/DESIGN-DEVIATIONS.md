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

## TEMPLATE 06 — Research index (`feat/redesign-t06-research`)

### D06-1 · Severity tiles + theme "N new" counts are derived from loaded rows, not an RPC
- **What:** The masthead total and the ledger-heading total read the verified-gated RPC
  (`getSurfaceCounts('research').totalItems`, fail-soft to the loaded-row count). The four
  severity tiles (Action required / Cost alert / Monitor / Background) and the theme "N new"
  counts are **computed from the real loaded corpus**, not from an RPC.
- **Why:** Research severity and theme are **client-classified** (keyword/recency derivation carried
  over from the shipped `ResearchView`); they are not `intelligence_items` columns, and no RPC
  returns a research severity/theme distribution. Deriving from real rows is the only honest source —
  the mock's snapshot numbers (0/1/0/38, "6/4/1 new") are never hard-coded. When a real
  `severity`/`theme` column + a `by_*` RPC land, the tiles migrate to the RPC with no shape change.

### D06-2 · Promoted key figure renders as a uniform honest em-dash (no backing column)
- **What:** The mock promotes a per-finding key figure (`$139/kWh`, `14.3 MtCO₂e`) in Anton, top-right
  of each finding row. Every row instead renders a muted em-dash `—` with the reason "no key figure
  yet".
- **Why:** No structured `key_figure` column exists on `intelligence_items`. Extracting an arbitrary
  number from summary prose and labelling it "the key figure" would be an unbacked analytical claim
  (violates "never a chip without a backing field" + "no invented data"). The mock's own idiom already
  renders `—` + a reason for figure-less findings (its Hydrogen/Ammonia card), so the honest em-dash is
  on-pattern. **Proposed backend:** a `key_figure` / `key_figure_unit` / `key_figure_label` field
  populated by the analysis pipeline; the slot lights up when it ships.

### D06-3 · Expand panels show honest "not yet extracted" when the callout field is null
- **What:** The finding expander binds the real `what_it_changes` / `does_not_resolve` fields
  (migration 110). When a field is null, the panel header still renders with a muted
  "— not yet extracted for this finding" body rather than hiding the panel.
- **Why:** Honest-state (§4): a populated card with an absent field shows an em-dash + reason, never a
  blank. Keeping both panel headers visible preserves the two-column "what it changes / does not
  resolve" grammar the mock defines.

### D06-4 · Vertical chips default OFF; additive semantics preserved from shipped behavior
- **What:** The mock defaults Live events + Fine art ON. Here all five vertical chips default OFF (the
  page loads showing the full corpus); selecting Live events / Fine art narrows to vertical-relevant
  findings, and the `+ Luxury / + Automotive / + Humanitarian` chips broaden. Zero results renders the
  honest empty + Clear-filters recovery.
- **Why:** Preserves the shipped Sprint-3 fix — defaulting verticals ON with thin, regex-derived
  vertical metadata produced a false empty state on production. Only Live events / Fine art have
  reliable detectors today; the broad chips broaden the set. When per-item vertical tags land, the
  chips become exact per-vertical filters.

### D06-5 · Right-rail source-coverage matrix is a 4-class count over the shown findings
- **What:** The rail shows a 4-row coverage matrix (Peer-reviewed / Think tank / Quantified research /
  Analytical press) counted from the shown findings' source names. It does **not** use
  `get_research_source_coverage()` (migration 100, transport-mode × jurisdiction cells).
- **Why:** The mock's matrix is the 5-source-class analytical-depth distribution, a different axis than
  the mode×jurisdiction coverage RPC. Class assignment is keyword-based over `source.name` (carried
  from `ResearchView`); it is a distribution of the shown set, labelled as such. `sourceCoverage` is
  still threaded through for a future column-backed matrix.

### D06-6 · Masthead is rendered inside the client ledger (not the server page)
- **What:** Unlike T02 (masthead in the server page, ledger below), `ResearchLedger` renders
  `<EditorialMasthead>` itself.
- **Why:** The masthead sub-line's "M themes active" count is client-derived (see D06-1); rendering the
  masthead in the client component is the simplest way to feed it that count without a second
  server-side classification pass. Still the same shared `EditorialMasthead`; shell chrome is unchanged.

### D06-7 · Theme bands collapse to 4 rows with an expander
- **What:** Each theme band shows up to 4 findings, then an "All N in this theme →" toggle (or "All
  findings shown"); the mock shows a static subset + a "+ N more" link.
- **Why:** The real corpus loads all in-window findings per theme, so the collapse is a real
  show-more/less rather than a link to unloaded rows; recency-sorted, matching the mock's footer note.
