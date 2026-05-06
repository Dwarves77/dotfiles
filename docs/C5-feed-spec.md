# C5 — Group Post Feed Specification

Phase C5 ships the post feed inside the existing `/community/[slug]`
shell. Composer at the top, top-level posts newest-first, lazy-loaded
threaded replies under each post.

## Schema status (2026-05-04)

The post feed builds on `community_posts` (migration 030). The schema
supports:

| Feature | Column / mechanism | Status |
|---|---|---|
| Top-level posts | `parent_post_id IS NULL`, `title NOT NULL` | Live |
| Threaded replies | `parent_post_id` self-FK, `title IS NULL` | Live |
| Reply counter | `reply_count`, `last_reply_at` via trigger | Live |
| Author profile | join via `author_user_id` to `user_profiles` | Live |
| Promotion attribution | `promoted_from_post_id`, `attribution` | Live (read-only here) |
| Hard delete | DELETE via RLS (author OR group admin/moderator) | Live |
| **Reactions** | `community_post_reactions` table | **NOT IN ANY MIGRATION** — deferred |
| **Soft delete** | `deleted_at` column on `community_posts` | **NOT IN MIGRATION 030** — deferred |
| **Post edit timestamp** | `updated_at` column on `community_posts` | **NOT IN MIGRATION 030** — deferred |

### Reactions are deferred

`community_post_reactions` is referenced in the C5 task spec but does
not exist in any migration. Migration 032 covers `notifications`,
`notification_preferences`, and `moderation_reports` — no reactions
table. The feed therefore ships with:

- `POST /api/community/posts/[id]/reactions` returns `501 Not Implemented`
  with a structured error explaining the deferral.
- `Post.tsx` renders a disabled "React" button with a tooltip explaining
  reactions ship in Phase D.
- When the reactions migration lands, swap the route body to a toggle
  implementation (SELECT existing reaction by post_id+user_id+emoji →
  DELETE if present, INSERT otherwise) and enable the UI control.

### Hard delete is the only deletion path

Migration 030 has no `deleted_at` column. The DELETE endpoint performs
a hard delete via the existing RLS policy
(`community_posts_delete_author_or_admin`). Reply rows CASCADE through
the `parent_post_id` FK. When soft-delete is added in a future migration
(adding `deleted_at`), update DELETE to `UPDATE ... SET deleted_at = now()`
and add `.is('deleted_at', null)` filter to GET / SELECT queries.

## API surface

All routes live under `/api/community/posts`. All require cookie-session
auth via `requireCommunityAuth` from `src/lib/api/community-auth.ts`.
All apply the standard 60/min/user rate limit.

### `GET /api/community/posts`

Query params:

| Name | Required | Default | Notes |
|---|---|---|---|
| `group_id` | yes | — | UUID. Caller must have read access via RLS. |
| `limit` | no | 20 | Max 50. |
| `before` | no | — | ISO timestamp cursor. Returns posts created before this. |

Returns `{ posts: CommunityPost[], next_cursor: string | null }`. Posts
include a denormalized `author` block (`{ user_id, name, headshot_url }`)
joined from `user_profiles`. Top-level posts only (`parent_post_id IS NULL`),
ordered by `created_at DESC`.

### `POST /api/community/posts`

Body: `{ group_id: string, title: string, body: string }`. Creates a
top-level post. RLS enforces group membership and `author_user_id =
auth.uid()`. Returns `201` with the inserted post (incl. author profile).
Returns `403` for non-members.

Validation:
- `title` 1–200 chars (CHECK constraint requires title for top-level posts).
- `body` 1–8000 chars.

### `GET /api/community/posts/[id]`

Returns the single post (top-level or reply) with author profile.

### `PATCH /api/community/posts/[id]`

Body: `{ title?: string, body?: string }`. Author-only edit. Returns
`403` for non-authors. Title edit only allowed on top-level posts
(replies fail the CHECK constraint). At least one field must be provided.

### `DELETE /api/community/posts/[id]`

Hard delete. Allowed for the post author OR a group admin/moderator
(enforced by RLS). Reply rows cascade via the `parent_post_id` FK.
Returns `{ ok: true, deleted: 1 }`.

### `POST /api/community/posts/[id]/reactions`

**Returns 501** until the `community_post_reactions` migration lands.
Body schema (when implemented): `{ emoji: string }` — toggle the
caller's reaction.

### `GET /api/community/posts/[id]/replies`

Query params: `limit` (default 10, max 50), `before` (ISO timestamp
cursor). Returns `{ replies, next_cursor }`. Replies ordered
`created_at ASC` (oldest first under a parent).

### `POST /api/community/posts/[id]/replies`

Body: `{ body: string }`. Creates a reply with `parent_post_id = id`,
`title = NULL`. Validates that the parent post is itself a top-level
post (one level of nesting only — replies to replies return 400).
Body 1–4000 chars.

## UI surface

| Component | File | Role |
|---|---|---|
| `PostComposer` | `src/components/community/PostComposer.tsx` | Top-of-feed composer; title + body; submits POST. |
| `Post` | `src/components/community/Post.tsx` | Single post card; reactions stub; reply count toggle; reply composer; delete (author/admin). |
| `PostList` | `src/components/community/PostList.tsx` | Feed list; pagination; toast notifications. |
| `ReplyComposer` | `src/components/community/ReplyComposer.tsx` | Inline reply box. |

All components are light-first, use semantic CSS variables only, and
match the visual idiom of `GroupHeader.tsx` / `GroupCard.tsx`.

The shared `CommunityPost` type is exported from `PostComposer.tsx` to
avoid creating an out-of-scope shared types file.

## Integration with `/community/[slug]/page.tsx`

The C5 components do not touch the orchestrator. The page-level
integration is a single replacement of the existing C5 stub block in
`fsi-app/src/app/community/[slug]/page.tsx`.

Add at the top of the file (alongside the other component imports):

```tsx
import { PostList } from "@/components/community/PostList";
```

Replace the existing stub (lines ~262–296 in `[slug]/page.tsx`):

```tsx
{/* Feed slot — posts ship in C5 */}
<section
  aria-label="Group posts"
  style={{ ... }}
>
  <h3>Group feed</h3>
  <p>Posts arriving with C5 — check back soon.</p>
</section>
```

with:

```tsx
<PostList
  groupId={group.id}
  currentUserId={user.id}
  isGroupMember={!!myMembership}
  isGroupAdmin={
    myMembership?.role === "admin" ||
    myMembership?.role === "moderator"
  }
/>
```

The orchestrator already has `user`, `group`, and `myMembership`
in scope from the page's data fetch. No new server-side fetches are
needed.

## Out of scope (Phase D)

- Reactions (table + endpoint + UI control)
- Soft delete (`deleted_at` column + filter)
- Post edits surfaced in UI (no `updated_at` column to display)
- Multi-level reply threading (replies-to-replies)
- Markdown / rich-text rendering — Phase C is plain text only
- Mention parsing (`@user`)
- Realtime feed updates — owned by C9
- Promote-to-public flow — owned by C6
- Moderation report UI — owned by C8
- Notification fan-out on new post / new reply — owned by C7
