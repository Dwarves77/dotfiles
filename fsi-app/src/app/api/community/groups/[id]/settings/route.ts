// PATCH /api/community/groups/[id]/settings
// { name?, description?, privacy? }
//
// Update group metadata. Admin/moderator/owner only (RLS UPDATE policy
// on community_groups already enforces this); we pre-check the caller's
// role so a denied caller gets a clean 403 rather than a generic RLS
// failure.
//
// Privacy downgrades from private to public are permitted (the UI will
// confirm) — community_groups.privacy is the only column that meaningfully
// affects RLS visibility on posts, so a downgrade widens visibility for
// existing posts. The application layer does not retro-redact posts; that
// behaviour matches Slack and other peer-collab platforms.
//
// Auth:    cookie session via requireCommunityAuth.
// Limits:  60 req/min/user via checkRateLimit.

import { NextRequest, NextResponse } from "next/server";
import {
  requireCommunityAuth,
  isCommunityAuthError,
} from "@/lib/api/community-auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_NAME = 80;
const MAX_DESCRIPTION = 600;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCommunityAuth(request);
  if (isCommunityAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const { id: groupId } = await params;
  if (!groupId || !UUID_RE.test(groupId)) {
    return NextResponse.json(
      { error: "Valid group id required" },
      { status: 400 }
    );
  }

  let body: {
    name?: string;
    description?: string | null;
    privacy?: "public" | "private";
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate fields. Empty patch is rejected so the caller doesn't
  // accidentally trigger an audit-trail write with no meaningful change.
  const update: Record<string, unknown> = {};
  if (typeof body.name === "string") {
    const trimmed = body.name.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_NAME) {
      return NextResponse.json(
        { error: `name must be 1..${MAX_NAME} characters` },
        { status: 400 }
      );
    }
    update.name = trimmed;
  }
  if ("description" in body) {
    if (body.description === null) {
      update.description = null;
    } else if (typeof body.description === "string") {
      if (body.description.length > MAX_DESCRIPTION) {
        return NextResponse.json(
          {
            error: `description must be at most ${MAX_DESCRIPTION} characters`,
          },
          { status: 400 }
        );
      }
      update.description = body.description;
    }
  }
  if (typeof body.privacy === "string") {
    if (body.privacy !== "public" && body.privacy !== "private") {
      return NextResponse.json(
        { error: "privacy must be 'public' or 'private'" },
        { status: 400 }
      );
    }
    update.privacy = body.privacy;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: "No editable fields supplied" },
      { status: 400 }
    );
  }

  // Pre-check: admin/owner/moderator only. RLS UPDATE on
  // community_groups already enforces this, but a 403 here is friendlier
  // than the generic 0-row response RLS would produce.
  const [
    { data: callerMembership },
    { data: groupRow },
  ] = await Promise.all([
    auth.supabase
      .from("community_group_members")
      .select("role")
      .eq("group_id", groupId)
      .eq("user_id", auth.userId)
      .maybeSingle(),
    auth.supabase
      .from("community_groups")
      .select("owner_user_id")
      .eq("id", groupId)
      .maybeSingle(),
  ]);

  if (!groupRow) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  const isOwner = groupRow.owner_user_id === auth.userId;
  const isAdminOrMod =
    callerMembership?.role === "admin" ||
    callerMembership?.role === "moderator";

  if (!isOwner && !isAdminOrMod) {
    return NextResponse.json(
      { error: "Only group admins, moderators, or the owner can edit settings" },
      { status: 403 }
    );
  }

  const { data, error } = await auth.supabase
    .from("community_groups")
    .update(update)
    .eq("id", groupId)
    .select("id, name, slug, region, privacy, description")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { ok: true, group: data },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
