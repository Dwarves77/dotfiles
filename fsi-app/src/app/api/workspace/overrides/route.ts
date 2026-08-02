import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase-service";

import { revalidateTag } from "next/cache";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { resolveOrgIdFromUserId } from "@/lib/api/org";
import { withErrorCapture } from "@/lib/telemetry/capture-error";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import { APP_DATA_TAG } from "@/lib/data";


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

// POST /api/workspace/overrides
// Body: { itemId: string, priorityOverride?: string|null, isArchived?: boolean,
//         archiveReason?: string|null, archiveNote?: string|null, notes?: string,
//         ownerUserId?: string|null }
// Upserts (org_id, item_id) into workspace_item_overrides.
async function handlePOST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const supabase = getServiceSupabase();

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
  // Dual-scope archive (migration 235): a WORKSPACE archive is the team-wide
  // hide, so it carries the operator-approved protection layers at the API:
  //  - ROLE GATE: only admin/owner may archive for the whole workspace
  //    (fail-closed on an unverifiable role lookup). RESTORE is ungated —
  //    any member can undo a team archive (the recovery layer).
  //  - REASON REQUIRED: a workspace archive without archiveReason is a 400.
  //  - ATTRIBUTION: archived_by stamps who did it; cleared on restore.
  // Personal archive lives in user_item_state (/api/workspace/personal-state),
  // not here.
  if (body.isArchived === true) {
    const reason = typeof body.archiveReason === "string" ? body.archiveReason.trim() : "";
    if (!reason) {
      return NextResponse.json(
        { error: "archiveReason is required to archive for the workspace" },
        { status: 400 }
      );
    }
    const { data: callerMembership, error: roleErr } = await supabase
      .from("org_memberships")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", auth.userId)
      .maybeSingle();
    if (roleErr) {
      return NextResponse.json({ error: roleErr.message }, { status: 500 });
    }
    const role = callerMembership?.role;
    if (role !== "owner" && role !== "admin") {
      return NextResponse.json(
        { error: "Workspace archive requires the admin or owner role. You can archive it just for yourself instead." },
        { status: 403 }
      );
    }
    update.archived_by = auth.userId;
  } else if (body.isArchived === false) {
    update.archived_by = null;
  }
  // Sprint 3 follow-up Part 2 (migration 111): dismissed_at.
  // Distinct from archived_at; "dismissed" hides the regulation from the
  // active Kanban view and surfaces it in the bottom stash drawer with a
  // Restore action. Caller passes ISO string to dismiss, null to restore.
  if ("dismissedAt" in body) {
    update.dismissed_at = body.dismissedAt;
  } else if (body.dismiss === true) {
    update.dismissed_at = new Date().toISOString();
  } else if (body.dismiss === false) {
    update.dismissed_at = null;
  }
  // Phase 1 ownership (migration 234): org-scoped assignee. null clears.
  // Guard: the assignee must hold a membership in the CALLER'S org — assignment
  // outside the company group is refused, and an unverifiable membership lookup
  // fails closed (500), never silently through.
  if ("ownerUserId" in body) {
    const ownerUserId =
      typeof body.ownerUserId === "string" && body.ownerUserId ? body.ownerUserId : null;
    if (ownerUserId !== null) {
      if (!UUID_RE.test(ownerUserId)) {
        return NextResponse.json({ error: "ownerUserId must be a UUID or null" }, { status: 400 });
      }
      const { data: assigneeMembership, error: membershipErr } = await supabase
        .from("org_memberships")
        .select("id")
        .eq("org_id", orgId)
        .eq("user_id", ownerUserId)
        .maybeSingle();
      if (membershipErr) {
        return NextResponse.json({ error: membershipErr.message }, { status: 500 });
      }
      if (!assigneeMembership) {
        return NextResponse.json(
          { error: "Assignee is not a member of your organization" },
          { status: 403 }
        );
      }
    }
    update.owner_user_id = ownerUserId;
    update.owner_assigned_by = ownerUserId === null ? null : auth.userId;
    update.owner_assigned_at = ownerUserId === null ? null : new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("workspace_item_overrides")
    .upsert(update, { onConflict: "org_id,item_id" })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Dual-scope archive (migration 235), notification layer: a successful
  // WORKSPACE archive fans out to everyone with a stake in the item — its
  // watchers (user_watchlist) and its assigned owner — excluding the
  // archiver. Failures log and never abort the archive (dispatch helper
  // contract).
  if (body.isArchived === true) {
    try {
      const recipients = new Set<string>();
      const { data: watchers } = await supabase
        .from("user_watchlist")
        .select("user_id")
        .in("item_id", [itemId, intelItemId]);
      for (const w of watchers || []) recipients.add(w.user_id as string);
      const ownerId = (data as { owner_user_id?: string | null } | null)?.owner_user_id;
      if (ownerId) recipients.add(ownerId);
      recipients.delete(auth.userId);
      if (recipients.size > 0) {
        const { data: itemRow } = await supabase
          .from("intelligence_items")
          .select("title, legacy_id")
          .eq("id", intelItemId)
          .maybeSingle();
        const title = itemRow?.title || "an item";
        const uiId = itemRow?.legacy_id || intelItemId;
        const reason = typeof body.archiveReason === "string" ? body.archiveReason : "";
        for (const userId of recipients) {
          const err = await dispatchNotification({
            userId,
            kind: "archive",
            payload: {
              title: "Item archived for the workspace",
              body: `"${title}" was archived for your whole workspace${reason ? ` — reason: ${reason}` : ""}. Any member can restore it from Settings → Archive.`,
              link: `/regulations/${encodeURIComponent(uiId)}`,
              item_id: intelItemId,
              archived_by: auth.userId,
            },
          });
          if (err) console.warn("[overrides] archive notification failed:", err);
        }
      }
    } catch (e) {
      console.warn("[overrides] archive notification fan-out failed:", e);
    }
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
async function handleDELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const supabase = getServiceSupabase();

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

// R0.2 first-party error tracking on a customer data route: capture thrown
// failures as error_events groups (mig 195), then rethrow — semantics
// unchanged.
export const POST = withErrorCapture("/api/workspace/overrides", handlePOST);
export const DELETE = withErrorCapture("/api/workspace/overrides", handleDELETE);
