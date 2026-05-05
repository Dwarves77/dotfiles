// ══════════════════════════════════════════════════════════════════════════
// C9 — Community Realtime Infrastructure
// ──────────────────────────────────────────────────────────────────────────
// Singleton supabase-js client + handler types for community surfaces.
//
// Why a singleton: each browser-side Supabase client opens its own websocket
// to Realtime. Sharing a single client across hooks/components multiplexes
// every subscription onto one socket, which is required to stay under the
// concurrent-connection budget on shared hosting and to let supabase-js
// dedupe identical channel names automatically (so two tabs of <PostList>
// for the same group share one Postgres-changes filter rather than each
// opening a separate one — the dedup is per-tab; cross-tab dedup happens
// because each tab gets its own client but Supabase Realtime fans out from
// the server side).
//
// The hooks (`useCommunityPostsRealtime`, `useCommunityNotificationsRealtime`)
// own channel lifecycle. This module is intentionally tiny — it exposes the
// client and the handler types, nothing else.
// ══════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "../supabase-browser";

// ── Domain types we hand to handlers ─────────────────────────────────────
// These are intentionally narrow. We don't re-import the full row types from
// `src/types/community.ts` because Realtime payloads are not joined and we
// want consumers to coerce/enrich as they see fit. Hooks pass through the
// raw row Supabase emits.

export interface CommunityPostRow {
  id: string;
  group_id: string;
  parent_post_id: string | null;
  author_user_id: string | null;
  title: string | null;
  body: string;
  created_at: string;
  last_reply_at: string | null;
  reply_count: number;
  promoted_from_post_id: string | null;
  attribution: "editorial" | "original-author" | "anonymous" | null;
  // Soft-delete is modeled as an UPDATE that sets a deleted_at column if/when
  // schema adds it. Today migrations 030/032 do not include deleted_at — when
  // a future migration adds it, the field flows through automatically as part
  // of the row payload; consumers should treat its presence as a soft-delete.
  deleted_at?: string | null;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  kind: "mention" | "reply" | "promote" | "invite" | "moderation";
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export type RealtimePostsHandler = (event: {
  type: "INSERT" | "UPDATE" | "DELETE";
  new?: CommunityPostRow;
  old?: CommunityPostRow;
}) => void;

export type RealtimeNotificationsHandler = (event: {
  type: "INSERT" | "UPDATE";
  new?: NotificationRow;
  old?: NotificationRow;
}) => void;

// ── Singleton client ─────────────────────────────────────────────────────
// We hold one `SupabaseClient` per tab. supabase-js internally manages the
// websocket. If construction fails (env missing, bad URL), getRealtimeClient
// returns null and the hooks fall back to no-op (components keep working via
// their existing fetch + 60s polling).

let _client: SupabaseClient | null = null;
let _initFailed = false;

export function getRealtimeClient(): SupabaseClient | null {
  if (_initFailed) return null;
  if (_client) return _client;

  // Server-render guard. Realtime is browser-only.
  if (typeof window === "undefined") return null;

  try {
    _client = createSupabaseBrowserClient();
    return _client;
  } catch (err) {
    _initFailed = true;
    // eslint-disable-next-line no-console
    console.warn(
      "[realtime] Failed to construct Supabase browser client; " +
        "components will continue without realtime.",
      err
    );
    return null;
  }
}

// ── Channel naming convention ────────────────────────────────────────────
// Centralized so hooks and any future server-side fan-out worker agree on
// names. Format: <table>:<filter-key>=<value>
//
//   community_posts:group_id=<uuid>
//   notifications:user_id=<uuid>
//
// Per-row filters scale to ~thousands of subscribers per channel, which is
// adequate through Phase C. See docs/C9-realtime-spec.md for Phase D fan-out.

export function postsChannelName(groupId: string): string {
  return `community_posts:group_id=${groupId}`;
}

export function notificationsChannelName(userId: string): string {
  return `notifications:user_id=${userId}`;
}
