# C6 — Promote Community Post to Intelligence

**Block:** Phase C, C6
**Status:** Implemented (this PR)
**Owner files:**

- `fsi-app/supabase/migrations/041_post_promotions.sql`
- `fsi-app/src/app/api/community/posts/[id]/promote/route.ts`
- `fsi-app/src/components/community/PromotePostButton.tsx`
- `fsi-app/src/components/community/PromotePostDialog.tsx`
- `docs/C6-promote-spec.md` (this file)

## Why

Community posts in private (and eventually public) groups regularly surface
real regulatory findings — a member spots a new DEFRA consultation, a port
operator flags an emerging surcharge, a customs broker shares a gazetted
amendment. Until C6, those findings stayed inside the discussion. C6 is
the bridge: a one-click promotion that turns a community post into a
platform intelligence item — either staged for admin review (default) or
inserted directly (platform admins only).

## Two promotion kinds

| Kind     | Auth                          | Destination                             | Use case                                                                                                |
| -------- | ----------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `staged` | Any group member of the post  | `staged_updates` (status=`pending`)     | Default flow. Member flags a finding; platform admin reviews/approves/rejects in the admin queue.       |
| `direct` | Platform admin only           | `intelligence_items` (immediate insert) | Bypass the queue. Reserved for trusted operators who already have admin oversight on the source domain. |

Both paths write an immutable audit row to `post_promotions` and stamp the
post with `community_posts.promoted_at`. For `direct`, the post is also
linked to the new item via `community_posts.promoted_to_item_id`. For
`staged`, that link stays `NULL` until the staged update is approved (Phase
D follow-up — see below).

## Migration order

