# C8 — Community moderation workflow

Phase C, Block C8. Moderation reports for community posts: any group
member can report a post, group admins/moderators can review, take
action, and close the report. Platform admins can act on any report.

This document is the integration handoff for the C5 (post UI) and the
shell/route orchestrators.

---

## Files shipped in this block

API routes (RLS-aware, cookie-session auth, 60/min/user rate limit):

- `fsi-app/src/app/api/community/moderation/reports/route.ts`
  - `GET ?status=&group_id=&limit=` — list reports.
  - `POST` — file a new report.
- `fsi-app/src/app/api/community/moderation/reports/[id]/route.ts`
  - `GET` — single report detail (with reported post embedded).
  - `POST` — take action on a report (idempotent — closed reports
    return 409).

Components (light-first):

- `fsi-app/src/components/community/ReportPostMenu.tsx` — the
  reporter-side dialog. Self-contained: button + reason select +
  optional 2,000-char body. Posts to `POST /api/community/moderation/
  reports`.
- `fsi-app/src/components/community/ModerationQueue.tsx` — the
  reviewer-side queue. Filterable by status/reason, scoped optionally
  to a single `groupId`.
- `fsi-app/src/components/community/ModerationActions.tsx` — the
  action button row used inside `ModerationQueue`. Confirms
  destructive actions; surfaces Phase D fallbacks.

---

## moderation_reports schema (migration 032 — verified)

The migration shipped a more general schema than the C8 spec assumed.
Notable differences from the spec brief:

| Spec brief column      | Actual column                         | Notes |
| ---------------------- | ------------------------------------- | ----- |
| `id`                   | `id` (uuid PK)                         |       |
| `reporter_user_id`     | `reporter_user_id` (uuid → auth.users) | nullable on user delete (set null) |
| `target_post_id`       | `target_kind` + `target_id`            | target_kind ∈ {`post`,`group`,`user`}; target_id is a soft FK |
| `reason`               | `reason` (text)                        | open text (no enum check); we standardise the vocabulary in the API |
| `body`                 | _missing_                              | encoded into `reason` as `<reason>\|<body>` |
| `status`               | `status` (text)                        | check (`open`, `resolved`, `dismissed`) |
| `reviewed_by`          | `resolved_by_user_id`                  |       |
| `reviewed_at`          | `resolved_at`                          |       |
| `action_taken`         | _missing_                              | encoded into `reason` as `<…>\|\|action=<verb>;notes=<text>` |
| `created_at`           | `created_at`                           |       |

The two encoded sentinels (`|` and `||`) keep the audit trail in the
existing schema with no migration. The API decodes both fields on
read.

If/when a Phase D migration adds explicit `body`, `action_taken`, and
`notes` columns, the encoding can be rolled forward in a single
update step (the prefixes are easy to detect).

---

## Action effects — implemented vs Phase D stub

| Action        | Implementation status |
| ------------- | --------------------- |
| `dismiss`     | Fully implemented. Sets `status='dismissed'`. No side effect. |
| `remove_post` | Fully implemented as a HARD delete. `community_posts` has no `deleted_at` column (verified across all 32 migrations), so the spec-requested soft delete is not yet possible. RLS gates DELETE to author + group admins/moderators, which is exactly the audience that decides reports. |
| `warn_user`   | Fully implemented. Inserts a `notifications` row (`kind='moderation'`) with payload `{ moderation_kind: 'warn', group_id, post_id, report_id, notes }`. RLS on `notifications.INSERT` is service-role-only, so the route uses the service client narrowly for this one write — same pattern already used by `/api/community/invitations/[id]/accept`. |
| `mute_user`   | **Phase D stub.** `community_group_members` has no `muted_until` column. The handler accepts the action, falls back to a `warn_user`-style notification (`moderation_kind: 'mute_phase_d'`), and returns `phase_d_stub: true` so the UI can disclose the degraded behaviour. The report status still moves to `resolved` and the audit trail still records `action=mute_user`. |
| `ban_user`    | Fully implemented. Deletes the post author's `community_group_members` row for the post's group. RLS on `community_group_members.DELETE` allows group admins to remove other members; a moderator-only reviewer will fail the delete cleanly and the failure surfaces in `side_effect_errors`. A `notifications` row (`moderation_kind: 'ban'`) is also emitted. |

All five actions are idempotent at the report level: re-deciding a
closed report (`status != 'open'`) returns 409 with `{ status: '<current>' }`.

---

## Auth / RLS summary

- `POST /api/community/moderation/reports` — caller must be an
  authenticated member of the post's group. The handler reads the
  caller's `community_group_members` row before insert (RLS allows
  self-row reads) and 403s a non-member.
- `GET /api/community/moderation/reports` — RLS on `moderation_reports`
  scopes the read: reporter sees own; group admin/moderator sees
  reports on their group's posts; platform admin sees all.
