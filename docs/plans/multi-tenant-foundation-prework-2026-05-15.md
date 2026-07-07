# Multi-Tenant Foundation — Pre-Work Findings

Date: 2026-05-15
Repo: `C:/Users/jason/dotfiles` (the dotfiles repo IS the fsi-app monorepo)
Live DB: `kwrsbpiseruzbfwjpvsp` (Supabase)
Last applied migration: 074 (`ecovadis_vendor_reclass`)

This document captures everything checked before any code changes for the Multi-Tenant Foundation dispatch. Three workstreams follow it (A: schema cleanup, B: invitations, C: RPC membership checks). Findings deviate from the dispatch brief in several places; deviations are flagged and resolved with explicit decisions.

---

## A. `profiles` table shape — confirmed

`public.profiles` exists with **27 columns**. Population: 1 row (Jason). Sample row shows the canonical-person semantics already match what the brief assumes: a long-lived person identity that holds auth-related affiliation, LinkedIn verification, contribution score, membership tier.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK (default `gen_random_uuid()`) | **Conventionally** equals `auth.users.id`; verified for the lone row. **No DB-level FK** to `auth.users` — enforced by code. (`user_profiles.user_id` DOES have an `ON DELETE CASCADE` FK to `auth.users(id)` — verified via pg_constraint; information_schema's cross-schema FK enumeration missed it.) |
| `email` | text NULL | |
| `display_name`, `full_name` | text NULL | Two name fields exist; `display_name` is the legacy `001_schema.sql` field; `full_name` was added by `027`/`028`. |
| `role` | text NOT NULL DEFAULT 'viewer' | Confusingly NOT the org role — this is a **legacy global role** from 001_schema.sql; sample row is `'admin'`. The org role lives on `org_memberships.role`. |
| `settings` | jsonb NOT NULL DEFAULT '{}' | |
| `created_at`, `updated_at` | timestamptz NOT NULL | |
| `headline`, `bio`, `avatar_url`, `organization`, `job_title` | text | Community profile fields (added 027). `avatar_url` overlaps with `user_profiles.headshot_url`. |
| `linkedin_url`, `linkedin_sub`, `linkedin_verified`, `linkedin_identity_verified`, `linkedin_workplace_verified`, `linkedin_verification_checked_at` | text/bool/timestamptz | LinkedIn verification stack (added 027). |
| `verification_tier` | text DEFAULT 'unverified' | Sample: `'staff_verified'`. |
| `affiliation_type` | text NULL | Sample: `'independent'`. |
| `region` | text NULL | |
| `topic_interests` | text[] NULL | |
| `membership_tier` | text DEFAULT 'free' | Sample: `'premium'`. |
| `contribution_score` | int NULL DEFAULT 0 | |
| `notification_preferences` | jsonb DEFAULT '{}' | |
| `last_active_at` | timestamptz NULL | |

**Verdict:** `profiles` is the correct canonical-person table. It's the right destination for the user_profiles columns the brief moves: `name`, `headshot_url`, `bio`, `timezone`, `verifier_status`, `verifier_since`, `is_platform_admin`. Most have a pre-existing same-purpose column in profiles already (e.g. `full_name` ↔ `name`, `avatar_url` ↔ `headshot_url`). **The merge is mostly de-duplication, not new columns.**

`public.user_profiles` (13 columns, 1 row) is the parallel table that 027_user_profiles.sql introduced as a "product profile" overlay. Its `user_id` is PK, conventionally equals `auth.users.id` (and equals `profiles.id` for the lone row). **No DB-level FK** to either auth.users or profiles. Five columns are unique to user_profiles and need new homes:
- `name` text → maps to `profiles.full_name` (already exists)
- `headshot_url` text → maps to `profiles.avatar_url` (already exists)
- `bio` text → maps to `profiles.bio` (already exists)
- `timezone` text NOT NULL DEFAULT 'UTC' → **NEW column on profiles** (not present)
- `sectors` text[] NOT NULL DEFAULT '{}' → moves to `workspace_settings` (org-scoped) per S12. **But:** `workspace_settings.sector_profile` already exists as `text[]` and currently IS the canonical store. The user-level `user_profiles.sectors` is the *override layer*. Per Section 6.8, both should exist: workspace default + per-user override. **Decision: keep both layers but rename for clarity. workspace_settings.sector_profile remains the workspace-level default; the per-user override moves from user_profiles.sectors to a new `profiles.sector_overrides text[]` column.** This preserves the audit's explicit two-layer ranking design (Section 6.8).
- `jurisdictions` text[] NOT NULL → moves to `profiles.jurisdiction_overrides text[]` (per-user override). The workspace-level layer is `workspace_settings.jurisdiction_weights jsonb`.
- `transport_modes` text[] NOT NULL → moves to `profiles.transport_mode_overrides text[]`. No org-level mode preference store currently exists; future work may add it but out of scope for this dispatch.
- `verifier_status` text NOT NULL DEFAULT 'none' → moves to `profiles.verifier_status` (NEW column).
- `verifier_since` timestamptz NULL → moves to `profiles.verifier_since` (NEW column).
- `is_platform_admin` bool NOT NULL DEFAULT false → moves to `profiles.is_platform_admin` (NEW column).

---

## B. `user_profiles` readers + writers map (migration-readiness)

There are **19 src/api files + the bootstrap module** that touch user_profiles. Listed by category:

### Readers (read user_profiles directly)

1. `src/lib/api/server-bootstrap.ts:59` — server-side resolver: `from('user_profiles').select('sectors').eq('user_id', user.id)`. **Hot path: every server-rendered request.** Used to seed `workspaceStore.sectorProfile`.
2. `src/components/auth/AuthProvider.tsx:37` (comment-only ref; no .from() call — the prior pattern was migrated to server-bootstrap)
3. `src/app/admin/page.tsx:77` and `src/components/admin/AdminDashboard.tsx:141` — embed `user:user_profiles(name, headshot_url)` via the org_memberships `user_id` FK (PostgREST resolves the join because user_profiles.user_id matches org_memberships.user_id by convention).
4. `src/components/profile/UserProfilePage.tsx:119` — `from('user_profiles').select('*').eq('user_id', userId)`.
5. `src/app/profile/page.tsx` — references user_profiles in comment + uses UserProfilePage.
6. `src/components/profile/AtAGlanceBlock.tsx` — comment-only ref (created_at + verifier_status sourced via UserProfilePage).
7. `src/app/community/page.tsx:124` — `.from('user_profiles')` for council members.
8. `src/app/community/browse/page.tsx:201` — `.from('user_profiles')` for member list.
9. `src/app/community/[slug]/page.tsx:162` — community post detail user lookup.
10. `src/app/community/moderation/page.tsx:146` — moderator list.
11. `src/components/community/CouncilMembersRail.tsx:73` — `.from('user_profiles')` (intentionally documented as a substitute join target since the FK lives elsewhere; see source comment).
12. `src/components/community/VerifierBadge.tsx` — comment-only.
13. `src/components/community/types.ts` — comment-only.
14. `src/app/api/community/posts/route.ts:154,257` — embed user data on community feed posts.
15. `src/app/api/community/posts/[id]/route.ts:111,231` — same on detail / replies.
16. `src/app/api/community/posts/[id]/replies/route.ts:142,248` — same.
17. `src/app/api/community/posts/[id]/promote/route.ts:264` — admin gate (`is_platform_admin`).

### Writers (write user_profiles directly)

1. `src/components/profile/UserProfilePage.tsx:156` — `from('user_profiles').upsert(...)` — main profile editor.
2. `src/components/onboarding/OnboardingWizard.tsx:106,132` — onboarding flow upsert. **Bug found in this read:** the upsert at line 106 writes `pronouns`, `role`, `employer`, `region`, `work_email` columns that **do not exist** on user_profiles. Either error is silently swallowed at runtime or these have never been exercised post-027. Out of scope for this dispatch but flagged.

### Outbound FKs from user_profiles
**None.** The introspection returned an empty FK set. Confirmed.

### Inbound FKs to user_profiles
**None.** Crucially, no community FK targets user_profiles — every community FK targets `profiles.id` (see Section C). The PostgREST `user:user_profiles(...)` pattern in admin/community code uses **column-name resolution by convention**, not declared FKs. This means dropping user_profiles needs a migration that introduces a renamed equivalent column on profiles AND updates the .from('user_profiles') call sites; PostgREST embedding to switch to `user:profiles(full_name, avatar_url)` style.

---

## C. Community / forum / vendor FKs to `user_profiles` — none. Map is to `profiles`

The inbound FK introspection on `user_profiles` returned **zero FKs**. The community FKs all target `profiles.id`:

| Source | Source col | Target | Constraint |
| --- | --- | --- | --- |
| `vendor_endorsements` | endorser_id | profiles.id | `vendor_endorsements_endorser_id_fkey` |
| `forum_threads` | author_id | profiles.id | `forum_threads_author_id_fkey` |
| `forum_replies` | author_id | profiles.id | `forum_replies_author_id_fkey` |
| `case_studies` | submitter_id | profiles.id | `case_studies_submitter_id_fkey` |
| `case_study_endorsements` | endorser_id | profiles.id | `case_study_endorsements_endorser_id_fkey` |
| `notification_subscriptions` | user_id | profiles.id | `notification_subscriptions_user_id_fkey` |
| `notification_deliveries` | user_id | profiles.id | `notification_deliveries_user_id_fkey` |

**Implication:** the brief's constraint that we "preserve community FKs" is satisfied automatically. Community FKs already point to the correct destination (`profiles`). Dropping user_profiles in Phase 3 will not orphan any community foreign-key reference. The remaining work is the application-side migration of the `.from('user_profiles')` call sites to `.from('profiles')`.

---

## D. `schema_migrations` registry state

Confirmed gap pattern from schema audit: the registered migrations are `001-007`, `009-011`, `013`, `015-025`, `051-074`. **The 026-050 band is unregistered**, even though all those migrations' effects exist in the live schema (the apply mechanism that ran them never wrote to `supabase_migrations.schema_migrations`).

**Apply path is safe for new migrations 075+.**

`apply-pending.mjs` enforces:
- `MIN_VERSION = "052"` floor — anything below is unconditionally skipped (the operator's pragmatic decision: production has been running on top of those for months, re-applying would error on `already exists`).
- `SKIP_VERSIONS = {006, 007}` — these are the historically-applied-but-unregistered ones the supabase CLI gets confused about.
- Anything ≥ 052 not in the registered set is applied + registered atomically.

So: migration 075 will be picked up cleanly, applied, registered. The 026-050 corruption is an upstream concern (a `supabase db reset` from fresh would still trip on it) but does NOT block this dispatch. **No registry-repair migration is opened in this dispatch.** Documented as a separate concern.

---

## E. Migration 048 (`integrity_flags`) and 050 (`workflow_gap`) — NOT applied; left out of scope

Confirmed via direct table existence check: `integrity_flags` does NOT exist in the live DB. Migration files 048 + 050 are present on disk but their effects are not in the schema (they're not registered, and `apply-pending.mjs` won't pick them up because they're below MIN_VERSION 052).

**Decision: do NOT apply 048 + 050 in this dispatch.** Per the dispatch guidance, this is scope creep relative to the multi-tenant foundation. They remain on disk for a future dispatch.

---

## F. PR #100's RPCs (`get_market_intel_items`, `get_research_items`, `get_operations_items`) — confirmed live in master

Verified via `pg_get_functiondef()` introspection. All three exist as `SECURITY DEFINER`, take only `p_org_id uuid`, and **do not check `auth.uid()` membership**. They route through `_workspace_active_items(p_org_id)` then filter by `sources.source_role`. Workstream C will harden them along with the other four (`get_workspace_intelligence`, `get_workspace_intelligence_dashboard`, `get_workspace_intelligence_listings`, `get_workspace_intelligence_aggregates`, `get_workspace_intelligence_aggregates_scoped`, `get_workspace_intelligence_slim`, `_workspace_active_items`).

**Total RPCs to harden: 10 functions.** (The dispatch said seven; the live audit surfaces three more: `_workspace_active_items` is the shared scope function, `get_workspace_intelligence_aggregates_scoped` takes a 2-arg signature, `get_workspace_intelligence_slim` is a slim variant. All accept `p_org_id`. All currently leak.)

The membership check goes into `_workspace_active_items` as the choke point AND into the `_aggregates_scoped` and `_aggregates` and `dashboard` and `listings` and `slim` and `intelligence` and `market_intel` and `research` and `operations` functions, because some of them call `_workspace_active_items` (which would block them via the inner exception) but others touch `intelligence_items` directly. To be safe, the check is added to **every** function with `p_org_id` as a defense-in-depth move. Per [[operational-rpc-authoring]] the auth check is the first thing in the function body.

---

## G. `org_memberships.role` — already four values

CHECK constraint already in place: `CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text, 'viewer'::text])))`. Sample row is `'owner'`. The brief proposed admin/member/viewer; live schema has owner/admin/member/viewer. **Decision: keep all four.** `owner` is the creator-of-org bit; `admin` is delegated admin (can invite/remove); `member` is full access; `viewer` is read-only. This matches Bloomberg-style team structures (Workspace Owner, Workspace Admin, Member, Read-only).

---

## H. `workspace_settings.sector_profile` — actually `text[]`, not jsonb

The dispatch brief and the v2 audit Section 6.8 both refer to `workspace_settings.sector_profile` as `jsonb`. Live DB shape is **`text[] NOT NULL DEFAULT '{}'`**. Sample value: `["fine-art", "live-events", "luxury-goods", "film-tv", "automotive", "humanitarian"]`.

**Decision: do NOT alter this column shape.** The text[] is already what every reader expects (it's what `workspaceStore.sectorProfile: string[]` consumes). Treat the brief's `jsonb` references as imprecise; the canonical shape is `text[]`. The migration adds neither a new column nor a type change to sector_profile in workspace_settings.

`jurisdiction_weights jsonb` is the other JSONB column on workspace_settings — that one IS jsonb (verified). Sample row shows it as `{"eu": 1, "uk": 0.8, ...}`. Out of scope to change.

---

## I. Decisions explicitly made

### I.1 Watchlist scoping (per dispatch decision #1)

**Both layers.** Keep `user_watchlist` (already exists, 0 rows) as the personal watchlist. Add `org_watchlist` as the team-shared watchlist. RLS:
- `user_watchlist` visible to owner only (current policies stay).
- `org_watchlist` visible to all org members; insertable by member+ role.

This is the Bloomberg pattern: my watchlist vs the desk's watchlist. Surfaced in Workstream C.

### I.2 `org_memberships.role` enum

Per finding G: keep owner/admin/member/viewer as already constrained. Brief proposed admin/member/viewer; live includes owner. Aligning the brief: invitations propose `admin`/`member`/`viewer` only (the creator of an org becomes `owner` automatically; `owner` is not invitable).

### I.3 Onboarding state machine UI

Three states per brief:
- **Authenticated, no membership** → "No workspace yet" landing page with two CTAs: "Accept an invitation" (paste/scan token URL) and "Create your own org".
- **Authenticated, has invitation pending** → invitation banner offering accept/decline.
- **Authenticated, with membership** → existing dashboard.

Chrome stays minimal, operator-functional. UI scaffolding only; no visual design polish.

### I.4 Email stub format

Three log paths:
1. Console log of the invitation URL on POST `/api/orgs/[org_id]/invitations`.
2. Token persisted to `org_invitations.token`.
3. Admin chrome (the admin dashboard "Invitations" tab) shows the URL with a copy button.

No real email integration. The "send" verb in the API is stubbed to "create row + log".

---

## J. Phase 1 / Phase 2 / Phase 3 scoping for user_profiles drop

Per the dispatch's two-phase rollout requirement:

**Phase 1 (migration 075, in PR A):**
- ADD COLUMN IF NOT EXISTS to `profiles`: `timezone text NOT NULL DEFAULT 'UTC'`, `sector_overrides text[] NOT NULL DEFAULT '{}'`, `jurisdiction_overrides text[] NOT NULL DEFAULT '{}'`, `transport_mode_overrides text[] NOT NULL DEFAULT '{}'`, `verifier_status text NOT NULL DEFAULT 'none'`, `verifier_since timestamptz NULL`, `is_platform_admin boolean NOT NULL DEFAULT false`.
- Backfill: copy from user_profiles to profiles for the matching id.
- Dual-write trigger on `user_profiles` INSERT/UPDATE that mirrors writes to `profiles` for the overlapping fields. Conversely a trigger on `profiles` UPDATE for those fields mirrors to `user_profiles` until Phase 3.
- Mark user_profiles columns deprecated via `COMMENT ON COLUMN`.

**Phase 2 (in PR A, code changes):**
- Migrate every `.from('user_profiles')` reader to `.from('profiles')`, with column renames: `name` → `full_name`, `headshot_url` → `avatar_url`, `sectors` → `sector_overrides`, `jurisdictions` → `jurisdiction_overrides`, `transport_modes` → `transport_mode_overrides`. `bio`, `timezone`, `verifier_status`, `verifier_since`, `is_platform_admin` keep names.
- The PostgREST embed `user:user_profiles(...)` becomes `user:profiles!user_id(...)`. **Note:** since profiles.id is conventionally auth.users.id and org_memberships.user_id is conventionally auth.users.id, the PostgREST resolver needs to be told the join column. The cleanest fix is to add a real FK constraint `org_memberships.user_id → profiles.id` in migration 075. This also tightens the schema (currently org_memberships.user_id has NO FK at all). **Decision: add this FK as part of migration 075.**
- Update the `server-bootstrap.ts` resolver to read sector overrides from `profiles.sector_overrides` and the canonical workspace sectors from `workspace_settings.sector_profile`. The store gets both: a per-user overrides array and a per-workspace defaults array. (The actual two-layer ranking math is downstream Section 6.8 work; this dispatch just gets the data to the store.)
- Update OnboardingWizard's broken `pronouns/role/employer/...` upsert to write to `profiles` (most of those columns don't exist there either; either drop them from the wizard or surface them as a follow-up. **Decision: drop them from the wizard write path; the wizard captures full_name/region only and writes to profiles. The other fields surface in /profile.**)

**Phase 3 (deferred follow-up PR after Phase 1+2 stable):**
- Drop `user_profiles` triggers, then drop the table.
- Remove `user_profiles` references from `apply-pending.mjs` exclusions and any other workflow.

---

## K. Sequencing summary

The three PRs in dispatch order:

1. **PR `feat/multi-tenant-A-schema-cleanup`** — migration 075 (add columns, backfill, dual-write triggers, FK addition) + Phase 2 reader/writer migration. Build verified. Phase 3 follow-up planned.
2. **PR `feat/multi-tenant-B-invitations`** — migration 076 (org_invitations table + RLS) + RPC for accept/decline + API endpoints + onboarding state UI. Build verified.
3. **PR `feat/multi-tenant-C-rpc-membership-checks`** — migration 077 (membership check on all 10 RPCs, get_workspace_members helper, org_watchlist table + RLS). Build verified.

Each PR includes:
- Migration files
- Code changes
- Test plan with manual verification
- Build verification (`npm run build` passes)
- Apply-pending command surfaced in PR description for post-merge

---

## L. Halt-condition check

Per the dispatch's halt conditions:

- **profiles shape materially different?** No — it's richer than expected and *more* of the destination columns already exist. Proceed.
- **Community FKs to user_profiles invasive?** No — no community FKs target user_profiles. They all target profiles. Proceed.
- **schema_migrations corruption blocks new migrations?** No — `apply-pending.mjs` MIN_VERSION=052 floor sidesteps the band; 075+ apply cleanly. Proceed.
- **14-PR batch from 2026-05-15 conflicts?** No — PR #113 (`refactor(rpcs): extract shared workspace-scope SQL function`) just landed; this means `_workspace_active_items` exists as a shared choke-point function. **This is positive: the membership check becomes a one-line addition to that function.** Proceed.
- **Required decision genuinely ambiguous?** No — all four explicit decisions (I.1-I.4) have a clear recommendation matched to brief intent. Proceed.

**No halt conditions hit. Proceeding to Workstream A.**

---

## Appendix: live DB introspection artifacts

- `fsi-app/scripts/tmp/prework-multi-tenant-2026-05-15.json` — full table shapes, RLS policies, RPC bodies, sample rows.
- `fsi-app/scripts/tmp/prework-mt-2-2026-05-15.json` — outbound FKs, helper function bodies, all RPCs with p_org_id arg.

Both files preserved for re-derivation.
