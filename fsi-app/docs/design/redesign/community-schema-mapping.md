# Template 11 (Community) — Schema-Mapping Report

**Status: GATE — report only. No UI built. No schema changed. No migration written or applied.**
Awaiting Jason's go decision before Template 11 builds.

- Branch: `docs/redesign-t11-community-mapping` (off `master`)
- Date: 2026-07-06
- Scope: READ-ONLY investigation + this one report doc.
- Sources read: HANDOFF §6.11 + §7; mock `Pages - 11 Community.dc.html`; migrations
  `007`, `027`, `028`–`032`, `041`, `042`, `046`, `075`, `104`, `105`, `109`, `116`, `148`;
  community app/route/component code under `src/app/community`, `src/app/api/community`,
  `src/components/community`, `src/components/admin/CommunityPickupsQueueView.tsx`.
- Live-DB note: the Supabase MCP connection available to this session exposes only an unrelated
  project ("Dietl Expenses"); the Caro's Ledge project is on a different account and was **not
  queryable here**. Per the doctrine that live counts/emptiness are STATE (not doctrine), this
  report treats the **committed migrations as the schema source of truth** and the binding-context
  claim ("conversation layer EXISTS — built, live, empty") as given. Any go decision that depends on
  exact live row counts should confirm against `/admin` or a service-role query at build time.

---

## 0. Executive summary (for the go decision)

- **Two community schemas exist in the repo. Template 11 maps ENTIRELY onto the newer one.**
  - **KEEP / BUILD ON — the "conversation layer" (migrations 027–032, 041, 042, 046, 104, 105):**
    `community_groups`, `community_group_members`, `community_group_invitations`,
    `community_posts` (posts + threaded replies), `community_topics(+_groups)`,
    `notifications`, `notification_preferences`, `moderation_reports`, `post_promotions`,
    the `community_region_counts()` RPC, the RLS helper functions, and `profiles` (identity +
    `verifier_status` + `jurisdiction_overrides` + `workspace_role`). This is the layer the current
    `/community` route already runs on.
  - **DO NOT TOUCH — the mig-007 "forum layer" (Phase-7 ERASE list):** `forum_sections`,
    `forum_threads`, `forum_replies`, `vendors`, `vendor_regulations`, `vendor_technologies`,
    `vendor_endorsements`, `case_studies`, `case_study_endorsements`, `taxonomy_nodes`,
    `notification_subscriptions`, `notification_events`, `notification_deliveries` (13 tables).
- **mig-007 resurrection risk: NONE.** No element the mock renders requires any mig-007 table. See §4.
- **Mapping tally (26 discrete mock elements):**
  - **13 MAPPED** outright to an existing table/column/endpoint.
  - **7 MAPPED-WITH-ADAPTATION** (existing tables, but a read query, aggregation RPC, or seed row is
    needed — no new table).
  - **6 GENUINELY ABSENT** — of which **only 1 needs a new table** (`community_post_signoff_requests`,
    per §7). The other 5 are: two count RPCs (functions, not tables), one static config (starter
    questions), a region-vocabulary reconciliation (optional CHECK alter), and vertical-groups
    (honest-pending frame — no build now).
- **What T11 can build NOW (no DDL):** the whole page except the *Request verifier sign-off* action
  and the live *item/discussion count* numerals. Rooms grid, room header + Join/Leave, "Live in this
  region" ledger, Discussions composer + thread cards (You·Owner, static Unverified, Reply, Cite
  source, Delete, reply count), "Who's here", "Why post here → Admin pickups", "Verifier status", and
  the "Vertical groups · none yet" pending frame all sit on existing tables/endpoints. The absent
  pieces render as honest-pending frames (§4) until their one migration lands in a future DDL window.

---

## 1. The "room" ↔ "group" architecture note (read this first — it governs the whole mapping)

The mock's unit is a **fixed regional ROOM** — 7 rooms (`GLOBAL, EU, US, UK, APAC, LATAM, MEAF`),
one per region, not user-created, with item counts drawn **from the ledger** (`intelligence_items`),
not from community content.

