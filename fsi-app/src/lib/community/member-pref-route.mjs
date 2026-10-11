import { NextResponse } from "next/server";
import { isRefusal, requireCommunityRoute } from "../api/route-guard";
import { rateLimitHeaders } from "../api/rate-limit";
import { validateMemberPrefToggle } from "./group-member-prefs.mjs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Builds a PATCH handler for `/api/community/groups/[id]/<star|mute>` that toggles one self-only
 * boolean column on the caller's own `community_group_members` row.
 *
 * @param {"starred"|"muted"} field
 * @returns {(request: import("next/server").NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>}
 */
export function createMemberPrefTogglePatchHandler(field) {
  return async function PATCH(request, { params }) {
    const auth = await requireCommunityRoute(request);
    if (isRefusal(auth)) return auth;

    const { id: groupId } = await params;
    if (!groupId || !UUID_RE.test(groupId)) {
      return NextResponse.json({ error: "Valid group id required" }, { status: 400 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const validated = validateMemberPrefToggle(body, field);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const { data, error } = await auth.supabase
      .from("community_group_members")
      .update({ [field]: validated.value })
      .eq("group_id", groupId)
      .eq("user_id", auth.userId)
      .select("group_id")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json(
        { error: "You are not a member of this group" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { ok: true, [field]: validated.value },
      { headers: rateLimitHeaders(auth.userId) }
    );
  };
}
