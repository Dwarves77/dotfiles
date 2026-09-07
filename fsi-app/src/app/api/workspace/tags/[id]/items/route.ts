import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase-service";

import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { resolveOrgIdFromUserId } from "@/lib/api/org";
import { withErrorCapture } from "@/lib/telemetry/capture-error";
import { resolveItemUuid } from "@/lib/tags/server";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// PUT /api/workspace/tags/[id]/items — apply a tag to one intelligence_item.
// Body: { itemId: string }  (legacy_id like "o3" OR a UUID, resolved same as
// /api/workspace/overrides). Upserts the (tag_id, intelligence_item_id) row
// — applying twice is a no-op, not an error (matches the popover's
// multi-select-stays-open behaviour).
async function handlePUT(request: NextRequest, context: RouteContext) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const { id: tagId } = await context.params;
  const supabase = getServiceSupabase();
  const orgId = await resolveOrgIdFromUserId(supabase, auth.userId);
  if (!orgId) {
    return NextResponse.json({ error: "User has no organization membership" }, { status: 403 });
  }

  // The tag must belong to the caller's org — never apply another
  // workspace's tag via a guessed id.
  const { data: tagRow, error: tagErr } = await supabase
    .from("workspace_tags")
    .select("id")
    .eq("id", tagId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (tagErr) {
    return NextResponse.json({ error: tagErr.message }, { status: 500 });
  }
  if (!tagRow) {
    return NextResponse.json({ error: "Tag not found in your workspace" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const itemId = typeof body.itemId === "string" ? body.itemId : null;
  if (!itemId) {
    return NextResponse.json({ error: "itemId is required" }, { status: 400 });
  }

  const intelItemId = await resolveItemUuid(supabase, itemId);
  if (!intelItemId) {
    return NextResponse.json({ error: `intelligence_items row not found for itemId=${itemId}` }, { status: 404 });
  }

  const { error } = await supabase
    .from("item_workspace_tags")
    .upsert(
      { tag_id: tagId, intelligence_item_id: intelItemId, org_id: orgId, created_by: auth.userId },
      { onConflict: "tag_id,intelligence_item_id" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { headers: rateLimitHeaders(auth.userId) });
}

// DELETE /api/workspace/tags/[id]/items — remove a tag from one item.
// Body: { itemId: string }
async function handleDELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const { id: tagId } = await context.params;
  const supabase = getServiceSupabase();
  const orgId = await resolveOrgIdFromUserId(supabase, auth.userId);
  if (!orgId) {
    return NextResponse.json({ error: "User has no organization membership" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const itemId = typeof body.itemId === "string" ? body.itemId : null;
  if (!itemId) {
    return NextResponse.json({ error: "itemId is required" }, { status: 400 });
  }

  const intelItemId = await resolveItemUuid(supabase, itemId);
  if (!intelItemId) {
    return NextResponse.json({ error: `intelligence_items row not found for itemId=${itemId}` }, { status: 404 });
  }

  const { error } = await supabase
    .from("item_workspace_tags")
    .delete()
    .eq("tag_id", tagId)
    .eq("intelligence_item_id", intelItemId)
    .eq("org_id", orgId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { headers: rateLimitHeaders(auth.userId) });
}

export const PUT = withErrorCapture("/api/workspace/tags/[id]/items", handlePUT);
export const DELETE = withErrorCapture("/api/workspace/tags/[id]/items", handleDELETE);
