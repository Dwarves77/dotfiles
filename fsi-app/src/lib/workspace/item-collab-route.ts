// The ONE route preamble for the workspace item notes and assignments routes (lane S8-A, 2026-10-07).
// /api/workspace/items/[id]/notes and /assignments differ only in their handlers (item-notes.mjs,
// item-assignments.mjs); everything before the handler is identical and lives here:
//   1. Bearer auth + the 60/min/user rate limit (requireUserRoute, the guard every workspace route uses).
//   2. The caller's org and ROLE, resolved server-side from org_memberships (never from the request): no
//      membership is a 403, same as the other workspace routes.
//   3. The item, by legacy_id or uuid (the id the detail page URL carries), verified items only, the customer
//      read gate. An item that does not exist or is not verified is a 404.
// The handlers then run with { supabase, notify } and a ctx, and their { status, body } is returned with the
// rate-limit headers. Route files export only handlers (F34).
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase-service";
import { isRefusal, requireUserRoute } from "@/lib/api/route-guard";
import { rateLimitHeaders } from "@/lib/api/rate-limit";
import { resolveOrgMembershipFromUserId } from "@/lib/api/org";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import { isItemUuid } from "@/lib/detail/id-redirect";

export interface CollabRouteContext {
  params: Promise<{ id: string }>;
}

export interface CollabItem {
  id: string;
  legacyId: string | null;
  title: string | null;
  type: string | null;
  domain: number | null;
}

export interface CollabCtx {
  userId: string;
  orgId: string;
  role: string;
  item: CollabItem;
}

export interface CollabDeps {
  supabase: ReturnType<typeof getServiceSupabase>;
  notify: typeof dispatchNotification;
}

export interface CollabResult {
  status: number;
  body: unknown;
}

/** The request's JSON object body, or null when it is missing, malformed or not an object. */
export async function readJsonObject(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function runCollab(
  request: NextRequest,
  context: CollabRouteContext,
  run: (deps: CollabDeps, ctx: CollabCtx) => Promise<CollabResult>,
): Promise<NextResponse> {
  const auth = await requireUserRoute(request);
  if (isRefusal(auth)) return auth;

  const supabase = getServiceSupabase();
  const membership = await resolveOrgMembershipFromUserId(supabase, auth.userId);
  if (!membership) {
    return NextResponse.json({ error: "User has no organization membership" }, { status: 403 });
  }

  const { id: rawId } = await context.params;
  const itemKey = decodeURIComponent(rawId);
  const { data: item, error: itemErr } = await supabase
    .from("intelligence_items")
    .select("id, legacy_id, title, item_type, domain")
    .eq(isItemUuid(itemKey) ? "id" : "legacy_id", itemKey)
    .eq("provenance_status", "verified")
    .maybeSingle();
  if (itemErr) {
    return NextResponse.json({ error: itemErr.message }, { status: 500 });
  }
  if (!item) {
    return NextResponse.json({ error: "That item was not found." }, { status: 404 });
  }

  const result = await run(
    { supabase, notify: dispatchNotification },
    {
      userId: auth.userId,
      orgId: membership.orgId,
      role: membership.role,
      item: {
        id: item.id as string,
        legacyId: (item.legacy_id as string | null) ?? null,
        title: (item.title as string | null) ?? null,
        type: (item.item_type as string | null) ?? null,
        domain: (item.domain as number | null) ?? null,
      },
    },
  );
  return NextResponse.json(result.body, { status: result.status, headers: rateLimitHeaders(auth.userId) });
}
