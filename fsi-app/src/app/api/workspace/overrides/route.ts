import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { revalidateTag } from "next/cache";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { resolveOrgIdFromUserId } from "@/lib/api/org";
import { APP_DATA_TAG } from "@/lib/data";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Resolve a UI-side identifier (legacy_id like "o3" OR a UUID) to the
// intelligence_items.id UUID. Returns null if not found.
async function resolveItemUuid(
  supabase: ReturnType<typeof getServiceClient>,
  itemId: string
): Promise<string | null> {
  if (UUID_RE.test(itemId)) return itemId;
  const { data } = await supabase
    .from("intelligence_items")
    .select("id")
    .eq("legacy_id", itemId)
    .maybeSingle();
  return data?.id ?? null;
}

// POST /api/workspace/overrides
// Body: { itemId: string, priorityOverride?: string|null, isArchived?: boolean,
//         archiveReason?: string|null, archiveNote?: string|null, notes?: string }
// Upserts (org_id, item_id) into workspace_item_overrides.
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const supabase = getServiceClient();

  const orgId = await resolveOrgIdFromUserId(supabase, auth.userId);
  if (!orgId) {
    return NextResponse.json(
      { error: "User has no organization membership" },
      { status: 403 }
    );
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
    return NextResponse.json(
      { error: `intelligence_items row not found for itemId=${itemId}` },
      { status: 404 }
    );
  }

  const update: Record<string, unknown> = {
    org_id: orgId,
    item_id: intelItemId,
    updated_at: new Date().toISOString(),
  };
  if ("priorityOverride" in body) update.priority_override = body.priorityOverride;
  if ("isArchived" in body) {
    update.is_archived = body.isArchived;
    if (body.isArchived === true) {
      update.archived_at = new Date().toISOString();
    } else if (body.isArchived === false) {
      update.archived_at = null;
    }
  }
  if ("archiveReason" in body) update.archive_reason = body.archiveReason;
  if ("archiveNote" in body) update.archive_note = body.archiveNote;
  if ("notes" in body) update.notes = body.notes;

  const { data, error } = await supabase
    .from("workspace_item_overrides")
    .upsert(update, { onConflict: "org_id,item_id" })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Invalidate workspace data cache so the user sees their priority /
  // archive override applied on the next render — not after the 60s TTL.
  revalidateTag(APP_DATA_TAG, "max");

  return NextResponse.json(
    { override: data },
    { headers: rateLimitHeaders(auth.userId) }
  );
}

// DELETE /api/workspace/overrides
// Body: { itemId: string }
// Removes the (org_id, item_id) row entirely.
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const supabase = getServiceClient();

  const orgId = await resolveOrgIdFromUserId(supabase, auth.userId);
  if (!orgId) {
    return NextResponse.json(
      { error: "User has no organization membership" },
      { status: 403 }
    );
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
    return NextResponse.json(
      { error: `intelligence_items row not found for itemId=${itemId}` },
      { status: 404 }
    );
  }

  const { error } = await supabase
    .from("workspace_item_overrides")
    .delete()
    .eq("org_id", orgId)
    .eq("item_id", intelItemId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Invalidate workspace data cache — same reasoning as the POST path.
  revalidateTag(APP_DATA_TAG, "max");

  return NextResponse.json(
    { success: true },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