The existing schema's unit is a **user-created `community_groups` row**, region-*tagged* (a `region`
column), many-per-region. There is **no "room" entity keyed by region**, and the room's headline
*item* count is registry data, unrelated to `community_groups`.

**Recommended realization (no new table): seed ONE canonical public `community_groups` row per region
(7 rows) and treat that row as "the room."** Then:
- discussions in a room = `community_posts` where `group_id = <region room group>`;
- Join/Leave = `community_group_members` on that group;
- the room's *item* count = `intelligence_items` filtered by region (separate aggregation);
- the room's *discussion* count = `community_posts` count on that group.

This keeps the mock's region-first mental model while reusing the built conversation layer verbatim.
The alternative (add a `region`-scoped posting path or a new `rooms` table) is **rejected** — it would
create a parallel schema next to `community_groups`, the exact anti-pattern the Phase-7 erase is
removing. **Seed data + two count queries, not new structure.**

**Region-vocabulary mismatch (decision needed, §3/§5):** the `community_groups.region` CHECK
(migration 028) is `EU, UK, US, LATAM, APAC, HK, MEA, GLOBAL` (8 values). The mock's 7 rooms fold
**HK into APAC** (Jason's home jurisdictions are "EU · Hong Kong · United Kingdom" and the mock shows
him "here" in EU/UK/APAC) and label **MEA as "MEAF"**. This is reconcilable at the presentation layer
(map HK→APAC, display "MEA" as "Middle East & Africa") with **no migration**, OR by a CHECK alter if
`MEAF` must be a literal code. Recommend presentation-layer mapping; treat the CHECK alter as optional.

---

## 2. Element-by-element mapping

Legend: **MAPPED** = existing table/column/endpoint serves it directly · **ADAPT** = existing tables,
needs a read query / aggregation RPC / seed row (no new table) · **ABSENT** = not modeled; see §3.

### 2A. Regional rooms grid

| # | Mock element | Verdict | Maps to |
|---|---|---|---|
| 1 | Rooms grid (7 fixed regional rooms) | ADAPT | Seed 7 canonical public `community_groups` rows (one per region). No new table; see §1. |
| 2 | Per-room **item count** + "94 active items across 7 rooms" | ADAPT | `intelligence_items` filtered by region (`region_tags[]` / `jurisdiction_iso[]`). **NOT** `community_region_counts()` — that RPC counts *groups*, not items. Needs a per-region item-count aggregation (small RPC; adjacent prior art: `109_region_dimension_coverage`, `148_surface_counts`, `116_active_intelligence_items_view`). |
| 3 | Per-room **themes** line (e.g. "Emissions · Reporting · Digital") | ABSENT (derive/static) | No themes field on a room. Derive from `intelligence_items.topic_tags` per region, or ship as static room config. No migration required. |
| 4 | "You're here" chip | MAPPED | `profiles.jurisdiction_overrides[]` (home jurisdictions) ∩ room region. (Mock: "Presence comes from profile home jurisdictions.") |
| 5 | Per-room **discussion count** ("N discussions" / "no discussions yet") | ADAPT | `count(community_posts) where group_id = room group and parent_post_id is null`. Aggregation over existing table. |
| 6 | Room hue by priority (Critical/High/Moderate) | MAPPED (derive) | Derive from the region's max `intelligence_items.severity`, or the room-config priority. Presentation-only. |

### 2B. Room panel

