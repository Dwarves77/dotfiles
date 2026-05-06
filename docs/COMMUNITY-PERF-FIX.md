# Community route perf fix — sequential → parallel data fetches

Branch: `post-merge-fixes` (off `master`, post-PR#20+#21 merge)

## Problem

After Wave 2 perf fixes the three `/community/*` server-rendered pages were
warming at ~1.4–1.5s — the slowest of any surface in the app. `[perf]`
instrumentation showed each page running 5–6 Supabase reads back-to-back
via `await`, so the wall clock was the **sum** of all round-trips even
though almost none of those reads depended on each other.

Target: ~700ms warm.

## Fix

For each page we identified the dependency graph between fetches and
collapsed independent reads into `Promise.all` batches. Each batch is
held strictly under 6 queries so a single Supabase pool connection is
never saturated.

Each batch is wrapped with a `console.log("[perf] /community/<route>
phaseN <ms>ms")` tag, alongside the existing `[perf] /community/<route>
data <ms>ms` total. Wave 2 instrumentation already added the totals; we
added phase markers so the contribution of each batch is visible in
warm logs.

## Per-page changes

### `/community` (`fsi-app/src/app/community/page.tsx`)

**Before:** 6 sequential awaits.
1. `community_group_members` (memberships)
2. `community_group_invitations` (invitations)
3. `community_topics`
4. `rpc('community_region_counts')`
5. `user_profiles`
6. `org_memberships`

All six reads are scoped only by `user.id` (or unconditional, for the
RPC). None depend on any other.

**After:** 1 parallel batch of 6.
- Single `Promise.all` over all six reads.
- Reshape steps (memberships/invitations/topics arrays, regionCounts
  map, `employer` derivation) all run after the batch lands and stay
  pure-CPU.

**Reduction:** 6 sequential → 1 parallel batch (effectively `max(t1..t6)`
instead of `t1+t2+...+t6`).

### `/community/browse` (`fsi-app/src/app/community/browse/page.tsx`)

**Before:** 8 awaits arranged as 1 sequential → 1 parallel-pair → 5
sequential.
1. `community_groups` (public groups in region)
2. `community_group_members.in(group_ids)` + `community_group_invitations.in(group_ids)` (already a `Promise.all` pair from C4)
3. `community_group_members` (sidebar memberships)
4. `community_group_invitations` (sidebar invitations)
5. `community_topics`
6. `rpc('community_region_counts', {p_privacy:'public'})`
7. `user_profiles`
8. `org_memberships`

**Dependency:** the two `.in("group_id", groupIds)` lookups depend on
the `publicGroups` result. Everything else is `user.id`-scoped and
independent of `publicGroups`.

**After:** 2 parallel batches.
- **Phase 1 (5 queries):** publicGroups + sidebar memberships +
  sidebar invitations + topics + regionRows.
- **Phase 2 (4 queries):** memberships-in-groupIds + invitations-in-groupIds
  + profile + orgRow. The two groupIds-scoped reads are skipped (set
  to `null`) when there are zero public groups in this region — saves
  two pointless `WHERE group_id IN ()` round-trips.

**Reduction:** 8 reads in 5 sequential steps → 9 reads in 2 parallel
batches. (We keep `profile`/`orgRow` in Phase 2 rather than Phase 1 so
neither batch exceeds 5 queries — well under the 6 ceiling.)

### `/community/[slug]` (`fsi-app/src/app/community/[slug]/page.tsx`)

**Before:** 8 sequential awaits.
1. `community_groups` (group by slug)
2. `community_group_members` (caller's row in this group)
3. `community_group_members` (sidebar memberships)
4. `community_group_invitations` (sidebar invitations)
5. `community_topics`
6. `rpc('community_region_counts')`
7. `user_profiles`
8. `org_memberships`

**Dependency:** `myMembership` (#2) needs `group.id` from #1. All four
sidebar-context reads (#3–#6) are `user.id`-scoped and independent of
`group.id`. Profile/org (#7, #8) likewise.

**After:** 2 parallel batches.
- **Phase 1 (5 queries):** groupRow + sidebar memberships + sidebar
  invitations + topics + regionRows.
- **Phase 2 (3 queries):** myMembership (scoped to `group.id`) +
  profile + orgRow.

**Reduction:** 8 sequential → 2 parallel batches.

## Reads that genuinely couldn't be parallelized

Only one true dependency edge exists across the three pages:

- **`/community/[slug]`** — `myMembership` (Phase 2) requires
  `group.id` resolved from `groupRow` (Phase 1). The `notFound()`
  branch must also fire after Phase 1 lands, so even if Supabase
  pipelined further it would be wasted work for a missing slug.

- **`/community/browse`** — the two `.in("group_id", groupIds)`
  lookups (Phase 2) require `publicGroups` (Phase 1). Same shape as
  above.

Everything else (sidebar memberships, sidebar invitations, topics,
region counts, profile, org row) is `user.id`-scoped and was always
parallelisable.

## Estimated impact

Assuming each Supabase query takes ~100–250ms warm:
- `/community`: 6 × ~150ms = ~900ms → 1 × ~250ms = **~250ms** in fetches.
- `/community/[slug]`: 8 × ~150ms = ~1200ms → 2 × ~250ms = **~500ms**.
- `/community/browse`: 5 sequential steps × ~200ms = ~1000ms → 2 × ~250ms = **~500ms**.

Combined with existing reshape/CPU work and Next.js render, the warm
target of ~700ms is comfortably in reach. Real numbers will land in
the `[perf]` console output — phase markers make it trivial to confirm
the parallel batches collapse as expected.

## Constraints honoured

- Each `Promise.all` batch ≤ 5 queries (under the 6-query pool ceiling).
- No community component touched (CommunityShell, CommunitySidebar, etc. unchanged).
- RLS-aware client (`createSupabaseServerClient`) usage unchanged. All
  reads continue to use the user-scoped client; no service-role escape
  hatch added.
- No new migrations.
- Pagination/limits unchanged. Existing query shapes (selects, eq/in,
  order, limit, maybeSingle) preserved verbatim — the only diff is the
  control flow that awaits them.
- TypeScript clean: each Promise.all entry is destructured back into
  its `{ data }` field with the same names downstream code already
  uses, so no consumer types changed.
