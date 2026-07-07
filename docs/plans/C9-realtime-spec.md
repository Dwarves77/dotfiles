# C9 — Community Realtime Infrastructure

**Status:** Phase C, Block C, item 9. Infrastructure landed. Component opt-in pending.

**Files owned by this block:**

- `fsi-app/src/lib/community/realtime.ts` — singleton client + handler types
- `fsi-app/src/lib/hooks/useCommunityPostsRealtime.ts` — group post subscription
- `fsi-app/src/lib/hooks/useCommunityNotificationsRealtime.ts` — user notification subscription
- `docs/C9-realtime-spec.md` — this document

C9 introduces no new components, API routes, or migrations. It is a pure client-side primitive. Other agents (C5 PostList, C7 NotificationsBell, etc.) opt in by importing the hooks.

---

## 1. Why a singleton client

Each `SupabaseClient` constructed in the browser opens its own websocket to the Realtime endpoint. If every component instantiated its own client we would burn one websocket per `<PostList>`, one per `<NotificationsBell>`, one per nested reply tree. Cheap on a single tab, expensive when the user opens four community surfaces.

The singleton in `realtime.ts` ensures every hook in a tab multiplexes its channels onto the same websocket. supabase-js handles channel deduplication internally — two components subscribing to the same channel name share a single server-side subscription.

Cross-tab dedup happens server-side: each tab still gets its own client, but Postgres-changes filters with the same predicate are coalesced by Supabase Realtime. The user opening the same group in two tabs costs two websockets and one filter on the server.

---

## 2. Hook contract

### `useCommunityPostsRealtime(groupId, handler)`

| Param      | Type                                       | Behavior                          |
|------------|--------------------------------------------|-----------------------------------|
| `groupId`  | `string \| null \| undefined`              | If falsy, the hook is a no-op.    |
| `handler`  | `RealtimePostsHandler`                     | Called on INSERT/UPDATE/DELETE.   |

**Return:** `void`. The hook owns its lifecycle.

**Handler payload:**

```ts
{
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  new?: CommunityPostRow;   // present on INSERT and UPDATE
  old?: CommunityPostRow;   // present on UPDATE and DELETE
}
```

**Filter:** `group_id=eq.<groupId>` against the `community_posts` table. Top-level posts and replies both flow through this filter (replies have `parent_post_id` set but the same `group_id`).

**Soft-delete:** today migrations 030/032 do not include a `deleted_at` column. If a future migration adds one, soft-deletes will arrive as `UPDATE` events with `deleted_at` set on `new`. The `CommunityPostRow.deleted_at` field is declared optional so consumers can branch on it without a type change.

### `useCommunityNotificationsRealtime(userId, handler)`

| Param      | Type                                       | Behavior                          |
|------------|--------------------------------------------|-----------------------------------|
| `userId`   | `string \| null \| undefined`              | If falsy, the hook is a no-op.    |
| `handler`  | `RealtimeNotificationsHandler`             | Called on INSERT/UPDATE.          |

**Return:** `void`.

**Handler payload:**

```ts
{
  type: 'INSERT' | 'UPDATE';
  new?: NotificationRow;
  old?: NotificationRow;
}
```

DELETE is not subscribed — notifications are retain-forever per migration 032.

**Filter:** `user_id=eq.<userId>` against `notifications`. RLS already restricts SELECT to the row owner; the filter is a server-side narrowing on top of that.

### Behavior shared by both hooks

1. **Channel lifecycle.** Open on mount (or when the id prop changes), close on unmount.
2. **Visibility-aware.** Listens for `visibilitychange`. Unsubscribes when `document.visibilityState !== 'visible'`. Re-subscribes when the tab returns to visible. Saves websocket bandwidth on backgrounded tabs and ensures a fresh subscription pulls any state the polling fallback already merged.
3. **Stable handler.** The handler is held in a ref, so re-renders that pass a new closure don't tear down the channel. The id prop is the only dependency that triggers re-subscription.
4. **No-op on failure.** If `getRealtimeClient()` returns null (env missing, SSR context, prior init failure), the hook does nothing. Channel-error and timed-out states are logged at warn level. Components must keep their fetch + polling fallback so the surface works without realtime.
5. **No service role.** The hooks rely on the user's Supabase session via `createSupabaseBrowserClient()`. Realtime row-level filters honour the same RLS policies as REST.

