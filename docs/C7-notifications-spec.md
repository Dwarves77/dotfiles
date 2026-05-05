# C7 — Community Notifications Surface

User-facing notification surface for the community layer. Built on the
`notifications` and `notification_preferences` tables introduced by
migration `032_community_notifications_moderation.sql`. No new
migrations are required for C7.

## Files written by C7

- `fsi-app/src/app/api/community/notifications/route.ts`
  GET (list) + POST (mark_all_read).
- `fsi-app/src/app/api/community/notifications/[id]/route.ts`
  GET (single) + POST (mark_read | mark_unread).
- `fsi-app/src/app/api/community/notifications/preferences/route.ts`
  GET + PUT (upsert).
- `fsi-app/src/components/community/NotificationsBell.tsx`
- `fsi-app/src/components/community/NotificationsList.tsx`
- `fsi-app/src/components/community/NotificationPreferencesPanel.tsx`
- `docs/C7-notifications-spec.md` (this file).

## Schema reference (migration 032)

The schema deviates slightly from the C7 task brief — the brief
described a `title / body / link / source_id / source_kind` shape; the
actual table consolidates those into a `payload jsonb`. C7 carries
that into the API and component layer:

### `notifications`
| column      | type          | notes                                              |
|-------------|---------------|----------------------------------------------------|
| id          | uuid PK       | `gen_random_uuid()`                                |
| user_id     | uuid FK       | `auth.users(id)` — RLS pin point                   |
| kind        | text          | CHECK in (`mention`, `reply`, `promote`, `invite`, `moderation`) |
| payload     | jsonb         | UI-rendered fields: `{title, body, link, …}`       |
| read_at     | timestamptz   | null = unread                                      |
| created_at  | timestamptz   | default `now()`                                    |

RLS: SELECT/UPDATE self-only. INSERT is service-role-only — user code
never inserts rows here. The application worker (or other server-side
event source) is what writes notifications.

### `notification_preferences`
Single row per user. Boolean toggles for `enabled`, `on_mention`,
`on_reply_in_my_threads`, `on_new_post_in_joined_groups`, `on_invite`,
`on_promote`. Plus `channels text[]` (default `['in_app']`).

The spec brief described a `(user_id, kind, in_app, email, push)`
matrix; the actual schema is a flat row with per-kind boolean columns
and a single `channels` array. The C7 API translates the flat row into
the kind × channel grid the UI renders, and back, on read and write.

`on_invite` is **soft-enforced**: the worker delivers invite
notifications regardless of this flag (the schema column is preserved
for future relaxation; see column comment). The preferences panel
exposes the toggle but renders an inline note explaining it has no
effect on delivery.

`moderation` has no per-kind column in the schema. C7 surfaces it as
"derived from `enabled`" — when `enabled=false`, `moderation=false`.

## Notification kinds (exact set from migration 032)

```
mention | reply | promote | invite | moderation
```

These are enforced by a `CHECK (kind in (...))` constraint on
`notifications.kind`. Any UI or worker code that produces a kind value
outside this set will fail the insert at the DB layer.

## API surface

All endpoints are RLS-aware (no service-role escape) and rate-limited
at 60 req/min/user via `checkRateLimit`. Auth is the cookie-session +
optional Bearer fallback via `requireCommunityAuth`.

### `GET /api/community/notifications`

Query params:
- `unread_only=true|1` — filter `read_at IS NULL`.
- `limit=N` — 1..100, default 20.
- `before=<ISO>` — paginate older (`created_at < before`).

Response:
```json
{
  "notifications": [{ "id": "...", "kind": "mention",
                      "payload": { ... }, "read_at": null,
                      "created_at": "..." }],
  "total_matching": 17,
  "unread_count": 3
}
```

`unread_count` is computed independently of the pagination cursor so
the bell badge stays correct while the dropdown is paged.

### `POST /api/community/notifications`

Body: `{ "action": "mark_all_read" }` — sets `read_at=now()` on every
unread row owned by the caller. Returns `{ ok: true, updated: N }`.

### `GET /api/community/notifications/[id]`

Returns the single notification or 404 (RLS hides foreign rows;
unauthorized = "not found").

### `POST /api/community/notifications/[id]`

Body: `{ "action": "mark_read" | "mark_unread" }`. Idempotent —
re-marking a read row read is a no-op.

### `GET /api/community/notifications/preferences`

Translates the flat schema row into a kind × channel grid:

```json
{
  "preferences": {
    "enabled": true,
    "kinds": {
      "mention": true, "reply": true, "invite": true,
      "promote": true, "moderation": true
    },
    "channels": { "in_app": true, "email": false, "push": false }
  },
  "channel_status": {
    "in_app": "live",
    "email": "coming_soon",
    "push": "coming_soon"
  }
}
```

If the user has never written a preferences row, schema defaults are
returned (the row is not auto-inserted on read).

### `PUT /api/community/notifications/preferences`

Body: `{ preferences: { enabled?, kinds?: {...}, channels?: {...} } }`.