- `GET /api/community/moderation/reports/[id]` — same RLS path as
  the list. RLS-hidden rows return 404 to avoid leaking existence.
- `POST /api/community/moderation/reports/[id]` — RLS on
  `moderation_reports.UPDATE` requires platform-admin or group-admin/
  moderator. Side effects (`remove_post`, `ban_user`) ride on the
  reviewer's RLS-aware client so the secondary RLS gate (post DELETE,
  member DELETE) provides the second factor of authorisation. Only
  the `notifications` insert uses service role.

---

## Rate limit

Standard 60/min/user (`checkRateLimit` from `src/lib/api/rate-limit.ts`).
Each handler emits the standard `X-RateLimit-*` headers on success.

---

## Integration spec — `ReportPostMenu` inside C5's Post.tsx

C5 owns `Post.tsx`. The expected wire-up is one of:

1. **Default footer button** (simplest). Inside the Post footer
   (next to reply/share controls), render:
   ```tsx
   import { ReportPostMenu } from "@/components/community/ReportPostMenu";

   <ReportPostMenu postId={post.id} onToast={onToast} />
   ```
   The component renders a small Flag-icon button. Clicking opens its
   own modal dialog and posts to the moderation API on submit.

2. **Inside an overflow menu** (preferred, matches Slack/forum
   convention). When Post.tsx already has a `…` overflow menu, use
   the `trigger` render prop to plug ReportPostMenu's dialog into a
   parent menu row:
   ```tsx
   <ReportPostMenu
     postId={post.id}
     onToast={onToast}
     trigger={(open) => (
       <button onClick={open} role="menuitem">
         Report this post
       </button>
     )}
   />
   ```
   The parent owns the trigger styling and menu row; the dialog is
   still self-managed by ReportPostMenu.

The component handles its own:
- open/close state
- Escape key + backdrop click dismiss
- focus management (focuses the reason `<select>` on open)
- form submission, error display, busy state
- toast handoff via `onToast` (calls back with success on submit, error on failure)

The component does NOT render a confirmation step — reports are
themselves the confirmable action. Submit closes the dialog and
emits a success toast.

Authorization: the API enforces "must be a member of the post's
group". C5 should still hide the button entirely when
`!currentUser` or when the viewer is not a group member, to avoid
showing a button that would 403.

---

## Recommended location for `ModerationQueue`

Two options. The orchestrator decides; both are RLS-safe.

### Option A — standalone route at `/community/moderation` (preferred)

Inside the CommunityShell layout (the shell already tags
`body[data-side="community"]` so the community sidebar persists).
The page renders `ModerationQueue` with no `groupId` prop, giving
the platform-admin global view; RLS narrows the reader's set.

A future enhancement would add `?group_id=…` URL plumbing so a
group admin can deep-link to their own group's queue.

Pros:
- Discoverable from the community sidebar (add a "Moderation" link
  visible to group-admin/moderator/platform-admin roles).
- Single place to triage across groups.
- Keeps the Group Settings modal small.

### Option B — "Moderation" tab inside the Group Settings modal (C6)

When C6 ships `GroupHeader`'s Settings modal, add a "Moderation"
tab that mounts `<ModerationQueue groupId={group.id} />`. RLS
filters to that group automatically; the `groupId` prop also
narrows the client-side request.

Pros:
- Co-located with other group admin tools.
- No new route, no new sidebar link.

Trade-off: platform-admin global view still wants Option A.

**Recommendation:** ship Option A for the global review surface
and keep Option B as a follow-up convenience inside Group Settings.

---

## Constraints honoured

- No new migrations.
- No emojis in any UI copy or component.
- Soft-delete only where the schema supports it (it does not for
  posts; documented above).
- Idempotent at the report level: closed reports return 409.
- Audit trail: `resolved_by_user_id` + `resolved_at` stamped on every
  decided report. `action_taken` and `notes` stored as a sentinel
  suffix on the `reason` column until a Phase D migration adds
  proper columns.
- RLS-aware on every read and on the report state transitions; the
  one service-role write is the `notifications` insert (the schema
  has no other path to deliver a per-user notification).

---

## Outstanding migration debt for Phase D

To make this block schema-clean, a future migration should add to
`moderation_reports`:

- `body text` — separate the reporter's freeform notes from the
  reason key.
- `action_taken text check (action_taken in (...))` — stop sentinel-
  encoding action verbs into `reason`.
- `reviewer_notes text` — drop the `notes=` sentinel.

And to enable the two stubbed actions:

- `community_group_members.muted_until timestamptz` — restore
  `mute_user` to a real implementation.
- `community_posts.deleted_at timestamptz` — convert `remove_post`
  from hard delete to soft delete (the C8 brief's preferred
  semantics).

None of these are in scope for C8 per the "no new migrations"
constraint, and the API encoding plus the response field
`phase_d_stub: true` make the migration roll-forward straightforward.
