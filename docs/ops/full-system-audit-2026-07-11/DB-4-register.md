# DB-4 Register — Tenancy & Community (full-system audit 2026-07-11)

Agent: DB-4. Branch `audit/full-system-2026-07-11`, baseline master `71bcbd46`. READ-ONLY throughout:
all DB access via MCP `execute_sql` (SELECT / information_schema / pg_catalog only), project
`kwrsbpiseruzbfwjpvsp`. No files modified; this register is the only new file.

Scope (manifest §B): 11 non-empty tables (profiles 2, user_profiles 1, organizations 1,
org_memberships 2, workspace_settings 1, workspace_item_overrides 4, community_groups 7,
community_group_members 1, community_posts 1, forum_sections 17, case_studies 6) + 24 empty tables
(briefings, bulk_imports, case_study_endorsements, community_group_invitations,
community_post_signoff_requests, community_topic_groups, community_topics, forum_replies,
forum_threads, moderation_reports, notification_deliveries, notification_events,
notification_preferences, notification_subscriptions, notifications, org_invitations,
org_member_bans, org_watchlist, post_promotions, user_watchlist, vendor_endorsements,
vendor_regulations, vendor_technologies, vendors). Plus ingestion_control_log **wiring** (content is
DB-3's).

Row counts re-measured at audit time and reconciled against manifest §B: **all 35 match exactly**
(11 non-empty at the stated counts; all 24 listed empties confirmed `count(*) = 0`).

---

## 1. Per-table protocol results

Method per table: (1) columns/types/defaults, (2) PK/FK/UNIQUE/CHECK constraints, (3) indexes,
(4) triggers, (5) RLS enable-state + every policy, (6) full row dump (<500 rows; bulk text as
length+left80; emails masked as a PII-class note), (7) repo-wide code-path scan (writers + readers,
code not comments). RLS is ENABLED (not forced) on **all 35 tables**; default Supabase grants give
`anon`/`authenticated` full CRUD at the SQL-grant level on every table checked, so **RLS policies are
the sole guard everywhere** — posture per table below.

### 1.1 profiles (2 rows)

- **Schema**: 37 cols — identity (email UNIQUE, display_name, full_name, headline, bio, avatar_url,
  organization, job_title), LinkedIn verification block (linkedin_url/sub UNIQUE/verified/
  identity_verified/workplace_verified/verification_checked_at, verification_tier default
  'unverified'), membership (role default 'viewer', membership_tier default 'free',
  contribution_score, affiliation_type), personalization (region[], topic_interests,
  sector_overrides[], jurisdiction_overrides[], transport_mode_overrides[], sector[], timezone,
  notification_preferences jsonb), governance (verifier_status CHECK none/pending/active/revoked,
  verifier_since, is_platform_admin default false), tenancy (org_id FK→organizations SET NULL,
  workspace_role CHECK owner/admin/editor/member/viewer or NULL).
- **Constraints**: PK id; UNIQUE email, linkedin_sub; 2 CHECKs (verifier_status, workspace_role); FK org_id.
- **Indexes**: idx_profiles_org_id (partial NOT NULL), idx_profiles_region GIN, idx_profiles_sector GIN.
- **Triggers**: `profiles_mirror_to_user_profiles` AFTER **UPDATE** (only) → `_mirror_profiles_to_user_profiles()` SECURITY DEFINER.
- **RLS**: **exactly ONE policy** — `"Public read"` FOR SELECT USING (true), created in mig 002 and
  never extended. No INSERT/UPDATE/DELETE policy has ever existed (verified by grepping every
  migration). See findings F1, F2.
- **Dump** (emails masked; PII class = email, display_name, LinkedIn ids):
  - Row 1 `2b7d21eb-…9c75` — jas***@hotmail.com, display_name "Jason", role **admin**,
    verification_tier staff_verified, affiliation_type independent, membership_tier premium,
    is_platform_admin **true**, org_id a0000000-…0001, workspace_role owner,
    sector_overrides = sector = [fine-art, live-events, luxury-goods, film-tv, automotive,
    humanitarian], jurisdiction_overrides = 30 jurisdictions, timezone UTC, created 2026-04-05,
    updated 2026-05-19. All LinkedIn fields false/null. settings {}.
  - Row 2 `a0764ff3-…6798` — jas***sh@gmail.com, display_name null, role **admin**,
    verification_tier unverified, membership_tier free, is_platform_admin false, org_id NULL,
    workspace_role NULL, all arrays empty, created = updated 2026-05-28.
- **Code paths**: readers everywhere (community pages/routes join author profiles; lib/auth/admin.ts;
  server-bootstrap). Writers: browser-client `.update()` in `src/components/profile/UserProfilePage.tsx:142`
  and `src/components/onboarding/OnboardingWizard.tsx:196` (see F1); service-role writers in
  `src/lib/auth/provision-personal-workspace.ts:79` and `src/app/api/auth/linkedin/callback/route.ts:226`.

### 1.2 user_profiles (1 row)

- **Schema**: 13 cols — user_id PK FK→auth.users CASCADE, name, headshot_url, bio, timezone,
  sectors[], jurisdictions[], transport_modes[], verifier_status CHECK, verifier_since,
  is_platform_admin, created_at, updated_at.
- **Indexes**: partial on is_platform_admin=true, verifier_status='active'.
- **Triggers**: `user_profiles_mirror_to_profiles` AFTER INSERT+UPDATE → SECURITY DEFINER upsert into
  profiles; `user_profiles_updated_at`.
- **RLS**: 4 policies — insert_self (WITH CHECK user_id=auth.uid() AND is_platform_admin=false),
  read_authenticated (any authenticated user reads ALL rows), update_self (self, is_platform_admin
  frozen via self-subquery), service_role ALL.
- **Dump**: 1 row for `2b7d21eb` — name null, sectors/jurisdictions mirror profiles row-1 exactly,
  is_platform_admin true, verifier_status none, created 2026-05-05, updated 2026-05-19.
- **Code paths**: **zero** `.from('user_profiles')` in code (only mig-075 comment). All former
  readers/writers carry "Migrated 2026-05-15 (075 Phase 2)" comments. DB-side consumers remain: RLS
  policies on `moderation_reports` (select + update_admin) and `post_promotions` (select) check
  `user_profiles.is_platform_admin`. See F3.

### 1.3 organizations (1 row)

- **Schema**: id, name, slug UNIQUE, plan CHECK free/pro/enterprise, settings jsonb, timestamps.
  Trigger updated_at. Index on slug (redundant with UNIQUE — minor).
- **RLS**: read = member-of-org (SECURITY DEFINER `user_belongs_to_org`) or service_role;
  update = owner/admin or service; insert = service only. No DELETE policy.
- **Dump**: `a0000000-0000-0000-0000-000000000001` "Dietl / Rockit", slug dietl-rockit, plan
  **enterprise**, settings {}, created 2026-04-05.
- **Code paths**: read by admin page/dashboard, orgs API; created by
  provision-personal-workspace (service role) and /api/orgs (service).

### 1.4 org_memberships (2 rows)

- **Schema**: id PK, org_id FK CASCADE, user_id FK→profiles CASCADE, role CHECK
  owner/admin/member/viewer, created_at, UNIQUE(org_id,user_id).
- **Indexes**: **duplicate pair** idx_memberships_user AND idx_org_memberships_user_id (both btree
  user_id) + idx_memberships_org. See F13.
- **RLS**: read = user_belongs_to_org or service; INSERT/UPDATE/DELETE = existing owner/admin of the
  same org or service. Bootstrap consequence: the FIRST membership of an org can only be written by
  service role — matches provision-personal-workspace design.
- **Dump**: both rows org a0000000-…0001: `2b7d21eb` role **owner** (2026-04-05); `a0764ff3` role
  **owner** (2026-05-28). See F12 (second, unverified free-tier account is a full owner).
- **Code paths**: heavily read (server-bootstrap, org.ts, orgs members route ~15 sites); written by
  provision-personal-workspace, orgs members/invitations routes.

### 1.5 workspace_settings (1 row)

- **Schema**: id PK, org_id FK CASCADE UNIQUE, sector_profile[], jurisdiction_weights jsonb,
  default_filters jsonb, alert_config jsonb (default priorities CRITICAL/HIGH), home_sections jsonb,
  default_export_format CHECK html/slack, notify_on_sector_activation bool,
  sectors_activation_signup_at, timestamps + trigger.
- **RLS**: read = org member or service; INSERT/UPDATE = org owner/admin or service. No DELETE policy.
- **Dump**: 1 row for the org — sector_profile = the 6 verticals, jurisdiction_weights = 30-key map
  (eu/imo/icao/global = 1 … pacific 0.3), alert_config default, home_sections all true,
  export html, notify_on_sector_activation false, created 2026-04-05.
- **Code paths**: read server-bootstrap, settingsStore, regulations-defaults route,
  BriefingScheduleSection; written by OnboardingWizard.persistSectors (browser client — works because
  the current user is owner; a plain `member` editing would silently no-op under settings_update_admin,
  same class as F1), settingsStore, provision-personal-workspace, linkedin callback.

### 1.6 workspace_item_overrides (4 rows)

- **Schema**: id PK, org_id FK CASCADE, item_id FK→intelligence_items CASCADE, UNIQUE(org_id,item_id),
  priority_override CHECK (NULL or CRITICAL/HIGH/MODERATE/LOW), is_archived, archive_reason (free
  text), archive_note, archived_at, notes NOT NULL default '', workspace_tags[], dismissed_at,
  timestamps + trigger.
- **RLS**: all four verbs = org member or service (uniform org-scoped).
- **Dump** (all org a0000000-…0001):
  1. `4f328c9b` item `51b2c91e` — archived TRUE, archive_reason "Expired", 2026-04-28.
  2. `cfd5c964` item `0ea6a710` — priority_override MODERATE, 2026-05-28.
  3. `965c1e43` item `03b5f234` — priority_override CRITICAL, 2026-05-28.
  4. `1b91a18f` item `efdb3390` — all-null override shell (no priority, not archived, not dismissed),
     created 2026-07-07, updated 2026-07-08 — an override row carrying no override (harmless residue
     of a toggled-then-cleared action; row could be GC'd).
- Note: workspace-level `archive_reason` is free text ("Expired") — a DIFFERENT vocabulary from the
  item-level 4-value archive_reason partition (DB-1/DB-3 scope). Not a defect; record the split so
  nobody "unifies" them blindly.
- **Code paths**: read/written via /api/workspace/overrides, supabase-server helpers (3 sites),
  dashboard surface-coverage/critical-items, market page.

### 1.7 community_groups (7 rows)

- **Schema**: id PK, name, slug UNIQUE, region CHECK (EU/UK/US/LATAM/APAC/HK/MEA/GLOBAL), privacy
  CHECK public/private, owner_user_id FK→auth.users SET NULL, description, member_count default 0,
  weekly_post_count default 0, last_active_at, created_at, vertical (nullable).
- **Indexes**: last_active DESC, owner, privacy, region, partial (vertical,last_active).
- **RLS**: select = public-privacy or member (SECURITY DEFINER helpers); insert = authenticated AND
  owner_user_id=self; update/delete = owner or group admin; service_role ALL.
- **Dump**: 7 regional "rooms", all owner `2b7d21eb`, all privacy public, vertical NULL, all created
  2026-07-07 by `scripts/seed-community-regional-rooms.mjs`: Global (room-global, member_count 1,
  last_active 2026-07-07T15:13), EU, US, UK, APAC, LATAM, MEAF (member_count 0). Descriptions
  recorded len+left80 (e.g. Global: 143 chars, "Cross-border corridors, reporting and emissions
  instruments (IMO, ICAO, WTO). Re…"). weekly_post_count = 0 on all (see F9 — no writer exists).
- **Code paths**: LIVE — community pages ([slug]/browse/moderation/page), /api/community/groups*,
  search, join. Region vocab here (HK, MEA) diverges from forum_sections tags (HONG_KONG, MEA) — F6.

### 1.8 community_group_members (1 row)

- **Schema**: PK (group_id,user_id), FKs CASCADE (group→community_groups, user→auth.users), role
  CHECK admin/moderator/member, joined_at, starred, muted.
- **RLS**: select/delete = self or group-admin or group-owner; insert = existing group admin only
  (WITH CHECK self-referential — first member/owner-join REQUIRES service role; the join route does
  exactly that after verifying privacy='public'); update = self, role frozen; service_role ALL.
- **Trigger**: member-count maintenance AFTER INSERT/DELETE → updates community_groups (NOT
  SECURITY DEFINER — see F10).
- **Dump**: 1 row — Global room, user `2b7d21eb`, role member, joined 2026-07-07T15:13, not
  starred/muted. Consistent with member_count=1 on that group.
- **Code paths**: LIVE — join/star/members/settings/invite routes, pages, CouncilMembersRail.

### 1.9 community_posts (1 row)

- **Schema**: id PK, group_id FK CASCADE, parent_post_id self-FK CASCADE, author FK SET NULL, title
  (CHECK: top-level has title, reply has none), body, created_at, last_reply_at, reply_count,
  promotion fields (promoted_from_post_id self-FK, promoted_at, promoted_to_item_id
  FK→intelligence_items SET NULL, attribution CHECK editorial/original-author/anonymous),
  referenced_intelligence_item_ids uuid[] GIN, signoff fields (signed_off_at, signed_off_by FK).
- **RLS**: select inherits group visibility; insert = author self AND group member; update/delete =
  author or group admin/moderator; service_role ALL.
- **Trigger**: reply-count + group last_active maintenance (invoker — F10).
- **Dump**: 1 row `813caa0c` — Global room, author `2b7d21eb`, title "TEST POST (audit) - please
  ignore, testing whether posting works", body len 64 (identical text), created 2026-07-07T15:13,
  reply_count 0, no promotion/signoff. Operator test artifact — deletable.
- **Code paths**: LIVE — posts/replies/promote/signoff routes, community pages, map page,
  CommunityPickupsQueueView (admin).

### 1.10 forum_sections (17 rows)

- **Schema**: id PK, name, slug UNIQUE, description, section_type CHECK
  regional/topical/global/special, primary_region_tag, primary_topic_tag, features_enabled[]
  (default posts/questions/intelligence_feed), is_public default true, minimum_membership_tier
  default 'free', sort_order, thread_count default 0, created_at.
- **RLS**: sections_read SELECT true (public incl. anon); sections_write INSERT service only. **No
  UPDATE policy** (thread_count trigger from forum_threads would silently no-op on the RLS path —
  moot, layer is dead).
- **Dump**: all 17 created 2026-04-05 by `supabase/seed/seed-community.sql` (INSERTs at lines 8, 21).
  8 regional (sort 1–8: EU/Europe, United States, United Kingdom, Latin America, Asia Pacific,
  Hong Kong [primary_region_tag **HONG_KONG**], Middle East & Africa, Global) + 9 topical (sort
  10–18, **sort_order 9 unused**: packaging-crating, saf-air-freight, ev-alternative-fuels,
  carbon-reporting, warehouse-facilities, regulatory-watch [+announcements feature],
  vendor-reviews [posts/questions only], research-partnerships, live-events). thread_count = 0 on
  all 17; is_public true; tier 'free'.
- **Code paths**: **ZERO** — no reader or writer anywhere in src/ or scripts/ (seed SQL only).
  Seeded-never-used. See F6.

### 1.11 case_studies (6 rows)

- **Schema**: 24 cols — title, submitter_id FK→profiles, organization, industry_segment, challenge,
  solution, measurable_outcome, timeline, cost_reference, source_attribution, source_tier int,
  5 tag arrays, linked_regulation_ids uuid[], linked_vendor_ids uuid[], linked_technology_tags[],
  linked_thread_id FK→**forum_threads** (couples this dead family to the other dead family),
  peer_validation_count default 0, validation_status CHECK
  submitted/under_review/peer_validated/featured, timestamps + trigger.
- **RLS**: read = true (public incl. anon); insert = authenticated with verification_tier <>
  'unverified'; update = submitter or service. No DELETE policy.
- **Dump** (all created 2026-04-05 by seed-community.sql:87; all submitter_id NULL,
  peer_validation_count 0, no linked ids):
  1. `060c1e40` "Hauser & Wirth Travel Frame Redesign" — Mtec/Queen's/Constantine, tier 2, EMEA/UK,
     fine_art, cost "£146-290 per frame…", status **peer_validated**. challenge 106ch/solution
     182ch/outcome 85ch (left80s recorded in audit transcript).
  2. `73020fae` "White Cube Cardboard Honeycomb Crating Test" — tier 3, status submitted.
  3. `baa93bb8` "Coldplay Music of the Spheres Sustainability Roadmap" — tier 2, live_events,
     status **peer_validated** (outcome cites "claimed 59% reduction… independently ve…").
  4. `48c058bf` "Massive Attack ACT 1.5 Low-Carbon Concert" — Tyndall Centre, tier 2, status
     **peer_validated**.
  5. `8add9f6b` "Christie's DNA Fine Art EV Sprinter Courier" — tier 4, source_attribution
     "Industry knowledge", status submitted.
  6. `b9a25339` "MIT ClimateMachine Phase 1: Air Freight Modal Shift" — tier 1, status
     **peer_validated**.
- **Code paths**: **ZERO** readers/writers in src/ or scripts/. See F7.

### 1.12 The 24 empty tables — schema + RLS + wiring (grouped)

**Org/tenancy group (wired, awaiting data):**
- `org_invitations` (0) — token default gen_random_bytes UNIQUE, email lower CHECK, status 5-value
  CHECK, expires 14d, partial-unique pending per (org,email). RLS: admin insert/read/update
  (insert forces invited_by=self, role whitelist), service ALL. LIVE code: /api/orgs/[org_id]/
  invitations*, /api/invitations/mine. Wired-empty — healthy.
- `org_member_bans` (0) — PK(org,user). RLS: **SELECT owner/admin only; no INSERT/UPDATE/DELETE
  policies** → writes are service-role-only by construction. LIVE code: orgs members route
  (:401, :624). Wired-empty.
- `user_watchlist` (0) — UNIQUE(user,item_type,item_id), item_type CHECK source/reg/signal. RLS
  self-only 3 verbs. LIVE code: /api/watchlist + supabase-server.ts:2466. Wired-empty.
- `org_watchlist` (0) — org-scoped twin with UNIQUE(org,type,id), 4 org-member policies. **ZERO code
  paths** — schema-only duplicate of user_watchlist's role. Dead weight (F8).
- `briefings` (0) — integer serial PK (only table in slice not uuid), week_date, content jsonb,
  org_id FK CASCADE nullable. RLS: read = org_id IS NULL OR member OR service (an org-NULL row would
  be **anon-readable**); insert service only. **ZERO code paths** (BriefingScheduleSection writes
  workspace_settings, not briefings). Dead schema (F8).
- `bulk_imports` (0) — see F4b (grandfathered orphan; write-only).

**Community conversation layer (wired, awaiting data):**
- `community_group_invitations` (0) — status CHECK, partial-unique pending per (group,invitee). RLS:
  insert = group admin as self; select = invitee/inviter/admin-mod/owner; update split
  admin→revoked / invitee→accepted-declined; service ALL. LIVE code: invite/invitations/
  invite-candidates/accept/decline/revoke/join routes + 3 pages. Wired-empty.
- `community_topics` + `community_topic_groups` (0) — owner-scoped 5/4 policies + service. LIVE
  code: read in [slug]/browse/moderation pages (embedded select). No writer route found in src —
  topics UI creates via…? No `.insert` on community_topics found: **read-only wiring; writer absent**
  (schema+read half-slice; minor — F8 note).
- `community_post_signoff_requests` (0) — status CHECK, partial-unique pending per post. RLS:
  insert = requester+group member; select = requester or active-verifier/platform-admin (checks
  **profiles**); decide = verifier/admin; withdraw = own pending. LIVE code: signoff routes +
  community page. Wired-empty.
- `post_promotions` (0) — promotion_kind CHECK staged/direct, unique per post, FKs to staged_updates
  + intelligence_items. RLS: select = promoter/group-mod/platform-admin (checks **user_profiles** —
  F3), service ALL; **no user INSERT policy** → service-role writes only (promote route does this).
  LIVE code: promote route. Wired-empty.
- `moderation_reports` (0) — target_kind CHECK post/group/user, status CHECK. RLS: insert =
  authenticated self open-status; select/update = reporter/group-mods/platform-admin (platform-admin
  arm checks **user_profiles** — F3). LIVE code: moderation reports routes. Wired-empty.

**Notifications — TWO generations:**
- NEW trio, LIVE: `notifications` (0) — kind CHECK mention/reply/promote/invite/moderation, RLS
  self-select, self-update (kind/payload/created_at frozen via self-subquery), service ALL. Written
  by `lib/notifications/dispatch.ts` (service role) from replies/invite/moderation routes; read by
  /api/community/notifications* + surface-coverage. `notification_preferences` (0) — PK user_id,
  6 booleans, channels[], RLS self 4 verbs + service. Written by OnboardingWizard seed +
  NotificationPreferences component + preferences route. Wired-empty, healthy.
- OLD trio, DEAD (mig-007 era): `notification_events` (0) — event_type CHECK includes
  vendor_endorsed/case_study_validated (dead-family vocab); RLS read = **true (anon-readable)**,
  insert service. `notification_deliveries` (0) — see F4a. `notification_subscriptions` (0) —
  subscription_type CHECK includes 'vendor'; RLS self; **zero writers anywhere** (only reader is the
  trigger route). The sole producer/consumer, `/api/notifications/trigger`, has **zero callers** in
  the repo. Entire trio is end-to-end dormant (F5).

**Forum layer (dead):** `forum_threads` (0) — 21 cols, thread_type CHECK, 7 indexes, linked_vendor_ids
/ linked_case_study_ids arrays; RLS read gated on forum_sections.is_public OR
profiles.membership_tier IN ('member','contributor','verified','premium') — a vocabulary that does
not match live membership_tier data ('free'/'premium' only) (F6); insert = verified profiles; update
= author/service; no DELETE. `forum_replies` (0) — thread FK CASCADE, accepted-answer bool, reply
count trigger; same insert/read/update shape. **Zero code paths** for both (F6).

**Case-study satellite:** `case_study_endorsements` (0) — PK(case_study,endorser), type CHECK,
count+auto-promote trigger (submitted→peer_validated only from 'under_review' at count≥2). RLS: read
true, insert = linkedin_verified/staff_verified profiles. Zero code paths (F7).

**Vendor family (0 rows × 4):** `vendors` (22 cols, slug UNIQUE, verification_status CHECK
unverified/peer_validated/staff_reviewed, listing_tier CHECK basic/featured/premium, 7 indexes,
updated_at trigger), `vendor_endorsements` (UNIQUE(vendor,endorser), count trigger),
`vendor_regulations` (PK(vendor,regulation), compliance_type CHECK, FK→intelligence_items),
`vendor_technologies` (PK(vendor,taxonomy_node), FK→taxonomy_nodes). RLS: reads all
`true` (public); writes service-only except vendor_endorsements insert = verified profiles. See F11.

---

## 2. Special deliverables

### (a) The three grandfathered orphans — writers AND readers, verdicts

Cross-checked against `.discipline/governance/producer-consumer-orphan.mjs` TERMINAL_SINK_ALLOWLIST
(entries dated FIRST RUN 2026-07-03; dispositions pending "Phase 7"). My independent grep agrees with
the allowlist and sharpens one of them:

1. **notification_deliveries — verdict: TRULY DEAD (stronger than "write-only").**
   Writer: `src/app/api/notifications/trigger/route.ts:82` (service role). Readers in code: none.
   But the writer itself is dead code: `/api/notifications/trigger` has **zero callers** anywhere in
   the repo (no fetch, no webhook config in code, no worker invocation), and its subscriber source
   `notification_subscriptions` has **zero writers**, so even if the route were called,
   subscribers=[] and no delivery row could ever be produced for the three event branches. The RLS
   read policy (self) has no UI behind it. This is not a sink awaiting a reader; it is an unreachable
   write site. Next action: drop the trio (events/deliveries/subscriptions) + the trigger route
   together, or explicitly ratify as future infrastructure — but re-classify from "write-only" to
   "unreachable" in the allowlist reasoning.

2. **bulk_imports — verdict: WRITE-ONLY (legit audit sink shape, reader unbuilt).**
   Writer: `src/app/api/admin/sources/bulk-import/route.ts:629` insert (every action incl. dryRun,
   per its own comment; service role) — plus the copy in `scripts/tmp/_bulk-bundle.mjs:1462`.
   Readers: none (no admin import-history surface; RLS gives SELECT to any authenticated user —
   note `raw_input` full import payloads are thus readable org-wide by any logged-in user, minor
   exposure F14). Next action: ratify as write-only job audit OR build the /admin import-history
   reader; either way decide at Phase 7 as the allowlist already says.

3. **ingestion_control_log (wiring only; content is DB-3's) — verdict: WRITE-ONLY app-side, script-only readers.**
   Writer: `scripts/wave1-cold-start.mjs:563` insert. Readers: zero in src/; diagnostic scripts only —
   `scripts/audit-leadtime-part2.mjs:45` (reads for lead-time audit),
   `scripts/tmp/phase-5-implementation-preflight.mjs:79-82` (reads latest pause state),
   `scripts/tmp/audit-section-A.mjs` (audit dump). 709 rows of ops history with no operational
   consumer in the product. Next action: ratify as script-side ops log (cheap) or wire an /admin ops
   reader; do NOT delete — it is the only record of control-run history.

### (b) profiles ↔ user_profiles mirror pair

- **Mirror is LIVE both directions**, both functions SECURITY DEFINER with pinned search_path:
  `profiles_mirror_to_user_profiles` AFTER **UPDATE only** on profiles (skip-if-no-overlap-change
  guard, COALESCE-merge upsert); `user_profiles_mirror_to_profiles` AFTER INSERT+UPDATE on
  user_profiles (upsert into profiles).
- **Asymmetry defect (F3a)**: profiles-side trigger fires on UPDATE only, so a profile INSERTED
  after mig 075 never seeds a user_profiles row until its first update — proven in data:
  profiles has 2 rows, user_profiles has 1 (user `a0764ff3`, created 2026-05-28, has no mirror row).
- **Row agreement**: for the mirrored user (`2b7d21eb`) every overlap column agrees exactly
  (name/full_name null≡null, bio, timezone UTC, sectors≡sector_overrides 6 values,
  jurisdictions≡jurisdiction_overrides 30 values, transport_modes [] , verifier_status none,
  verifier_since null, is_platform_admin true, updated_at both 2026-05-19T01:29:05.766278Z —
  the identical timestamp shows the last write flowed through the mirror). No divergence.
- **Is user_profiles consumed anywhere in code?** NO — zero `.from('user_profiles')` in src/ or
  scripts/ (mig-075 Phase 2 comments confirm the 2026-05-15 migration of ~10 call sites). BUT two
  DB-side consumers remain: RLS policies `moderation_reports_select` / `moderation_reports_update_admin`
  and `post_promotions_select` check `user_profiles.is_platform_admin`. **075 Phase 3 (drop
  user_profiles) is therefore NOT yet safe** — those three policy arms must be repointed to
  profiles.is_platform_admin first. Next action: repoint 3 policies → then Phase 3 drop (also
  removes the INSERT-mirror gap by construction).

### (c) Vendor table family (removed from scope 2026-05-24)

- **Zero code writers**: no `.from('vendor*')` insert/update anywhere; DB write policies are
  service-only (vendors/vendor_regulations/vendor_technologies) so nothing can accrete accidentally
  from the client either. Confirmed 0 rows in all 4.
- **Remaining code affordances (residue inventory for the drop-table backlog):**
  - `src/types/community.ts` — `linked_vendor_ids` field (:114), `"vendor_endorsed"` in notification
    event union (:130), `"vendor"` in subscription_type union (:138).
  - `src/app/privacy/page.tsx` — copy mentions vendors (text only).
  - `src/lib/sources/vertical-fit.ts`, `classify-source-role.ts` — the word "vendor" in classifier
    vocab (about SOURCES, not the vendor directory; keep).
  - No /vendors page, route, or component exists.
- **Remaining DB residue**: 4 tables, 2 trigger functions (update_vendor_endorsement_count +
  vendors_updated_at), 13 indexes, FK columns pointing IN from dead families only
  (case_studies.linked_vendor_ids array — not a real FK; forum_threads.linked_vendor_ids array),
  CHECK-vocab entries 'vendor_endorsed' (notification_events) and 'vendor' (notification_subscriptions),
  and forum_sections row 'vendor-reviews'. Public-read RLS on all 4 (empty, so no exposure).
- **Verdict**: confirmed drop-table backlog candidate — 4 tables + 2 functions + type-union residue,
  nothing consumes them. Bundle with the forum-layer decision (F6) since forum_threads carries
  linked_vendor_ids.

### (d) Community model completeness — live UI paths vs schema-only

| Family | Tables | State |
|---|---|---|
| Conversation layer (mig 028+) | community_groups, community_group_members, community_posts | **LIVE** — pages (/community, /browse, /[slug], /moderation), full API surface, seed script, real rows |
| Invitations | community_group_invitations | LIVE wiring, 0 rows (no invites sent yet) |
| Topics | community_topics, community_topic_groups | **Read-wired only** — pages embed-select them; no insert route found → writer half missing |
| Sign-off | community_post_signoff_requests | LIVE wiring, 0 rows |
| Promotions | post_promotions | LIVE wiring (promote route), 0 rows |
| Moderation | moderation_reports | LIVE wiring, 0 rows |
| Notifications v2 | notifications, notification_preferences | LIVE wiring, 0 rows |
| Notifications v1 | notification_events, notification_deliveries, notification_subscriptions | **DEAD end-to-end** (unreachable route, no subscription writer) |
| Forum layer (mig 007) | forum_sections (17 seeded), forum_threads, forum_replies | **SCHEMA-ONLY / seeded-never-used** — zero code paths; superseded by the conversation layer |
| Case studies | case_studies (6 seeded), case_study_endorsements | **SCHEMA-ONLY / seeded-never-used** — zero code paths |
| Watchlists | user_watchlist | LIVE wiring, 0 rows |
| | org_watchlist | schema-only, zero code paths |
| Briefings | briefings | schema-only, zero code paths |
| Vendors | 4 tables | schema-only, operator-removed scope |

Answer to the manifest question: **forum_sections is seeded-never-used** — 17 rows written by
`supabase/seed/seed-community.sql` on 2026-04-05, thread_count 0 across the board,
forum_threads/forum_replies never received a row, and no code has ever read the table. The live
community product was built on the newer community_groups layer instead.

### (e) RLS posture vs credential per code path

Credential inventory (all 35 tables have RLS enabled; grants are Supabase defaults, so policy is the
only guard):

| Code path | Credential | RLS in effect? | Notes |
|---|---|---|---|
| Server pages (community/*, profile pages) | `createSupabaseServerClient` cookie session (authenticated) | YES | reads scoped by member/public policies |
| Community API routes | `requireCommunityAuth` → user-JWT client for reads | YES | deliberate service-role escalations: group self-join insert (route comment: "Phase C does NOT yet have a public-self-join RLS policy"), promote, signoff decide |
| notifications writes | `lib/notifications/dispatch.ts` service role | bypass | correct (notifications insert is service-only by policy) |
| Org/tenancy APIs (orgs, members, invitations, watchlist) | user-JWT client + service for bootstrap | YES/bypass | first org membership requires service (policy self-reference) — provision-personal-workspace does this |
| Admin surfaces & pipeline | `getServiceSupabase()` / direct service clients | bypass | fails fast if key missing (SF-1) |
| Client components (UserProfilePage, OnboardingWizard, NotificationPreferences, settingsStore, BriefingScheduleSection) | browser anon-key + user JWT | YES | **this is where F1 bites**: profiles has no write policy at all; workspace_settings writes require owner/admin (silent no-op for plain members — latent same-class) |
| /api/notifications/trigger | worker-secret + service role | bypass | zero callers (dead) |

Per-table posture anomalies (beyond findings below): `profiles` SELECT-true to anon (F2);
`notification_events` SELECT-true to anon; `briefings` org-NULL rows anon-readable; `case_studies`,
`forum_sections`, `forum_replies` (read), `vendors` family reads all public — mostly empty/dead so
exposure is currently 2 emails + seeded content, but the PATTERN predates the tenancy model.

---

## 3. Findings register

| # | Finding | Evidence | Severity | Candidate next action |
|---|---|---|---|---|
| F1 | **Profile self-edit silently no-ops.** `profiles` has exactly one RLS policy (SELECT true, mig 002); no INSERT/UPDATE policy has ever existed. Mig 075 Phase 2 (2026-05-15) migrated the client-side writers from user_profiles (which HAS a self-update policy) to profiles. Browser-client `.update()` under RLS-no-policy matches 0 rows and returns **no error**, so `UserProfilePage.persist()` (UserProfilePage.tsx:142) and `OnboardingWizard.persistIdentity()` (OnboardingWizard.tsx:196) report success while writing nothing. The one historical profile edit that stuck (2026-05-19) flowed through the user_profiles mirror, which still works — masking the break. | policies dump §1.1; mig 002/075 grep; code reads §1.1 | **breaks-customer** | Add a column-constrained self-update policy on profiles (exclude role, is_platform_admin, verification_tier, membership_tier, org_id, workspace_role) or route profile edits through a service-role API; add a regression probe that asserts rows-affected>0. Same-class latent: workspace_settings writes by non-admin members. |
| F2 | **profiles is anon-readable including emails.** `"Public read" SELECT USING(true)` + default anon grant exposes email, display_name, linkedin_sub/url, membership_tier, is_platform_admin, org_id for all users to the anon key. 2 real emails present today. | §1.1, grants query | **breaks-doctrine** (PII/security) | Replace with authenticated-scoped read + a public view of non-PII columns (or column-level select). Coordinate with mig-157-era anon-exposure work (this table was not covered by it). |
| F3 | **user_profiles drop (075 Phase 3) is blocked by 3 RLS policy arms**, not by code: moderation_reports_select, moderation_reports_update_admin, post_promotions_select all check `user_profiles.is_platform_admin`. Code consumers = zero (Phase 2 complete). | §1.2, §1.12 policies | dead-weight (blocker documented) | Repoint 3 policy arms to profiles.is_platform_admin, then execute Phase 3 drop (removes mirror + F3a). |
| F3a | **Mirror asymmetry**: profiles→user_profiles trigger is AFTER UPDATE only; post-075 INSERTs never mirror (proven: 2 profiles vs 1 user_profiles row). Rows that ARE mirrored agree exactly. | §2(b) | cosmetic (self-healing on first update; moot after Phase 3) | Subsumed by F3. |
| F4a | notification_deliveries orphan — **unreachable, not merely write-only**: its only writer route has zero callers and its subscriber source has zero writers. | §2(a)1 | dead-weight | Drop trio + route, or ratify; update allowlist reasoning either way. |
| F4b | bulk_imports orphan — write-only audit sink; no history reader. | §2(a)2 | dead-weight | Phase 7 call per allowlist: ratify or build /admin import history. |
| F4c | ingestion_control_log — app-side write-only; readers are diagnostic scripts only. | §2(a)3 | dead-weight | Ratify as ops log (recommended); keep data. |
| F5 | **Notifications v1 trio dead end-to-end** (events/deliveries/subscriptions + /api/notifications/trigger): no route caller, no subscription writer; superseded by live notifications + notification_preferences. notification_events additionally anon-readable (qual=true). | §1.12 | dead-weight | Drop with F4a as one unit; remove worker-auth route. |
| F6 | **Forum layer seeded-never-used**: forum_sections 17 rows (seed 2026-04-05), threads/replies 0, zero code paths. Vocab fractures embedded: primary_region_tag 'HONG_KONG' vs community_groups CHECK 'HK'; threads_read policy expects membership_tier in ('member','contributor','verified','premium') vs live values ('free','premium'); sort_order 9 gap. forum_sections has no UPDATE policy for its own thread_count trigger. | §1.10, §1.12 | dead-weight | Decide: drop forum trio (+ seed) or schedule the build. If dropped, case_studies.linked_thread_id FK must go first. |
| F7 | **case_studies seeded content carries unearned trust labels**: 4/6 rows validation_status='peer_validated' with peer_validation_count=0 and zero endorsement rows — status was hand-set in seed-community.sql, not earned via the endorsement trigger (which only promotes from 'under_review' at count≥2). Table has zero code paths today, so nothing surfaces it — but it is anon-readable, and if a Community build ever reads it, fabricated peer-validation ships to customers. Direct surface-honesty/integrity-rule class. | §1.11 | **breaks-doctrine** (latent) | Reset the 4 rows to 'submitted' via migration, or archive the seed set; decide keep-vs-drop of the whole family alongside F6. |
| F8 | Schema-only tables with zero code paths: briefings, org_watchlist (user_watchlist is the live twin), + community_topics/topic_groups have read-wiring but **no writer** (half-slice). | §1.12 | dead-weight | briefings/org_watchlist → drop-or-build decision; topics → either build the create-topic route or drop the embed-selects. |
| F9 | **weekly_post_count is read-never-written**: displayed as "posts this week" (GroupCard.tsx:181, GroupHeader.tsx:193), selected by groups API, but no writer exists anywhere (only mig 028 default 0). Truthful now (no posts); becomes a false metric the moment posting activity starts. | §1.7 grep | breaks-doctrine (imminent) | Compute from community_posts (7-day count) at read time, add a maintenance job, or remove from UI. |
| F10 | **Count-maintenance triggers run as INVOKER** (not SECURITY DEFINER): member_count/reply_count/last_active/thread_count/validation_count/endorsement_count trigger functions UPDATE their parent tables under the caller's RLS. On any RLS-path write (policies exist inviting exactly that: posts insert by plain members), the parent UPDATE silently matches 0 rows → counter drift with no error. Currently masked because mutations route through service role (e.g. join route), but community_posts_insert_member exists for user-JWT inserts. | §1.8/§1.9 + function defs | breaks-customer (latent class) | Make the 4 live-layer trigger functions SECURITY DEFINER (search_path already pinned), or add narrow UPDATE policies for the counter columns; add a drift probe (member_count vs count(*)). |
| F11 | Vendor family: 0 rows, 0 writers, 0 readers; residue = 4 tables, 2 trigger fns, type-union entries, CHECK vocab, forum_sections 'vendor-reviews' row. | §2(c) | dead-weight | Drop-table backlog item, bundled with F6 (forum_threads.linked_vendor_ids). |
| F12 | Tenancy data observations: BOTH profiles have role='admin' (default is 'viewer'); second account (gmail, verification_tier unverified, free tier, org_id NULL, no user_profiles row) is nonetheless a full **owner** in org_memberships. Legacy `profiles.role` column coexists with workspace_role + org_memberships.role + is_platform_admin — four overlapping authority columns. | §1.1, §1.4 | cosmetic (confirm intent) | Operator confirm second-owner intent; longer term collapse role columns (profiles.role looks legacy). |
| F13 | Duplicate index on org_memberships (idx_memberships_user ≡ idx_org_memberships_user_id); organizations.idx_organizations_slug redundant with UNIQUE slug. | §1.4/§1.3 | cosmetic | Drop one of each pair in a housekeeping migration. |
| F14 | bulk_imports.raw_input (full import payloads) SELECT-able by ANY authenticated user (not org/admin-scoped). Empty today. | §2(a)2 | cosmetic (empty) | Scope the read policy to platform admin when/if the reader is built. |
| F15 | PII presence class (for the roll-up): emails ×2 + display names in profiles (anon-readable, F2); org name; no other personal data in slice. Masked in this register per dispatch. | §1.1 | n/a (finding class) | — |

---

## 4. Manifest check-off

**Manifest check-off: 35/35 tables scanned** (11 non-empty fully dumped + 24 empty confirmed 0 rows;
row counts reconciled against manifest §B — all exact matches). Plus ingestion_control_log wiring
(DB-3 owns content).

**Tool-call count: 46** (18 MCP execute_sql read-only queries; 27 local Read/Grep/ToolSearch; 1 Write
— this register).

## 5. Deviation log

1. Multi-statement SQL through the MCP tool returns only the LAST result set — detected on the
   user_profiles/organizations/org_memberships/workspace_settings batch; re-ran as jsonb-aggregated
   single statements. No data loss.
2. Emails in the profiles dump are masked (`jas***@…`) — PII noted as a finding class (F15) per
   dispatch instruction; everything else reproduced unredacted (bulk text as length+left80 per
   manifest dump rule).
3. `pg_class.reltuples` estimates were -1/stale for most small tables — exact `count(*)` used
   instead for reconciliation.
4. case_studies challenge/solution/measurable_outcome and community text columns recorded as
   length+left80 (manifest deviation-5 dump rule applied to descriptive prose columns).
5. No deviations from READ-ONLY: zero writes, zero DDL, zero fetches, no scripts executed.
