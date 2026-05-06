// /api/community/posts/[id]/reactions
//
// Reactions are NOT YET SUPPORTED. The community_post_reactions table
// does not exist in any applied migration (verified against 030 and
// 032). This endpoint is a placeholder that returns 501 Not Implemented
// until the reactions schema lands.
//
// Why ship the route now: the orchestrator and Post.tsx wire to this
// endpoint. Returning 501 is honest and lets the UI render a disabled
// reaction control with an explanatory tooltip rather than silently
// failing.
//
// When the reactions migration ships (Phase D), replace this body with
// a toggle implementation: SELECT existing reaction by (post_id,
// user_id, emoji) — DELETE if present, INSERT otherwise.

import { NextRequest, NextResponse } from "next/server";
import {
  requireCommunityAuth,
  isCommunityAuthError,
} from "@/lib/api/community-auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";

export async function POST(
  request: NextRequest,
  _: { params: Promise<{ id: string }> }
) {
  const auth = await requireCommunityAuth(request);
  if (isCommunityAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  return NextResponse.json(
    {
      error: "Reactions not yet supported",
      detail:
        "The community_post_reactions table is not in any applied migration. " +
        "Reactions ship with Phase D once the schema lands.",
    },
    { status: 501, headers: rateLimitHeaders(auth.userId) }
  );
}

export async function GET(
  request: NextRequest,
  _: { params: Promise<{ id: string }> }
) {
  const auth = await requireCommunityAuth(request);
  if (isCommunityAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  return NextResponse.json(
    { reactions: [] },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