---

## 3. Channel naming convention

Format: `<table>:<filter-key>=<value>`.

- `community_posts:group_id=<uuid>`
- `notifications:user_id=<uuid>`

The helpers `postsChannelName(groupId)` and `notificationsChannelName(userId)` are exported from `src/lib/community/realtime.ts`. Use them everywhere — Phase D server-side fan-out will key off the same names.

---

## 4. Singleton failure behavior (the fallback)

`getRealtimeClient()` returns a `SupabaseClient | null`:

| Condition                                 | Returns | Side effects                            |
|-------------------------------------------|---------|-----------------------------------------|
| First call in a browser context, success  | client  | Caches the client                       |
| Subsequent call in same tab, success      | client  | Returns the cached client               |
| Server render (`typeof window === undef`) | `null`  | No log                                  |
| Constructor throws (env missing, etc.)    | `null`  | Logs warn once, sets `_initFailed=true` |
| Any call after init failure               | `null`  | No further logs                         |

The hooks branch on null and exit early. Because they exit before subscribing they don't register a `visibilitychange` listener either. This means the no-op path is genuinely zero-cost — no listeners, no closures, no leaked subscriptions.

Channel-level errors (the `subscribe()` callback reporting `CHANNEL_ERROR` or `TIMED_OUT`) are logged at warn level and the channel is left in its errored state. The next `visibilitychange` cycle will tear it down on hide and re-open on show. This gives a built-in retry without a custom backoff loop.

---

## 5. Integration guide for component owners

The hooks are opt-in. Components own their data fetching and rendering; the hooks let them merge realtime events into local state without taking a dependency on a singleton client.

### Recommended integration sequence

1. **C7 NotificationsBell first.** It has the simplest merge (increment unread on INSERT, swap read_at on UPDATE) and the tightest user value (the bell going from 0 to 1 is the most visible "live feels live" moment). Lowest risk because the polling fallback already exists.
2. **C5 PostList next.** Slightly more complex merge (dedup by id, prepend on INSERT, replace on UPDATE, drop on DELETE). Once the bell is proven, the same pattern carries.
3. **Reactions / reply trees later.** Phase D extension — most reactions tables don't yet have realtime publication enabled. C9 leaves room for a `useCommunityReactionsRealtime` hook in the same module without breaking changes.

### C5 PostList — recommended pattern

```ts
import { useCommunityPostsRealtime } from "@/lib/hooks/useCommunityPostsRealtime";

function PostList({ groupId }: { groupId: string }) {
  const [posts, setPosts] = useState<Post[]>([]);
  // ... existing fetch + 60s polling logic stays in place ...

  useCommunityPostsRealtime(groupId, (event) => {
    setPosts((prev) => {
      if (event.type === "INSERT" && event.new) {
        // Dedup: if the polling fetch already pulled this id, skip.
        if (prev.some((p) => p.id === event.new!.id)) return prev;
        // New top-level post: prepend. Reply: caller's render path handles.
        if (event.new.parent_post_id === null) {
          return [event.new as Post, ...prev];
        }
        // Reply: bump the parent post's reply_count by re-fetching or by
        // patching the parent in-place (parent id is event.new.parent_post_id).
        return prev.map((p) =>
          p.id === event.new!.parent_post_id
            ? { ...p, reply_count: p.reply_count + 1, last_reply_at: event.new!.created_at }
            : p
        );
      }
      if (event.type === "UPDATE" && event.new) {
        return prev.map((p) => (p.id === event.new!.id ? { ...p, ...event.new } : p));
      }
      if (event.type === "DELETE" && event.old) {
        return prev.filter((p) => p.id !== event.old!.id);
      }
      return prev;
    });
  });

  // ... render ...
}
```

### C7 NotificationsBell — recommended pattern

