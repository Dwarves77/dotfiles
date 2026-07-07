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

## Template 11 — Community (feat/redesign-t11-community)

Deviations are proposals for operator review, not decisions. Binding schema spec:
`docs/design/redesign/community-schema-mapping.md`.

### D11-1 · Rooms render honest-empty until the 7-room seed runs
- **What:** The "room" is realized as one canonical public `community_groups` row per region
  (7 rows), seeded by `scripts/seed-community-regional-rooms.mjs` (committed, NOT executed). Until
  the main session runs it, the rooms grid renders the honest-pending frame (`NotSeededState`).
- **Why:** No mig-007 forum table and no parallel rooms schema (mapping §1/§4). The seed is a data
  change (writes-script track), separate from this code PR.

### D11-2 · "Request verifier sign-off" is honest-pending
- **What:** The action renders disabled with a title note; no request is written.
- **Why:** Its backing table `community_post_signoff_requests` is committed as migration
  `151_community_post_signoff_requests.sql` but NOT applied (future DDL window, mapping §3.1).

### D11-3 · Leave-room uses a browser-client self-delete (no dedicated endpoint)
- **What:** Join → `POST /api/community/groups/[id]/join` (existing). Leave → RLS-guarded
  self-DELETE on `community_group_members` via the browser Supabase client.
- **Why:** The join route is POST-only; leaving is a self-delete the RLS policy already allows
  (mapping §2 element #8). Mirrors the browser-client pattern in `CommunityPickupsQueueView`.

### D11-4 · "Cite source" writes via the browser client (no set-source endpoint)
- **What:** Existing citations render read-only; attaching one updates
  `community_posts.referenced_intelligence_item_ids` (author-only, RLS) via the browser client,
  choosing from the room's live ledger items.
- **Why:** The column exists (migration 104) but no set-endpoint does (mapping §2 element #18).
  Kept the affordance functional rather than faking it. **Proposed:** a small
  `POST /api/community/posts/[id]/cite` endpoint in a follow-up.

### D11-5 · Region binding is presentation-layer (intelligence_items have no region column)
- **What:** Per-room item counts, "Live in this region" items, themes, and "Who's here" presence
  classify by jurisdiction → room using `src/lib/community/rooms.ts`, reusing the Map surface's
  region vocabulary. HK folds into APAC and MEA displays as "MEAF" (mock vocab); the schema
  `community_groups.region` CHECK is untouched (no migration).
- **Why:** `intelligence_items` carries `jurisdiction`/`jurisdiction_iso`, not a region column
  (mapping §1/§2). Counts are computed + fail-soft (em-dash on absence); no mock snapshot literals.

### D11-6 · Starter questions are generic per-room static prompts
- **What:** Composer starter chips are region-neutral prompts derived from the room name, not
  regulation-specific questions.
- **Why:** No `starter_questions` store (mapping §3.3 permits static config); generic prompts avoid
  asserting specific facts the workspace may not track (no-invented-data rule).

### D11-7 · Screenshot is a faithful static render of the seeded state
- **What:** `t11-community-1440.png` is a 1440px render (headless Edge) of the component in its
  seeded state with representative data, not a live authenticated capture.
- **Why:** `/community` is auth-gated and the 7 rooms are unseeded until the seed script runs, so a
  live capture would show only the honest-empty state. The render uses the exact token hex values;
  a live authenticated capture can replace it once the seed has run.
