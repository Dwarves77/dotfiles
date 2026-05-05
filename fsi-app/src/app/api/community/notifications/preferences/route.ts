// GET /api/community/notifications/preferences
// PUT /api/community/notifications/preferences
//
// Read or upsert the caller's notification preferences row.
//
// Schema reference (migration 032 — notification_preferences):
//   user_id PRIMARY KEY (1 row per user)
//   enabled                          boolean default true
//   on_mention                       boolean default true
//   on_reply_in_my_threads           boolean default true
//   on_new_post_in_joined_groups     boolean default false
//   on_invite                        boolean default true   (soft-enforced)
//   on_promote                       boolean default true
//   channels                         text[]   default ['in_app']
//   updated_at
//
// Notification kinds that map to per-kind toggles:
//   mention     -> on_mention
//   reply       -> on_reply_in_my_threads
//   invite      -> on_invite                (always delivered; toggle is
//                                              soft and ignored by worker)
//   promote     -> on_promote
//   moderation  -> (no per-kind toggle; gated only by `enabled`)
//
// API shape (kept stable across the kind/channel grid the UI renders):
//   GET  -> {
//            preferences: {
//              enabled: bool,
//              kinds: { mention: bool, reply: bool, invite: bool,
//                       promote: bool, moderation: bool },
//              channels: { in_app: bool, email: bool, push: bool }
//            },
//            channel_status: { in_app: "live", email: "coming_soon",
//                              push: "coming_soon" }
//          }
//   PUT body:
//          { preferences: {
//              enabled?: bool,
//              kinds?: { <kind>?: bool, ... },
//              channels?: { in_app?: bool, email?: bool, push?: bool }
//          } }
//
// Auth:    cookie session via requireCommunityAuth.
// Limits:  60 req/min/user via checkRateLimit.
// RLS:     SELECT/INSERT/UPDATE self-only — no service role.

import { NextRequest, NextResponse } from "next/server";
import {
  requireCommunityAuth,
  isCommunityAuthError,
} from "@/lib/api/community-auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";

type NotificationKind =
  | "mention"
  | "reply"
  | "invite"
  | "promote"
  | "moderation";

const VALID_KINDS: NotificationKind[] = [
  "mention",
  "reply",
  "invite",
  "promote",
  "moderation",
];

const VALID_CHANNELS = ["in_app", "email", "push"] as const;
type Channel = (typeof VALID_CHANNELS)[number];

// Phase C ships in_app only; email/push pipelines are deferred. The UI
// flags them "coming soon" but the schema preserves the toggles so they
// can flip on later without a migration.
const CHANNEL_STATUS: Record<Channel, "live" | "coming_soon"> = {
  in_app: "live",
  email: "coming_soon",
  push: "coming_soon",
};

interface PrefRow {
  user_id: string;
  enabled: boolean;
  on_mention: boolean;
  on_reply_in_my_threads: boolean;
  on_new_post_in_joined_groups: boolean;
  on_invite: boolean;
  on_promote: boolean;
  channels: string[];
  updated_at: string;
}

function rowToShape(row: PrefRow | null) {
  if (!row) {
    // Defaults (same as schema defaults). Returned when the user has
    // never written a preferences row.
    return {
      enabled: true,
      kinds: {
        mention: true,
        reply: true,
        invite: true,
        promote: true,
        moderation: true,
      },
      channels: { in_app: true, email: false, push: false },
    };
  }
  const channelsArr = row.channels ?? [];
  return {
    enabled: row.enabled,
    kinds: {
      mention: row.on_mention,
      reply: row.on_reply_in_my_threads,
      invite: row.on_invite,
      // moderation has no per-kind toggle in the schema; its delivery is
      // gated only by `enabled`. Surface it as derived-from-enabled.
      promote: row.on_promote,
      moderation: row.enabled,
    },
    channels: {
      in_app: channelsArr.includes("in_app"),
      email: channelsArr.includes("email"),
      push: channelsArr.includes("push"),
    },
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireCommunityAuth(request);
  if (isCommunityAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const { data, error } = await auth.supabase
    .from("notification_preferences")
    .select(
      "user_id, enabled, on_mention, on_reply_in_my_threads, on_new_post_in_joined_groups, on_invite, on_promote, channels, updated_at"
    )
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      preferences: rowToShape(data as PrefRow | null),
      channel_status: CHANNEL_STATUS,
    },
    { headers: rateLimitHeaders(auth.userId) }
  );
}

export async function PUT(request: NextRequest) {
  const auth = await requireCommunityAuth(request);
  if (isCommunityAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  let body: {
    preferences?: {
      enabled?: boolean;
      kinds?: Partial<Record<NotificationKind, boolean>>;
      channels?: Partial<Record<Channel, boolean>>;
    };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }
  const incoming = body.preferences;
  if (!incoming || typeof incoming !== "object") {
    return NextResponse.json(
      { error: "preferences object required" },
      { status: 400 }
    );
  }

  // Validate any kind keys provided.
  if (incoming.kinds) {
    for (const k of Object.keys(incoming.kinds)) {
      if (!VALID_KINDS.includes(k as NotificationKind)) {
        return NextResponse.json(
          { error: `Unknown notification kind: ${k}` },
          { status: 400 }
        );
      }
    }
  }
  if (incoming.channels) {
    for (const c of Object.keys(incoming.channels)) {
      if (!VALID_CHANNELS.includes(c as Channel)) {
        return NextResponse.json(
          { error: `Unknown channel: ${c}` },
          { status: 400 }
        );
      }
    }
  }

  // Read existing row (if any) so we can merge unspecified fields rather
  // than zeroing them on every PUT.
  const { data: existingRaw, error: readErr } = await auth.supabase
    .from("notification_preferences")
    .select(
      "user_id, enabled, on_mention, on_reply_in_my_threads, on_new_post_in_joined_groups, on_invite, on_promote, channels, updated_at"
    )
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }
  const existing = existingRaw as PrefRow | null;

  const merged: Omit<PrefRow, "updated_at"> = {
    user_id: auth.userId,
    enabled: incoming.enabled ?? existing?.enabled ?? true,
    on_mention:
      incoming.kinds?.mention ?? existing?.on_mention ?? true,
    on_reply_in_my_threads:
      incoming.kinds?.reply ?? existing?.on_reply_in_my_threads ?? true,
    // Not exposed in the kinds grid (no UI control); preserve schema
    // default false unless previously set.
    on_new_post_in_joined_groups:
      existing?.on_new_post_in_joined_groups ?? false,
    on_invite: incoming.kinds?.invite ?? existing?.on_invite ?? true,
    on_promote: incoming.kinds?.promote ?? existing?.on_promote ?? true,
    channels: (() => {
      const current = new Set<string>(
        existing?.channels ?? ["in_app"]
      );
      if (incoming.channels) {
        for (const ch of VALID_CHANNELS) {
          const v = incoming.channels[ch];
          if (v === true) current.add(ch);
          else if (v === false) current.delete(ch);
        }
      }
      // Always keep at least one channel — fall back to in_app.
      if (current.size === 0) current.add("in_app");
      return Array.from(current);
    })(),
  };

  const { data, error } = await auth.supabase
    .from("notification_preferences")
    .upsert(merged, { onConflict: "user_id" })
    .select(
      "user_id, enabled, on_mention, on_reply_in_my_threads, on_new_post_in_joined_groups, on_invite, on_promote, channels, updated_at"
    )
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      ok: true,
      preferences: rowToShape(data as PrefRow | null),
      channel_status: CHANNEL_STATUS,
    },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
