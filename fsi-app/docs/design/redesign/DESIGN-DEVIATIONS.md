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

## TEMPLATE 08 — Admin (`feat/redesign-t08-admin`)

### D08-1 · Sources sub-tabs (Source registry / Provisional review / Spot-check) all render the same wired view
- **What:** The mock splits Sources into five sub-tabs. Three of them — Source registry, Provisional
  review, Spot-check — resolve to the same existing `<SourceHealthDashboard>`; only Bulk add sources
  (`<BulkImportView>`) and Tier disagreements (`<TierOpinionDisagreementsView>`) route to distinct
  components.
- **Why:** `SourceHealthDashboard` is a monolith that already owns provisional-candidate review and
  recently-auto-approved spot-check inside one surface. Reuse-before-construction (no RPC exists to
  slice it into three separately-paged rows here). The sub-tab still communicates operator intent; a
  future split of the source surface would light these up independently.

### D08-2 · Member role-change / Remove / Ban are honest-pending (no mutation fires)
- **What:** The member rows ship the full affordances — role chip menu (Owner ▾), Remove verb, rust
  Ban verb with a **typed-confirmation dialog**, and a live **last-owner-immovable** guard (Remove +
  Ban disabled on the sole owner). On confirm, the action surfaces an honest "member management lands
  when the backend ships" toast instead of writing.
- **Why:** Member role-change / remove / ban (typed confirm, last-owner guard) is KNOWN NEW BACKEND
  (HANDOFF §7): committed-migration + honest-pending only. No `/api/admin` endpoint for role/remove/ban
  exists yet, so faking a write would violate the no-invented-data rule. The UI + client-side guards
  are built and keyboard-operable; only the server mutation is deferred.

### D08-3 · Rejections filter chip in Flags & rejections is label-only (no count)
- **What:** The merged Flags & rejections queue's three-way filter shows live counts on Integrity and
  Platform (from `useAdminAttention`), but the Rejections chip renders label-only.
- **Why:** No RPC scalar tracks ingest-rejection count at the attention-hook layer, and the count
  binding forbids both recomputing from visible rows and hard-coding the mock's snapshot (131). The
  `<IngestRejectionsView>` still renders its own real rows when the chip is selected.

### D08-4 · Coverage matrix reuses the live `<CoverageMatrixView>`, not the mock's static 5×6 grid
- **What:** The mock hard-codes a 5×6 region×dimension grid (and its own header "15 of 25" contradicts
  its 30-cell body). The build renders the existing `<CoverageMatrixView>` (real, RPC-backed cells with
  dashed pending states) instead.
- **Why:** Counts must be computed from data, and the mock's grid is a snapshot with an internal
  inconsistency. The live component is the authoritative matrix that also drives the Operations
  coverage rail, honoring "the matrix behind the Operations coverage rail."

### D08-5 · Section badges + sub-tab count pills read live scalars, not the mock's static numbers
- **What:** The mock shows fixed red section badges (Sources 531, Ingest 797) and sub-tab counts
  (Provisional 489, Spot-check 42). The build computes Sources badge = provisional pending, Ingest
  badge = integrity + platform flags, and the sub-tab pills from the same `useAdminAttention` scalars —
  each suppressed when zero.
- **Why:** Counts are computed, never hard-coded (binding). The mock numbers are live snapshots; the
  build wires the same fields so the badges track reality and can never contradict the issues rail.