```ts
import { useCommunityNotificationsRealtime } from "@/lib/hooks/useCommunityNotificationsRealtime";

function NotificationsBell({ userId }: { userId: string }) {
  const [unread, setUnread] = useState(0);
  // ... existing fetch + 60s polling logic stays in place ...

  useCommunityNotificationsRealtime(userId, (event) => {
    if (event.type === "INSERT") {
      setUnread((n) => n + 1);
    } else if (event.type === "UPDATE") {
      // read_at flipped from null to a timestamp.
      const wasUnread = !event.old?.read_at;
      const isNowRead = !!event.new?.read_at;
      if (wasUnread && isNowRead) setUnread((n) => Math.max(0, n - 1));
    }
  });

  // ... render ...
}
```

---

## 6. Polling fallback policy

**Keep the existing 60s polling for at least one Phase C release** even after realtime is wired in. Reasons:

1. Realtime depends on Supabase publication being enabled for `community_posts` and `notifications`. If a migration accidentally drops the publication grant, realtime silently stops; polling masks the regression.
2. Channel errors degrade silently to no-ops by design. Without polling, an errored channel = a stuck UI with no warning to the user.
3. The visibility-pause behavior means a user returning to a tab after an hour starts from a stale state. Polling gives an unconditional refresh on the next tick.

Once realtime is proven stable in production (one full release cycle with no realtime-related incidents), components MAY drop polling to a longer interval (e.g. 5 minutes as a safety net) or remove it entirely. Recommend **keep both for Phase C**, revisit at Phase D kickoff.

---

## 7. Known limits and Phase D enhancements

### Per-row filter scaling

Supabase Realtime per-row filters scale to thousands of subscribers per channel. Adequate for Phase C, where each `community_groups` row has at most low-hundreds of active members and we expect total concurrent realtime subscribers in the low-thousands across the whole platform.

### Phase D: server-side fan-out

For very large groups (10k+ active members) or for federated cross-group activity feeds, the per-row filter approach hits two limits:

- Postgres `LISTEN/NOTIFY` channel proliferation pressure.
- Unbounded subscriber count on a single channel name.

The Phase D pattern: a server worker subscribes to the unfiltered Postgres changefeed for `community_posts`, applies business rules (group membership gates, mute lists, throttling), and republishes to a fan-out channel via `client.channel(...).send({ type: 'broadcast', event: 'post', payload })`. Components subscribe to the broadcast channel instead of `postgres_changes`. The hook signatures stay the same; only the internal channel topic changes.

C9 is forward-compatible: the channel-name helpers are the only seam, and a Phase D worker can pre-emptively own those names without breaking the hook contract.

### Tab dedup

supabase-js dedupes channels by name within a single client. Two `<PostList>` instances mounted in the same tab against the same group share one channel. Across tabs, each tab has its own client and Realtime opens one filtered subscription per tab — Supabase's server side coalesces identical filters cheaply.

### Reactions and reply trees

Not covered by C9. Add a `useCommunityReactionsRealtime` hook in `src/lib/community/realtime.ts` when migration adds the reactions table to the publication. The pattern follows the two existing hooks exactly.

---

## 8. Testing checklist

When component owners wire the hooks in:

- [ ] Open the surface in two browser tabs. Posting in tab A appears in tab B without refresh.
- [ ] Background tab B for >30s, then return. Subscription resumes; missed events are reconciled by the polling fallback.
- [ ] Disable Realtime in Supabase project settings. Surface continues to function on polling alone (no console errors beyond the initial warn).
- [ ] Sign out. Hooks unsubscribe cleanly (no orphaned warnings on subsequent navigation).
- [ ] Switch groups in PostList. Old channel is removed; new channel is opened.
- [ ] Open browser devtools Network → WS. Confirm only one websocket per tab regardless of how many community surfaces are mounted.

---

## 9. References

- Migration 030 — `community_posts` table definition (group_id, parent_post_id, reply_count trigger).
- Migration 032 — `notifications` table + RLS policies.
- `src/lib/supabase-browser.ts` — the browser client factory C9 wraps.
- `src/types/community.ts` — full row types for joined reads (the realtime hooks emit narrower row payloads — a join is not available on the changefeed).
