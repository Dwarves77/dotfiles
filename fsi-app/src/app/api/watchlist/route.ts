import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { revalidateTag } from "next/cache";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { resolveOrgIdFromUserId } from "@/lib/api/org";
import { APP_DATA_TAG } from "@/lib/data";

// /api/watchlist — the user_watchlist WRITER (chrome-audit S2-04, browser wave).
// Migration 060 shipped the table + RLS and fetchWatchlist/DashboardWatchlist shipped the READER,
// but no writer ever existed — the two detail-surface Watch buttons toggled local state and the
// widget could never leave its empty frame. This route completes the producer half. Writes are
// per-USER (user_id = the authed caller; org_id recorded for the org-scoped index), scoped by the
// service client to the caller's id — mirroring workspace/overrides, the canonical authed-write route.
// item_type mirrors the table CHECK ('source' | 'reg' | 'signal'); item_id is text by design
// (legacy_id or UUID — fetchWatchlist resolves titles for both).

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const ITEM_TYPES = new Set(["source", "reg", "signal"]);

function readParams(request: NextRequest): { itemType: string; itemId: string } | null {
  const itemType = request.nextUrl.searchParams.get("item_type") ?? "";
  const itemId = request.nextUrl.searchParams.get("item_id") ?? "";
  if (!ITEM_TYPES.has(itemType) || !itemId) return null;
  return { itemType, itemId };
}

// GET /api/watchlist?item_type=reg&item_id=<id> → { watched: boolean }
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;
  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;
  const p = readParams(request);
  if (!p) return NextResponse.json({ error: "item_type (source|reg|signal) and item_id are required" }, { status: 400 });
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("user_watchlist")
    .select("id")
    .eq("user_id", auth.userId)
    .eq("item_type", p.itemType)
    .eq("item_id", p.itemId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ watched: !!data }, { headers: rateLimitHeaders(auth.userId) });
}

// POST /api/watchlist  Body: { itemType: "source"|"reg"|"signal", itemId: string } → { watched: true }
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;
  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;
  let body: { itemType?: unknown; itemId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const itemType = typeof body.itemType === "string" ? body.itemType : "";
  const itemId = typeof body.itemId === "string" ? body.itemId.trim() : "";
  if (!ITEM_TYPES.has(itemType) || !itemId) {
    return NextResponse.json({ error: "itemType (source|reg|signal) and itemId are required" }, { status: 400 });
  }
  const supabase = getServiceClient();
  // org_id is contextual metadata (nullable by schema) — a resolution failure never blocks the watch.
  const orgId = await resolveOrgIdFromUserId(supabase, auth.userId).catch(() => null);
  const { error } = await supabase
    .from("user_watchlist")
    .upsert(
      { user_id: auth.userId, org_id: orgId ?? null, item_type: itemType, item_id: itemId },
      { onConflict: "user_id,item_type,item_id" }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidateTag(APP_DATA_TAG, "max");
  return NextResponse.json({ watched: true }, { headers: rateLimitHeaders(auth.userId) });
}

// DELETE /api/watchlist?item_type=reg&item_id=<id> → { watched: false }
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;
  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;
  const p = readParams(request);
  if (!p) return NextResponse.json({ error: "item_type (source|reg|signal) and item_id are required" }, { status: 400 });
  const supabase = getServiceClient();
  const { error } = await supabase
    .from("user_watchlist")
    .delete()
    .eq("user_id", auth.userId)
    .eq("item_type", p.itemType)
    .eq("item_id", p.itemId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidateTag(APP_DATA_TAG, "max");
  return NextResponse.json({ watched: false }, { headers: rateLimitHeaders(auth.userId) });
}
