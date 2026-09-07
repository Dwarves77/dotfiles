import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase-service";

import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { resolveOrgIdFromUserId } from "@/lib/api/org";
import { withErrorCapture } from "@/lib/telemetry/capture-error";
import { normalizeTagName, buildTagCountsMap, resolveItemUuid } from "@/lib/tags/server";
import type { WorkspaceTag } from "@/lib/tags/types";

// GET /api/workspace/tags — list the caller's workspace tags with live item
// counts (README "Workspace tags": the source for the + Tag popover and the
// list rail's facet group). Bounded reads (F38/F39): workspace_tags is
// capped at 500 (a workspace inventing more than 500 distinct tags is out
// of scope, matching the F38 registry's "bounded-by-design" pattern), and
// the item_workspace_tags count read is capped at 5000 links.
//
// Optional ?itemId=<legacy_id or uuid> also returns `appliedTagIds`: the
// tags already applied to that one item, so the + Tag popover can render
// a checkmark instead of a count next to an applied tag without a second
// round trip (R6).
async function handleGET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const supabase = getServiceSupabase();
  const orgId = await resolveOrgIdFromUserId(supabase, auth.userId);
  if (!orgId) {
    return NextResponse.json({ error: "User has no organization membership" }, { status: 403 });
  }

  const { data: tagRows, error: tagsErr } = await supabase
    .from("workspace_tags")
    .select("id, org_id, name, created_at")
    .eq("org_id", orgId)
    .order("name", { ascending: true })
    .limit(500); // fitness-allow: F38 (workspace tag inventory, bounded-by-design — a workspace does not invent 500+ distinct tags)

  if (tagsErr) {
    return NextResponse.json({ error: tagsErr.message }, { status: 500 });
  }

  const { data: linkRows, error: linksErr } = await supabase
    .from("item_workspace_tags")
    .select("tag_id")
    .eq("org_id", orgId)
    .limit(5000); // fitness-allow: F38 (workspace tag-application count, bounded-by-design per workspace)

  if (linksErr) {
    return NextResponse.json({ error: linksErr.message }, { status: 500 });
  }

  const counts = buildTagCountsMap((linkRows ?? []) as { tag_id: string }[]);

  const tags: WorkspaceTag[] = (tagRows ?? []).map((row) => ({
    id: row.id as string,
    orgId: row.org_id as string,
    name: row.name as string,
    itemCount: counts.get(row.id as string) ?? 0,
    createdAt: row.created_at as string,
  }));

  const rawItemId = request.nextUrl.searchParams.get("itemId");
  let appliedTagIds: string[] | undefined;
  if (rawItemId) {
    const intelItemId = await resolveItemUuid(supabase, rawItemId);
    if (intelItemId) {
      const { data: appliedRows, error: appliedErr } = await supabase
        .from("item_workspace_tags")
        .select("tag_id")
        .eq("org_id", orgId)
        .eq("intelligence_item_id", intelItemId)
        .limit(500); // fitness-allow: F38 (tags applied to one item, bounded-by-design)
      if (!appliedErr) {
        appliedTagIds = (appliedRows ?? []).map((r) => r.tag_id as string);
      }
    }
  }

  return NextResponse.json(
    { tags, ...(appliedTagIds ? { appliedTagIds } : {}) },
    { headers: rateLimitHeaders(auth.userId) }
  );
}

// POST /api/workspace/tags — create a tag for the caller's workspace.
// Body: { name: string }
// Name uniqueness (case-insensitive, per workspace) is enforced by the DB
// (workspace_tags_org_name_key_uidx, migration 313); a duplicate name
// returns the EXISTING tag rather than a 409, matching the popover's
// "type an existing name, it just applies" contract (R6: multi-select,
// stays open — creating something that already exists is not an error the
// operator wants surfaced to the user).
async function handlePOST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

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

  const name = normalizeTagName(body.name);
  if (!name) {
    return NextResponse.json({ error: "name is required (1-60 characters)" }, { status: 400 });
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("workspace_tags")
    .insert({ org_id: orgId, name, created_by: auth.userId })
    .select("id, org_id, name, created_at")
    .single();

  if (insertErr) {
    // Postgres unique_violation on workspace_tags_org_name_key_uidx: another
    // tag with the same case-insensitive name already exists in this org —
    // fetch and return it instead of erroring.
    if ((insertErr as { code?: string }).code === "23505") {
      const { data: existing, error: existingErr } = await supabase
        .from("workspace_tags")
        .select("id, org_id, name, created_at")
        .eq("org_id", orgId)
        .ilike("name", name)
        .maybeSingle();
      if (existingErr || !existing) {
        return NextResponse.json({ error: insertErr.message }, { status: 500 });
      }
      const tag: WorkspaceTag = {
        id: existing.id as string,
        orgId: existing.org_id as string,
        name: existing.name as string,
        itemCount: 0,
        createdAt: existing.created_at as string,
      };
      return NextResponse.json({ tag, existed: true }, { headers: rateLimitHeaders(auth.userId) });
    }
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  const tag: WorkspaceTag = {
    id: inserted.id as string,
    orgId: inserted.org_id as string,
    name: inserted.name as string,
    itemCount: 0,
    createdAt: inserted.created_at as string,
  };

  return NextResponse.json({ tag }, { headers: rateLimitHeaders(auth.userId) });
}

// DELETE /api/workspace/tags — remove a tag from the caller's workspace.
// Body: { tagId: string }
// CASCADE (migration 313) removes its item_workspace_tags links in the same
// statement — never a soft-hide, so facet counts stay truthful.
async function handleDELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

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

  const tagId = typeof body.tagId === "string" ? body.tagId : null;
  if (!tagId) {
    return NextResponse.json({ error: "tagId is required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("workspace_tags")
    .delete()
    .eq("id", tagId)
    .eq("org_id", orgId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { headers: rateLimitHeaders(auth.userId) });
}

export const GET = withErrorCapture("/api/workspace/tags", handleGET);
export const POST = withErrorCapture("/api/workspace/tags", handlePOST);
export const DELETE = withErrorCapture("/api/workspace/tags", handleDELETE);
