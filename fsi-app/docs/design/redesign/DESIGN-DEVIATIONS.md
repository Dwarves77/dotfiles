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

## TEMPLATE 04 — Market Intel index (`feat/redesign-t04-market-intel`)

Note: this template RESOLVES D02-1's deferral for the Market surface — the five severity tiles bind
`get_surface_counts('market').by_severity` and the three-band strip binds `.by_band` **directly**
(migrations 148 + 149 are applied to prod). That wiring is the intended binding, not a deviation.

### D04-1 · Key figure renders the honest em-dash on every card (no live price feed)
- **What:** The mock hard-codes a per-signal key figure ($89/bbl, $3.07/MMBtu, +20–31%, …). In
  production the figure binds `marketData.currentPrice` (a real sourced field); `market_signal` rows
  carry no such value and no commodity-price feed is connected, so the figure renders the honest
  em-dash `—` with a muted "no price dimension" reason on essentially every card.
- **Why:** No-invented-data (§1) and honest-state (§4) forbid rendering the mock's snapshot numbers as
  if live. When a price source is wired (or a per-signal figure field lands), the same slot fills from
  the real field with no shape change. Matches the surface-honesty posture already shipped on this page
  (price snapshot / trajectory / sources roster are all honest-empty).

### D04-2 · Expander notes textarea + "Your note" chip omitted
- **What:** The mock's expanded card includes a localStorage-backed notes textarea labelled "visible to
  your workspace" plus a blue "Your note" head chip. Both are omitted; the expander ships the three
  panels the §6.4 spec lists (Trajectory / What it changes / Conversion trigger).
- **Why:** (a) §6.4 enumerates only those three panels; (b) a device-local `localStorage` note labelled
  "visible to your workspace" would be an integrity violation (claims workspace visibility it does not
  have). Real workspace-visible notes need a backend write (`workspace_item_overrides.notes`), which is
  out of this read-surface template's scope and gated by the no-write hold. **Proposed** as a follow-up
  once a notes write path exists.

### D04-3 · Competitive-edge colour split preserved verbatim from the mock (tile blue / ledger green)
- **What:** The mock renders the Competitive-edge TILE in accent-blue (`#2563EB`) but its ledger band
  head and key figure in green (`#16A34A`). This per-context split is reproduced exactly (tokens
  `--mi-edge-tile` vs `--mi-edge`).
- **Why:** "Match the mock to the pixel" (§8.1). The split looks like a mock authoring slip (the §2
  token table pairs Competitive edge with accent-blue); surfaced here in case the operator wants the
  ledger band + figure normalised to blue. No change made unprompted.

### D04-4 · Full ledger rendered (no mock "88 monitoring rows in the full ledger" split)
- **What:** The mock shows 6 detailed cards and defers "the other 88 signals" to a separate "Open full
  ledger →" view. Production renders the full verified, category-routed market set as signal cards
  grouped by severity; there is no separate monitoring-rows store or "Open full ledger" footer.
- **Why:** The 6-vs-88 split was mock scaffolding for a snapshot. The live `get_market_intel_items`
  RPC returns the real verified rows; rendering them all is more honest than inventing a hidden tail.
  The authoritative per-severity tile/band counts still come from the RPC, with a "N shown" disclosure
  beside a group header only when the rendered cards differ from the authoritative count.

### D04-5 · 1440px screenshot to be captured from the authenticated Vercel preview
- **What:** The per-template acceptance screenshot is not committed from local capture.
- **Why:** `/market` is `force-dynamic` and auth/DB-gated; the build environment for this branch has no
  browser automation and no authenticated session, so a faithful populated capture isn't reproducible
  locally (an unauthenticated local render shows only the honest empty state). The screenshot is to be
  taken from the authenticated Vercel preview linked in the PR.