| Mig | Name                                | Notes                                                  |
| --- | ----------------------------------- | ------------------------------------------------------ |
| 040 | (PR #20)                            | Prerequisite — already on master.                      |
| 041 | `041_post_promotions.sql` (this PR) | Adds `post_promotions` table + 2 cols on community_posts. |

Apply 041 via the orchestrator after the C6 PR is opened. Do NOT execute
against the live DB from a development branch — schema migrations follow
the two-track policy in STATUS.md rule 12.

## API

### `POST /api/community/posts/[id]/promote`

Auth: cookie session via `requireCommunityAuth` (community-auth helper).
Rate limit: 60 req/min/user (standard).

Request body:

```ts
{
  kind: 'staged' | 'direct',
  intelligence_item: {
    title: string,                    // required, ≤300 chars
    source_url: string,               // required, http(s)
    item_type:                        // required, one of:
      'regulation' | 'directive' | 'standard' | 'guidance' | 'framework'
      | 'technology' | 'innovation' | 'tool' | 'regional_data'
      | 'market_signal' | 'initiative' | 'research_finding',
    jurisdiction_iso?: string[],      // optional, e.g. ['EU', 'GB']
    priority?: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW',
    summary?: string,                 // optional; defaults to post.body
  },
  notes?: string                      // optional reviewer note
}
```

Responses:

| Status | Shape                                                                    | Meaning                                                  |
| ------ | ------------------------------------------------------------------------ | -------------------------------------------------------- |
| 201    | `{promotion_id, staged_update_id?, intelligence_item_id?}`                | Promoted. Exactly one of the two ids is non-null.        |
| 400    | `{error: string}`                                                        | Invalid body.                                            |
| 401    | `{error: 'Authentication required'}`                                     | No session.                                              |
| 403    | `{error: 'Group membership required to stage a promotion'}`              | Not a member, kind=staged.                               |
| 403    | `{error: 'Platform admin required for direct promotion'}`                | Not platform admin, kind=direct.                         |
| 404    | `{error: 'Post not found'}`                                              | Post id missing/invisible.                               |
| 409    | `{error: 'Post already promoted', promotion: {...}}`                     | Idempotent — returns the prior promotion's row.          |
| 429    | (rate-limit body)                                                        | Standard 60/min.                                         |
| 500    | `{error: string, staged_update_id?, intelligence_item_id?}`              | Upstream insert succeeded but audit row failed — the upstream id is surfaced for manual reconciliation. |

### Service-role escape rationale

`staged_updates`, `intelligence_items`, and `post_promotions` are all
service-role-only on writes per migrations 005 and 041. The handler:

1. Validates the caller's identity + permissions using the cookie-bound,
   RLS-aware `auth.supabase` client.
2. Performs the insert(s) with the service-role client (the validated
   permission check is the gate).

This matches the existing pattern in `/api/community/groups/[id]/join`
(which uses service-role for membership inserts after validating
`privacy='public'`).

### Idempotency

Two layers:

1. Application: `community_posts.promoted_at IS NOT NULL` short-circuits
   to 409 with the prior promotion details.
2. Schema: `post_promotions` has a unique index on `(post_id)` —
   concurrent requests cannot both land.

## Components

### `PromotePostButton`

Self-contained button. Owns its own dialog-open state. Visibility rule
(Phase C default):

- Group admin/moderator → button visible.
- Platform admin → button visible.
- Other group members → button hidden. (API still allows them to stage,
  but the surface is conservative.)

If `post.promoted_at` is set, renders a static "Promoted" tag instead.

Props:

```ts
{
  post: {
    id: string,
    group_id: string,
    body: string,
    parent_post_id: string | null,
    promoted_at: string | null,
  },
  currentUser: {
    id: string,
    isGroupAdmin: boolean,
    isPlatformAdmin: boolean,
  },
}
```

### `PromotePostDialog`

Modal triggered by the button. Form fields per the API spec above,
plus a kind-radio (Stage / Direct, with Direct disabled for non-admins),
ESC + click-outside dismiss, error surface for 4xx/5xx, and a
`router.refresh()` on success so the post re-renders with the
"Promoted" tag.

Light-first design: uses `--color-surface`, `--color-text-primary`,
`--color-border`, `--color-primary` semantic tokens.

## Integration with C5's `Post.tsx`

C5 owns `fsi-app/src/components/community/Post.tsx`. C6 expects Post.tsx
to import `PromotePostButton` and render it in the post's action row,
near the reply / share / report controls.

### Suggested integration

```tsx
import { PromotePostButton } from "./PromotePostButton";

// inside Post.tsx, in the action row of a top-level post:
<PromotePostButton
  post={{
    id: post.id,
    group_id: post.group_id,
    body: post.body,
    parent_post_id: post.parent_post_id,
    promoted_at: post.promoted_at, // NEW: from migration 041
  }}
  currentUser={{
    id: currentUser.id,
    isGroupAdmin: currentMembership?.role === "admin"
                  || currentMembership?.role === "moderator",
    isPlatformAdmin: currentUser.isPlatformAdmin ?? false,
  }}
/>;
```

Notes for C5:

- `community_posts.promoted_at` and `community_posts.promoted_to_item_id`
  are added by migration 041. The post-fetch query in Post.tsx (or
  whichever loader feeds it) MUST select these columns. If C5 lands first
  with a fixed select-list, treat this as a follow-up note to widen the
  select after 041 ships.
- `currentUser.isPlatformAdmin` is not in the existing
  `CommunityCurrentUser` type (`fsi-app/src/components/community/types.ts`).
  C5/C6 integration may extend that type; alternatively, C5 fetches it
  alongside the existing user shape via `user_profiles.is_platform_admin`.
- The button auto-hides for replies (`parent_post_id != null`).

## Phase D follow-up

When a `staged` promotion is approved, the approval handler (the existing
`/api/staged-updates` POST handler, which materializes pending rows) needs
to:

1. INSERT the new `intelligence_items` row from the staged proposed_changes.
2. UPDATE `community_posts SET promoted_to_item_id = <new_item_id>` for
   the post referenced in `proposed_changes.provenance.post_id`.

The `provenance` object in `staged_updates.proposed_changes` carries the
post linkage:

```json
{
  "provenance": {
    "kind": "community_post",
    "post_id": "<uuid>",
    "group_id": "<uuid>",
    "promoted_by": "<user_id>"
  }
}
```

Phase D should also surface a "Promoted from community" badge on the
intelligence item detail surface, sourcing the originating post via
`post_promotions.intelligence_item_id` (kind=direct) or by reverse-querying
`community_posts.promoted_to_item_id` (kind=staged, post-approval).

## Constraints honoured

- Migration is 041, after 040 from PR #20.
- Plain-text post body → intelligence item: copies `post.body` into
  `summary` when no separate summary is provided.
- Idempotent: one promotion per post (app + schema both enforce).
- Audit log on every promotion (`post_promotions`).
- Default path is `staged`. `direct` requires platform admin — agent-direct
  inserts into `intelligence_items` are not possible through this surface.
