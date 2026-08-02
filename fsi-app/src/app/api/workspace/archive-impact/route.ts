import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase-service";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { resolveOrgIdFromUserId } from "@/lib/api/org";
import { withErrorCapture } from "@/lib/telemetry/capture-error";

// /api/workspace/archive-impact — the truthful pre-archive warning
// (dual-scope archive, migration 235).
//
// The archive dialog must tell the operator what a WORKSPACE archive will
// actually do before they do it: who is watching the item, who owns it, and
// whether it is CRITICAL. Those are facts about live rows, so they are read
// here rather than guessed client-side — a warning that says "this may affect
// others" when nobody is watching trains people to dismiss the warning, and a
// silent one when three people are watching is worse.
//
// It also returns whether THIS caller may archive for the workspace, so the
// dialog can present the workspace option as disabled-with-reason instead of
// letting the user compose a reason and then eat a 403. The role check here is
// advisory UI state; the ENFORCEMENT is the role gate in
// /api/workspace/overrides, which re-checks server-side on every write. Never
// treat this route as the gate.
//
// GET ?itemId=<legacy_id|uuid>

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WATCHER_NAME_CAP = 5;

async function handleGET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const itemId = (request.nextUrl.searchParams.get("itemId") || "").trim();
  if (!itemId) {
    return NextResponse.json({ error: "itemId is required" }, { status: 400 });
  }

  const supabase = getServiceSupabase();

  // Branch on the shape rather than composing a PostgREST .or() string from
  // caller input — an .or() filter built by interpolation is an injection
  // surface (a crafted itemId would add filter terms). .eq() parameterises.
  const itemQuery = supabase
    .from("intelligence_items")
    .select("id, legacy_id, title, priority, effective_priority");
  const { data: itemRow } = await (UUID_RE.test(itemId)
    ? itemQuery.eq("id", itemId)
    : itemQuery.eq("legacy_id", itemId)
  ).maybeSingle();

  if (!itemRow) {
    return NextResponse.json(
      { error: `intelligence_items row not found for itemId=${itemId}` },
      { status: 404 }
    );
  }
  const intelItemId = itemRow.id as string;
  const legacyId = (itemRow.legacy_id as string | null) ?? null;

  const orgId = await resolveOrgIdFromUserId(supabase, auth.userId);

  // Caller's role — advisory only; the write path re-checks.
  let role: string | null = null;
  if (orgId) {
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", auth.userId)
      .maybeSingle();
    role = (membership?.role as string | null) ?? null;
  }
  const canArchiveWorkspace = role === "owner" || role === "admin";

  // Watchers. user_watchlist.item_id is TEXT and may hold either the legacy_id
  // or the uuid (see the /api/watchlist header), so both are matched.
  const watchKeys = [intelItemId, ...(legacyId ? [legacyId] : [])];
  const { data: watchRows } = await supabase
    .from("user_watchlist")
    .select("user_id")
    .in("item_id", watchKeys);
  const watcherIds = Array.from(
    new Set((watchRows || []).map((w) => w.user_id as string))
  ).filter((id) => id !== auth.userId);

  // Current owner (org-scoped override) + whether the item is already archived
  // at either scope.
  let ownerUserId: string | null = null;
  let alreadyWorkspaceArchived = false;
  if (orgId) {
    const { data: override } = await supabase
      .from("workspace_item_overrides")
      .select("owner_user_id, is_archived, priority_override")
      .eq("org_id", orgId)
      .eq("item_id", intelItemId)
      .maybeSingle();
    ownerUserId = (override?.owner_user_id as string | null) ?? null;
    alreadyWorkspaceArchived = !!override?.is_archived;
    if (override?.priority_override) {
      (itemRow as Record<string, unknown>).effective_priority =
        override.priority_override;
    }
  }

  const { data: personalRow } = await supabase
    .from("user_item_state")
    .select("is_archived")
    .eq("user_id", auth.userId)
    .eq("item_id", intelItemId)
    .maybeSingle();

  // Display names for the watchers (capped) and the owner, in one lookup.
  const nameTargets = Array.from(
    new Set([...watcherIds.slice(0, WATCHER_NAME_CAP), ...(ownerUserId ? [ownerUserId] : [])])
  );
  const nameById = new Map<string, string>();
  if (nameTargets.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, display_name, email")
      .in("id", nameTargets);
    for (const p of profiles || []) {
      const row = p as {
        id: string;
        full_name?: string | null;
        display_name?: string | null;
        email?: string | null;
      };
      nameById.set(
        row.id,
        row.full_name || row.display_name || row.email || `${row.id.slice(0, 8)}…`
      );
    }
  }

  const priority =
    ((itemRow as Record<string, unknown>).effective_priority as string | null) ||
    ((itemRow as Record<string, unknown>).priority as string | null) ||
    null;

  return NextResponse.json(
    {
      itemId: intelItemId,
      title: (itemRow.title as string | null) ?? null,
      priority,
      isCritical: priority === "CRITICAL",
      role,
      canArchiveWorkspace,
      watcherCount: watcherIds.length,
      watcherNames: watcherIds
        .slice(0, WATCHER_NAME_CAP)
        .map((id) => nameById.get(id) || "A teammate"),
      ownerName: ownerUserId ? nameById.get(ownerUserId) || "A teammate" : null,
      alreadyWorkspaceArchived,
      alreadyPersonallyArchived: !!personalRow?.is_archived,
    },
    { headers: rateLimitHeaders(auth.userId) }
  );
}

export const GET = withErrorCapture("/api/workspace/archive-impact", handleGET);
