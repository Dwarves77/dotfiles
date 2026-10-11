import { NextRequest, NextResponse } from "next/server";
import { isRefusal, requireCommunityRoute } from "@/lib/api/route-guard";
import { rateLimitHeaders } from "@/lib/api/rate-limit";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface SignoffRow {
  id: string;
  post_id: string;
  requested_by: string;
  status: string;
  verifier_id: string | null;
  primary_doc_url: string | null;
  decision_note: string | null;
  created_at: string;
  decided_at: string | null;
}

const SELECT_COLS =
  "id, post_id, requested_by, status, verifier_id, primary_doc_url, decision_note, created_at, decided_at";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCommunityRoute(request);
  if (isRefusal(auth)) return auth;

  const { id: postId } = await params;
  if (!postId || !UUID_RE.test(postId)) {
    return NextResponse.json({ error: "Valid post id required" }, { status: 400 });
  }

  // Insert the request. RLS (signoff_insert) enforces group membership +
  // requested_by = caller; the partial unique index enforces one-open-per-post.
  const { data: inserted, error: insErr } = await auth.supabase
    .from("community_post_signoff_requests")
    .insert({ post_id: postId, requested_by: auth.userId, status: "pending" })
    .select(SELECT_COLS)
    .maybeSingle();

  if (insErr) {
    // Partial unique index violation -> a request is already open for this post.
    if (insErr.code === "23505") {
      return NextResponse.json(
        {
          error:
            "A verifier sign-off request is already open for this post.",
          code: "already_open",
        },
        { status: 409, headers: rateLimitHeaders(auth.userId) }
      );
    }
    // RLS rejection (not a group member).
    if (insErr.code === "42501" || insErr.code === "PGRST301") {
      return NextResponse.json(
        { error: "Only members of this room may request sign-off." },
        { status: 403 }
      );
    }
    // Post does not exist (FK violation).
    if (insErr.code === "23503") {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  if (!inserted) {
    // No error but no row => RLS with_check rejected the write.
    return NextResponse.json(
      { error: "Only members of this room may request sign-off." },
      { status: 403 }
    );
  }

  return NextResponse.json(
    { request: inserted as SignoffRow },
    { status: 201, headers: rateLimitHeaders(auth.userId) }
  );
}
