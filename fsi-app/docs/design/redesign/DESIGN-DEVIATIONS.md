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

## TEMPLATE 07 — Operations (`feat/redesign-t07-operations`)

Branched off `feat/redesign-t02-regulations` to inherit the shell + §2 tokens + the
EditorialMasthead archetype. New surface component `OperationsLedger.tsx`; the prior
`components/pages/OperationsPage.tsx` is now unreferenced (left on disk per D02-5).

### D07-1 · Severity tiles are display, not clickable filters
- **What:** HANDOFF §6 (general index pattern) makes severity tiles clickable filters. The T07
  Operations tiles render as **display tiles** (no `onClick`, not buttons).
- **Why:** The "Pages - 07 Operations" mock's tiles carry no `pick` handler (unlike the dimension
  chips, which do) — Operations is a structured-content read surface, not a filtered ledger, so the
  tiles are a headline count board. Matched the mock exactly. The interactive filter affordance on
  this surface is the D1–D6 **dimension chips** (real `aria-pressed` buttons that spotlight a
  dimension's cells across expanded regions).

### D07-2 · Severity-tile counts read `by_priority` (same fail-soft as D02-1)
- **What:** The four tile numbers read `get_surface_counts('operations').by_priority` (verified-gated
  RPC), fail-soft to the scoped-aggregates RPC.
- **Why:** Identical rationale to D02-1 — migrations 148/149 (severity backfill) are not applied yet,
  and Operations uses the Critical/High/Moderate/Low vocab that maps 1:1 to `by_priority`. Never the
  mock snapshot, never recomputed from rows. Migrates to `by_severity` when the hold lifts.

### D07-3 · Dimension-cell key figure uses the region's context hue (not a per-figure severity)
- **What:** In an expanded region, each D2–D6 cell shows the first sourced fact's value as an Anton
  key figure, colored with the **region's** severity hue (HANDOFF §2 "key figures in the severity
  color of their context").
- **Why:** `regional_data_facts` rows carry no per-figure severity signal, and inventing one would
  imply a judgment the data doesn't support. Tying the figure to its region's card severity is the
  honest reading of "context" and avoids a fabricated per-number severity.

### D07-4 · By-state sub-list — state rows derive from regulation cross-refs; every cost figure is PENDING
- **What:** The US "By state" sub-list groups US **regulations** by state (real cross-ref data) and
  renders each state's cost figure as an em-dash "—" plus the dashed **STATE-LEVEL COST FACTS
  PENDING** frame.
- **Why:** State-level cost facts (minimum wage, labor rates, fuel taxes) are known new backend
  (HANDOFF §7). This PR ships their schema home only — committed migration `151_state_cost_facts.sql`
  (per-state, `source_id` FK + `statute_citation`, world-readable RLS) — and renders the honest
  pending frame until sourced, cited rows land. Per §1/§4 a US state without a sourced figure shows
  a dash, **never** a national number. State grouping reuses the surface's existing region-regex
  pattern (same class already used for region grouping); the reserved EU member-state sub-list is not
  populated (mock shows US only).

### D07-5 · Active-items list reuses `OperationsItemsView` rather than the mock's compact row
- **What:** The mock's "Active operations items" is a compact `region / title / date` row list. This
  PR reuses the existing `OperationsItemsView` card (severity pill + jurisdiction + date + optional
  tier chip, links to `/operations/[id]`).
- **Why:** Reuse-before-construction — `OperationsItemsView` already renders honest, gated,
  detail-linked items with the correct severity + tier-chip discipline. Rebuilding the compact row
  would duplicate that logic. The card is visually heavier than the mock row but semantically richer
  and honest.

### D07-6 · Migration 151 is committed but NOT applied by this PR
- **What:** `151_state_cost_facts.sql` is added as a file only; no data write, no apply.
- **Why:** Scrape hold live; NO spend/fetch/mint (dispatch constraint) + the code-vs-data separation
  (`.claude/CLAUDE.md`) — migrations land via a separate operator-ruled data dispatch. F6
  (migrations-numeric-ordering) passes with 151 following 150.

### D07-7 · PR screenshot is an anonymous local render (counts/items thin)
- **What:** The 1440px screenshot was captured against a local dev server with no workspace session,
  so the severity tiles read 0 and the item/regulation lists are empty; region facts (D2–D6 = 3/5)
  come through the service-role coverage fetch, and the US card + By-state pending frame render fully.
- **Why:** The route auth-gates via `proxy.ts` and the headless sandbox cannot hold a Supabase
  workspace session. The capture demonstrates the layout, the epistemic/honest-state system, and the
  By-state pending frame; production (authed) fills the tiles + lists from the same bound fields.