| # | Mock element | Verdict | Maps to |
|---|---|---|---|
| 7 | Room header (name, meta line) | MAPPED | Room `community_groups` row (name) + derived meta (item/jurisdiction summary). |
| 8 | Join / Leave toggle | MAPPED | `community_group_members` (insert/delete) via `POST /api/community/groups/[id]/join`. Membership cache maintained by the 029 trigger. |
| 9 | "Live in this region · from the ledger" items (link into Regulations / Market Intel / Operations / Signal detail) | ADAPT | `intelligence_items` filtered by region → route by `item_type` to the right surface (existing Format Mapping). Reuse `116_active_intelligence_items_view`. Read query, no new table. |
| 10 | Discussions card container + "Peer signal · unverified until signed off" chip | MAPPED | `community_posts` (epistemic label is static copy — the platform's by-design "unverified" treatment). |
| 11 | Composer (input, Post on Enter/click) | MAPPED | `POST /api/community/posts` (create top-level post; `title`+`body`, `group_id` = room group). |
| 12 | Starter-question chips (prefill composer) | ABSENT (static ok) | No `starter_questions` store. Ship as static per-room config now; optional lightweight table later (§3). |
| 13 | Thread card (title, body) | MAPPED | `community_posts` (top-level; `parent_post_id IS NULL`, `title NOT NULL`). |
| 14 | "You · Owner" chip | MAPPED | "You" = `author_user_id == auth.uid()`; "Owner" = `profiles.workspace_role`/`org_memberships.role = 'owner'`. |
| 15 | Dashed "Unverified" chip (per post) | MAPPED (static) | Static epistemic treatment — every peer post is unverified by design. The *verified transition* (post earns citable status after sign-off) is ABSENT — see #18. |
| 16 | Thread timestamp | MAPPED | `community_posts.created_at`. |
| 17 | Reply action | MAPPED | `POST /api/community/posts/[id]/replies` (`community_posts` self-referential via `parent_post_id`). |
| 18 | Cite source action | ADAPT | `community_posts.referenced_intelligence_item_ids UUID[]` already exists (migration 104) + the compose parser that populates it. Needs a UI affordance / small set-endpoint; **column exists**, no new table. |
| 19 | **Request verifier sign-off** action | ABSENT (new table) | **The one genuine new-table gap.** No per-post sign-off request state exists. `profiles.verifier_status` marks *who is a verifier*, but there is no request/decision record tying a post to a sign-off. Needs `community_post_signoff_requests` (§3, §7). Until then: render the button in an honest-pending state. |
| 20 | Delete action | MAPPED | `DELETE /api/community/posts/[id]` (RLS: author or group admin/moderator). |
| 21 | "N replies" | MAPPED | `community_posts.reply_count` (maintained by the 030 trigger). |
| 22 | Discussions empty state | MAPPED | Honest-state pattern over an empty `community_posts` result. |

### 2C. Rail

| # | Mock element | Verdict | Maps to |
|---|---|---|---|
| 23 | "Who's here" roster + presence count | ADAPT | Roster = `profiles` whose `jurisdiction_overrides[]` include the room region (mock: presence = home-jurisdiction membership, **not** real-time online presence). Count = size of that set. Query over existing `profiles`; no presence table needed. |
| 24 | Owner chip on the roster row | MAPPED | `profiles.workspace_role` / `org_memberships.role`. |
| 25 | "network is N members, grows by workspace invitation" | MAPPED | `org_memberships` (member count) + `org_invitations` (migration 076) / `community_group_invitations` (029). |
| 26 | "Why post here" → promotion pipeline → **Admin pickups (0 pending)** | MAPPED | Fully built: `post_promotions` (041) + `staged_updates` + `POST /api/community/posts/[id]/promote` (always-staged; direct-to-intelligence path removed 2026-06-28) + `CommunityPickupsQueueView` (engagement heuristic: `reply_count >= 3`, `< 30 days`, `promoted_at IS NULL`). "0 pending" = count of queue rows. |
| 27 | "Verifier sign-off" rail + "You are not a verifier" | MAPPED | `profiles.verifier_status` (`none`→`pending`→`active`→`revoked`) + `verifier_since`. |
| 28 | "Vertical groups · none yet" dashed pending frame | ABSENT (pending frame) | `community_groups` is region-typed only; no vertical axis (no `vertical`/`vertical_tags` column on groups). Mock already renders this as a pending frame — build the frame now; model verticals later if/when they form. No migration now. |

(28 rows across three sections; #6 and #15 are presentation/static sub-parts, so the headline
"26 discrete elements" in §0 counts the substantive data-bearing elements.)

---

## 3. Genuinely-absent pieces — committed-migration shapes (for a FUTURE DDL window)

**Not written and not applied here — specification only.** These are the shapes to commit as migration
files when a DDL window opens.

### 3.1 (REQUIRED — the only new table) `community_post_signoff_requests` — verifier sign-off per §7

Backs mock element #19 ("Request verifier sign-off") and the epistemic conversion moment
(HANDOFF §3: peer signal → citable after a verifier signs off).

```
create table community_post_signoff_requests (
  id             uuid primary key default gen_random_uuid(),
  post_id        uuid not null references community_posts(id) on delete cascade,
  requested_by   uuid not null references auth.users(id) on delete set null,
  status         text not null default 'pending'
                   check (status in ('pending','signed_off','declined','withdrawn')),
  verifier_id    uuid references auth.users(id) on delete set null,   -- who acted; must have profiles.verifier_status='active'
  primary_doc_url text,                                               -- the primary document the verifier checked against
  decision_note  text,
  created_at     timestamptz not null default now(),
  decided_at     timestamptz
);
-- one open request per post (defence-in-depth):
create unique index uniq_signoff_open_per_post
  on community_post_signoff_requests (post_id) where status = 'pending';
-- RLS: requester reads own; active verifiers + platform admins read all pending;
--      INSERT by any group member (self as requested_by); decision UPDATE by
--      active verifiers (profiles.verifier_status='active') or platform admin, service-role for tooling.
```
Companion column (same window): on a `signed_off` decision, a post becomes citable. Either add
`community_posts.signed_off_at timestamptz` (+ `signed_off_by`), or derive verified state by joining
this table. Adding the column is simpler for the epistemic-chip read path. Flag for the build decision.

### 3.2 (RPCs — functions, not tables; low-risk, can share the window)

- `community_room_item_counts()` → `(region text, item_count bigint)` — per-region `intelligence_items`
  count under the customer provenance gate (backs element #2). Model on `community_region_counts()`
  (security-invoker, RLS-respecting) but over `intelligence_items`/`active_intelligence_items` instead
  of `community_groups`.
- `community_room_discussion_counts()` → `(group_id uuid, region text, thread_count bigint)` — per-room
  top-level `community_posts` count (backs element #5).

Both are pure read aggregations; could equally be done as inline `.select(count)` queries at build time,
avoiding new functions entirely. Prefer inline queries first; promote to RPC only if the per-render
query count justifies it (the same reasoning that produced `community_region_counts()` in migration 042).

### 3.3 (OPTIONAL) `community_room_starters` — starter-question chips (element #12)

Only if starter questions must be operator-editable data rather than static per-room config.
```
create table community_room_starters (
  id         uuid primary key default gen_random_uuid(),
  region     text not null,               -- room region code
  text       text not null,
  sort_order int not null default 0,
  active     boolean not null default true
);
```
Recommendation: **ship static config now**, defer this table unless editing is asked for.

### 3.4 (OPTIONAL) region-vocabulary reconciliation (element #1, §1)

If `MEAF` must be a literal region code and HK a first-class room, alter the
`community_groups.region` CHECK. Recommendation: **do NOT** — map at the presentation layer
(HK→APAC, display MEA as "Middle East & Africa"); no migration.

### 3.5 (NO migration) vertical groups (element #28)

Honest-pending frame only. No structure until verticals actually form; the mock itself shows a pending
frame here.

**Data seed (not a migration, but required before the rooms grid is meaningful):** 7 canonical public
`community_groups` rows, one per region (§1). This is a service-role writes script (data change), not
schema — lands via the writes-script track, not a DDL window.

---

## 4. mig-007 forum-layer resurrection check — CONFIRMED CLEAR

**Does the mock imply resurrecting any mig-007 forum-layer table? NO.**

Every discussion/thread/room affordance in the mock maps to the **newer conversation layer**
(`community_groups` / `community_posts` / `community_group_members`), which is what the current
`/community` route already uses. Specifically:

- Mock "Discussions" / "thread cards" → `community_posts`, **not** `forum_threads` / `forum_replies`.
- Mock "rooms" → seeded `community_groups`, **not** `forum_sections`.
- Mock rail notifications/pickups → `notifications` (032) + `post_promotions` (041), **not**
  `notification_events` / `notification_deliveries` / `notification_subscriptions` (007).
- The mock has **no** vendors, case studies, endorsements, or taxonomy surfaces at all — the entire
  `vendors*` / `case_studies*` / `taxonomy_nodes` half of mig-007 is untouched by T11.

**Explicit guardrail for the T11 build:** if any build step reaches for `forum_sections`,
`forum_threads`, `forum_replies`, `notification_events`, `notification_deliveries`, or
`notification_subscriptions`, that is the Phase-7-erase conflict — **stop and use the 028–032/041 layer
instead.** The two layers are parallel by history; T11 lives entirely on the newer one.

---

## 5. What Template 11 can build NOW (on existing tables) — and what is honest-pending

### Build now — no DDL, existing tables/endpoints
- **Rooms grid** — after the 7-row canonical-group **data seed** (§3, writes-script track). Grid shell,
  "You're here" (home jurisdictions), room selection.
- **Room header + Join/Leave** — `community_group_members` + `/api/community/groups/[id]/join`.
- **Live in this region** — `intelligence_items` by region, routed to the right surface.
- **Discussions**: composer (`POST /api/community/posts`), thread cards, **Reply**
  (`/posts/[id]/replies`), **Delete** (`/posts/[id]`), reply count, empty state.
- **You · Owner** chip (`author` + `workspace_role`), **static Unverified** chip (by-design epistemic).
- **Cite source** — `referenced_intelligence_item_ids[]` exists (104); wire the affordance.
- **Rail**: "Who's here" (home-jurisdiction roster over `profiles`), Owner chip, network/invitation copy,
  **"Why post here → Admin pickups"** (fully built promotion pipeline), **Verifier status**
  (`profiles.verifier_status`), and the **"Vertical groups · none yet"** pending frame.

### Honest-pending frames until their migration/decision lands
- **Request verifier sign-off** (#19) — render the button in a pending/disabled honest state with a
  one-line "verifier sign-off lands when the sign-off request queue ships" note; live once
  `community_post_signoff_requests` (§3.1) is committed and applied.
- **Room item / discussion count numerals** (#2, #5) — render honest `—` with a one-line reason until
  the count queries/RPCs (§3.2) are wired (trivial; likely same PR).
- **Starter-question chips** (#12) — ship static now, or pending frame if data-driven chips are required.
- **Region-vocabulary** (#1) — resolve HK→APAC / MEAF display mapping at build time (no migration
  recommended).

### Decisions owed to Jason before build
1. **Room = seeded canonical `community_groups` per region** (recommended) vs a different rooms model?
2. **Region vocabulary** — presentation-layer map (recommended, no migration) vs CHECK alter to add
   `MEAF`/first-class `HK`?
3. **Verifier sign-off** — commit `community_post_signoff_requests` now (future DDL window) with the
   `community_posts.signed_off_at` companion column, so #19 is live-real rather than pending-framed?
4. **Starter questions** — static config (recommended) vs `community_room_starters` table?
5. **Counts** — inline `count` queries (recommended first) vs dedicated RPCs?

**Bottom line:** Template 11 is ~90% buildable now on the existing conversation layer with honest-pending
frames for the rest. The only true new-table dependency is the verifier sign-off request queue (§3.1,
§7). No mig-007 table is resurrected. Seed the 7 regional rooms (data), wire the two count reads, and
frame sign-off as pending until its one migration lands.
