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

## TEMPLATE 09 — Map (`feat/redesign-t09-map`)

Branched off `feat/redesign-t02-regulations` to inherit the shell + §2 tokens. The production
Leaflet map component (`MapView.tsx`, real basemap / zoom / fly-to) is KEPT per §6.9 — the mock's
schematic SVG is a placeholder and was NOT copied; only the surrounding layout, marker encoding, and
rail were adopted around it.

### D09-1 · Coverage-gaps rail is data-driven, not the mock's literal rows
- **What:** The mock hard-codes coverage-gap rows (United States 56, EU member states 27, Canada 13).
  The rail instead renders `getCoverageGaps()` (top 5 regions by gap severity), the same
  data-driven card the prior /map shipped.
- **Why:** The count binding forbids hard-coding the mock's snapshot numbers; coverage figures must
  trace to the sources table. The mock's rows are a snapshot, not a spec. Restyled to the mock's
  dashed brass-eyebrow frame, values stay live.

### D09-2 · Mode chips drive an honest note only — the map never filters by mode
- **What:** Selecting Ocean / Air / Road does NOT filter the markers or rail; it surfaces the
  "Mode view pending" dashed note linking to the Regulations index.
- **Why:** Mandated by §6.9 + §7 (item-level mode tags are a known-new backend surface). Mode
  filtering is never faked on the map. (Recorded here because the prior /map DID filter resources by
  mode — this branch removes that so the surface is honest.)

### D09-3 · Priority / Region chips are multi-select with an explicit "All" chip
- **What:** The mock's Priority and Regions groups are single-select. This surface keeps the prior
  /map's multi-select `Set` behaviour (OR-within-group) and adds an "All" chip that clears the set.
- **Why:** Multi-select is a strict superset of the mock's single-select and was already the shipped
  behaviour; "All" makes the empty-set state explicit and matches the mock's chip roster. No data or
  epistemic rule is affected.

### D09-4 · Register band / List cap at 12 jurisdictions with an honest "+ N more"
- **What:** The under-map register band and the List view show the top 12 jurisdictions (by item
  count), then an honest "+ N more jurisdictions · M items — full register on the Regulations index"
  footer computed from the live totals.
- **Why:** Mirrors the mock (12 tiles + "+17 more"). The remainder is derived, never hard-coded; the
  Regulations index remains the full register.

### D09-5 · "Open in Regulations →" passes the jurisdiction as an uppercased region code
- **What:** The focused-jurisdiction panel links to `/regulations?region=<ID uppercased>`. Valid
  Tier-1 ISO codes pre-filter the index; codes outside that set fall through to the full index.
- **Why:** The /regulations page validates `?region=` against `TIER1_PRIORITY_ISOS` and ignores
  unknown codes, so the link is always honest (it lands on Regulations regardless). No jurisdiction →
  ISO mapping table was added (out of T09 scope).

### D09-6 · 1440px screenshot is an anonymous sandbox capture (honest-empty data)
- **What:** `t09-map-1440.png` was captured against the local dev server without a Supabase user
  session (the sandbox has no login credentials), so RLS returns no rows: counts read 0, the register
  shows its empty state, and the "Data temporarily unavailable" banner is shown.
- **Why:** The screenshot verifies the redesigned chrome, the production Leaflet basemap + zoom +
  severity legend (do-not-revert), the filter bar, rail, and honest-empty states. A populated,
  authenticated capture is best confirmed by the operator on the Vercel preview.
