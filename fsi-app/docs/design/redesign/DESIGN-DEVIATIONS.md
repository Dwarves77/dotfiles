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

## Template 10 — Account (feat/redesign-t10-account-v2)

### D10-1 · Account is two routes with top-tab links, not one in-page toggle
- **What:** The mock is a single "Account" screen whose top tabs (Profile / Settings) switch in
  place. Production keeps the existing `/profile` and `/settings` routes; the shared
  `AccountMasthead` renders the two top tabs as real links, `aria-current` on the active one.
- **Why:** Preserves deep-linking, back-navigation, per-route server data fetching, and the legacy
  `/settings#hash` aliases. Visually identical to the mock; only the navigation mechanism differs.

### D10-2 · Ban is honest-pending (typed-confirm shown, action disabled)
- **What:** Members & roles renders the rust `Ban` control and a typed-confirmation dialog, but the
  destructive action is disabled with an honest note: platform-wide ban ships with the
  member-management backend (§7). Role change and Remove are fully wired.
- **Why:** Ban is KNOWN NEW BACKEND (§7) and the dispatch forbids faking it; migrations are
  DO-NOT-TOUCH, so no ban column/RPC is introduced. Honest-pending over fabrication.

### D10-3 · Organization tab: "Created" column + preserved owner editor
- **What:** The mock's org table has a "Last activity" column; per-org activity events are unbuilt
  (§7), so the last column renders the real created date labelled "Created". The owner name/slug
  editor (wired to `/api/orgs/[org_id]` PATCH) is preserved below the table; the mock omits it.
- **Why:** No fabricated activity timestamp (§1); no loss of the existing rename capability.

### D10-4 · Data & supersessions / Archive render real data when present
- **What:** The mock shows honest-pending frames for Data & supersessions and Archive. Where the
  live workspace data path already supplies supersessions / archived items, the real
  `DataSummary`, `SupersessionHistory`, and `ArchiveViewer` components render; the honest empty
  copy shows only when the set is genuinely empty.
- **Why:** "Content, counts, dates → production DB wins" (§8.3, §1). Hiding real working data
  behind a pending frame would be less honest than showing it.

### D10-5 · Verifier badge keeps a quiet apply action
- **What:** The mock's Verifier badge tab is status-only. This build keeps a quiet
  "Request verifier sign-off →" action for `none` / `revoked` states that flips
  `verifier_status` to `pending` (the existing write path).
- **Why:** Avoids silently dropping a working conversion moment (§3); styled subordinate so the
  tab still reads as the mock's status card.

### D10-6 · Floating assistant stays; in-page Ask bar stays absent
- **What:** The in-page Ask bar is absent on Account, per §9. The global floating "Ask AI" button
  (AppShell chrome) remains, exactly as it does on Map and Community.
- **Why:** §9 rules the Ask BAR absent; the floating assistant is shell chrome shared by every
  authenticated surface and was not in scope to remove.

### D10-7 · Edition eyebrow is computed, not the frozen mock snapshot
- **What:** The masthead eyebrow renders "Personal preferences · Vol IV · No. {ISO week}" computed
  from the current date (mirroring `EditorialMasthead`), not the mock's frozen "No. 27".
- **Why:** One issue date app-wide, derived from data — never a hard-coded snapshot (§1, §5).
