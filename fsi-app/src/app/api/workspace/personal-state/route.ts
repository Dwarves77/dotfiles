import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase-service";

import { revalidateTag } from "next/cache";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { resolveOrgIdFromUserId } from "@/lib/api/org";
import { withErrorCapture } from "@/lib/telemetry/capture-error";
import { APP_DATA_TAG } from "@/lib/data";

// /api/workspace/personal-state — the user_item_state WRITER + READER
// (dual-scope archive, migration 235).
//
// Scope split, per the operator ruling "archiving should be an option for group
// or individual":
//   - WORKSPACE archive  → workspace_item_overrides via /api/workspace/overrides.
//     Team-wide effect, so it carries the protection layers (admin/owner role
//     gate, required reason, attribution, watcher fan-out, ungated restore).
//   - PERSONAL archive   → user_item_state via THIS route. It hides the item for
//     the calling user only, so it is deliberately UNGATED: no role check, no
//     required reason, no notifications. A personal archive is not a team action
//     and must never read as one.
//
// Writes are always scoped to the authed caller's user_id — the route never
// accepts a user_id from the body, so one user can never write another's state.
// org_id is contextual metadata (nullable by schema); a resolution failure never
// blocks the write, mirroring /api/watchlist.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Resolve a UI-side identifier (legacy_id like "o3" OR a UUID) to the
// intelligence_items.id UUID. Returns null if not found.
async function resolveItemUuid(
  supabase: ReturnType<typeof getServiceSupabase>,
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

// GET /api/workspace/personal-state
// → { items: [{ itemId, legacyId, title, isArchived, archiveNote, archivedAt }] }
// The caller's personally-archived items, for the Archive settings surface.
async function handleGET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from("user_item_state")
    .select(
      "item_id, is_archived, archive_note, archived_at, intelligence_items(legacy_id, title)"
    )
    .eq("user_id", auth.userId)
    .eq("is_archived", true)
    .order("archived_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type Row = {
    item_id: string;
    is_archived: boolean;
    archive_note: string | null;
    archived_at: string | null;
    // PostgREST returns the embedded row as an object for a to-one FK, but the
    // generated shape widens to an array; normalise both.
    intelligence_items?:
      | { legacy_id: string | null; title: string | null }
      | { legacy_id: string | null; title: string | null }[]
      | null;
  };

  const items = ((data ?? []) as unknown as Row[]).map((r) => {
    const embedded = Array.isArray(r.intelligence_items)
      ? r.intelligence_items[0]
      : r.intelligence_items;
    return {
      itemId: r.item_id,
      legacyId: embedded?.legacy_id ?? null,
      title: embedded?.title ?? null,
      isArchived: r.is_archived,
      archiveNote: r.archive_note,
      archivedAt: r.archived_at,
    };
  });

  return NextResponse.json({ items }, { headers: rateLimitHeaders(auth.userId) });
}

// POST /api/workspace/personal-state
// Body: { itemId: string, isArchived: boolean, archiveNote?: string|null }
// Upserts (user_id, item_id) into user_item_state.
async function handlePOST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const supabase = getServiceSupabase();

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
  if (typeof body.isArchived !== "boolean") {
    return NextResponse.json(
      { error: "isArchived (boolean) is required" },
      { status: 400 }
    );
  }

  const intelItemId = await resolveItemUuid(supabase, itemId);
  if (!intelItemId) {
    return NextResponse.json(
      { error: `intelligence_items row not found for itemId=${itemId}` },
      { status: 404 }
    );
  }

  const orgId = await resolveOrgIdFromUserId(supabase, auth.userId).catch(() => null);

  const update: Record<string, unknown> = {
    user_id: auth.userId,
    org_id: orgId ?? null,
    item_id: intelItemId,
    is_archived: body.isArchived,
    archived_at: body.isArchived ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };
  // A note is optional on a personal archive and cleared on restore.
  if ("archiveNote" in body) {
    update.archive_note = body.isArchived
      ? typeof body.archiveNote === "string"
        ? body.archiveNote
        : null
      : null;
  } else if (!body.isArchived) {
    update.archive_note = null;
  }

  const { data, error } = await supabase
    .from("user_item_state")
    .upsert(update, { onConflict: "user_id,item_id" })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Same reasoning as /api/workspace/overrides: invalidate so the archive
  // applies on the next render rather than after the 60s TTL.
  revalidateTag(APP_DATA_TAG, "max");

  return NextResponse.json(
    { state: data },
    { headers: rateLimitHeaders(auth.userId) }
  );
}

// DELETE /api/workspace/personal-state
// Body: { itemId: string } — removes the caller's row entirely.
async function handleDELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const supabase = getServiceSupabase();

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
    .from("user_item_state")
    .delete()
    .eq("user_id", auth.userId)
    .eq("item_id", intelItemId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateTag(APP_DATA_TAG, "max");

  return NextResponse.json(
    { success: true },
    { headers: rateLimitHeaders(auth.userId) }
  );
}

// R0.2 first-party error tracking on a customer data route: capture thrown
// failures as error_events groups (mig 195), then rethrow — semantics unchanged.
export const GET = withErrorCapture("/api/workspace/personal-state", handleGET);
export const POST = withErrorCapture("/api/workspace/personal-state", handlePOST);
export const DELETE = withErrorCapture("/api/workspace/personal-state", handleDELETE);
