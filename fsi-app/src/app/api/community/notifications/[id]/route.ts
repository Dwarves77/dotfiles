import { NextRequest, NextResponse } from "next/server";
import { isRefusal, requireCommunityRoute } from "@/lib/api/route-guard";
import { rateLimitHeaders } from "@/lib/api/rate-limit";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCommunityRoute(request);
  if (isRefusal(auth)) return auth;

  const { id } = await params;
  if (!id) {
    return NextResponse.json(
      { error: "notification id required" },
      { status: 400 }
    );
  }

  const { data, error } = await auth.supabase
    .from("notifications")
    .select("id, kind, payload, read_at, created_at")
    .eq("id", id)
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    // RLS hides other users' rows, so this is the right shape — caller
    // either owns nothing with this id, or the id is bogus.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(
    { notification: data },
    { headers: rateLimitHeaders(auth.userId) }
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCommunityRoute(request);
  if (isRefusal(auth)) return auth;

  const { id } = await params;
  if (!id) {
    return NextResponse.json(
      { error: "notification id required" },
      { status: 400 }
    );
  }

  let body: { action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (body.action !== "mark_read" && body.action !== "mark_unread") {
    return NextResponse.json(
      { error: "action must be 'mark_read' or 'mark_unread'" },
      { status: 400 }
    );
  }

  const newReadAt =
    body.action === "mark_read" ? new Date().toISOString() : null;

  const { data, error } = await auth.supabase
    .from("notifications")
    .update({ read_at: newReadAt })
    .eq("id", id)
    .eq("user_id", auth.userId)
    .select("id, kind, payload, read_at, created_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(
    { ok: true, notification: data },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