Partial merge against the existing row. Unspecified fields are
preserved. Channels is a true set — unspecified channels remain in
their current state. At least one channel is always retained (`in_app`
re-added if the set would otherwise empty).

`channels` schema column treats values as a free text array — only
`in_app`, `email`, `push` are accepted by the API and validated up
front.

## Component contracts

### `NotificationsBell`
- Renders a bell icon (lucide-react `Bell`) inside a 36×36 pill.
- Polls `/api/community/notifications?unread_only=true&limit=1` for
  the `unread_count` only when `document.visibilityState === "visible"`.
- Polling interval: 60 seconds. On `visibilitychange` to visible,
  fires immediately, then resumes the interval. On hidden, the
  interval is cleared (no work in background tabs).
- Click toggles a 380px dropdown with `<NotificationsList />`. Click
  outside dismisses. Hides itself with `aria-expanded`.
- Badge shows the count to 99 then `99+`. Hidden when 0.
- Provides `onUnreadCountChange` to `NotificationsList` so optimistic
  mark-read calls reflect on the badge without a roundtrip poll.

### `NotificationsList`
- Loads `/api/community/notifications?limit=20` on mount.
- Renders kind-aware rows (`AtSign`, `MessageSquare`, `UserPlus`,
  `ShieldAlert`, `Star`). Bold title when unread; small unread-dot
  glyph on the right.
- Click marks read (POST `[id]` action=`mark_read`) and, if
  `payload.link` is present, navigates via `window.location.href` to
  let the destination layout reload with the now-read state.
- "Mark all read" button at the top calls `POST /` with
  `mark_all_read`. Optimistic with rollback on error.
- "Load older" appends a page using `before=<oldest.created_at>`.
- Falls back to `kind` label and `created_at` relative-time when
  `payload.title` / `payload.body` are absent.

### `NotificationPreferencesPanel`
- Loads `GET /preferences`, renders three sections:
  1. Master `enabled` toggle.
  2. Channels (in_app / email / push) — email and push tagged "Coming
     soon" via `channel_status.coming_soon`. Their toggles are
     visually disabled.
  3. Per-kind grid (mention / reply / invite / promote / moderation).
     `invite` shows an inline soft-enforcement note.
- Each toggle change triggers an optimistic `PUT /preferences` with a
  visible Saving / Saved / error state in the panel header.

## Polling pattern

| Aspect | Behaviour |
|---|---|
| Polling endpoint | `GET /api/community/notifications?unread_only=true&limit=1` |
| Read interval | 60000 ms (60s) |
| Active condition | `document.visibilityState === "visible"` |
| On hidden | `clearInterval` — no fetches while tab backgrounded |
| On reveal | Immediate fetch, then 60s interval resumes |
| Side-effect of dropdown open | Independent full-list fetch (`limit=20`); does not change the bell's polling cadence |
| Mark-read updates | Drive the badge count locally (no extra poll) |

This mirrors `B2ProgressBanner` in spirit (polling component) but
adds the `visibilitychange` gate so we don't burn API quota in
background tabs. Rate limit budget is comfortably below the 60/min/
user ceiling — at most 1 poll per minute plus user-driven calls.

## Recommended integration points

### Bell

Recommended primary: **`CommunityMasthead`**, immediately to the
right of the search pill (so the bell sits in the same horizontal band
as Cmd+K and the Search button). The masthead is rendered on every
`/community/*` route via `CommunityShell`, so the bell is reachable
from every community surface without changing AppShell.

Implementation note for the orchestrator: extend
`CommunityMasthead`'s top-row layout (the `EditorialMasthead`'s
`belowSlot` could host a flex wrapper that includes the search form
on the left and `<NotificationsBell />` floated right, OR the bell
could be passed in via a new optional `<topRightSlot>` prop and
positioned absolute within the masthead's title row).

Fallback secondary: **`AppShell` sidebar (global)** — useful if the
notification surface should be reachable from non-community routes
(e.g. `/dashboard`, `/research`, `/operations`). In that case mount
`<NotificationsBell />` near the user-menu / signed-in identity row.

C7 owns the component but does **not** modify either masthead or
AppShell — orchestrator wires.

### Preferences panel

Recommended: **`/settings`**, as a new section in `SettingsPage`
under the existing `DashboardSettings` and adjacent to any future
"Communications" cluster. The panel is fully self-contained — drop
`<NotificationPreferencesPanel />` into the page and it loads /
saves on its own.

If a dedicated `/settings/notifications` sub-route is preferred the
panel renders identically there. C7 makes no assumption about route
shape; the orchestrator picks the surface.

## Constraints honoured

- No new migrations.
- No emojis anywhere in code or copy.
- No service-role usage in any of the four endpoints.
- Polling at 60s only when visible.
- Notification kinds match migration 032 exactly: `mention`, `reply`,
  `promote`, `invite`, `moderation`.
- All endpoints carry `requireCommunityAuth` + `checkRateLimit` with
  rate-limit headers on success responses.
