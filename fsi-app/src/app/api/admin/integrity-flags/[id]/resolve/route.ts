import { NextRequest, NextResponse } from "next/server";
import { isRefusal, requireAdminRoute } from "@/lib/api/route-guard";
import { rateLimitHeaders } from "@/lib/api/rate-limit";

type ResolveAction = "replace_url" | "regenerate" | "mark_resolved";

interface ResolveBody {
  action: ResolveAction;
  note?: string;
  newSourceUrl?: string;
}

// The platform-admin gate used to be a local `requireAdminRole` re-implementing the
// profiles.is_platform_admin check; `requireAdminRoute` (route-guard.ts) now does this once for
// every admin route (lane L31, 2026-09-17) and is the gate actually called below.

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminRoute(request);
  if (isRefusal(auth)) return auth;
  const { supabase } = auth;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "intelligence_items id required" }, { status: 400 });
  }

  let body: ResolveBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validActions: ResolveAction[] = ["replace_url", "regenerate", "mark_resolved"];
  if (!body.action || !validActions.includes(body.action)) {
    return NextResponse.json(
      { error: `action must be one of: ${validActions.join(", ")}` },
      { status: 400 }
    );
  }
  if (body.action === "replace_url" && !body.newSourceUrl) {
    return NextResponse.json(
      { error: "newSourceUrl is required for action=replace_url" },
      { status: 400 }
    );
  }

  // Load the item so we can confirm it's actually flagged + log the prior
  // source URL into the audit trail.
  const { data: item, error: loadErr } = await supabase
    .from("intelligence_items")
    .select("id, title, source_url, agent_integrity_flag, agent_integrity_phrase")
    .eq("id", id)
    .maybeSingle();

  if (loadErr || !item) {
    return NextResponse.json({ error: "Intelligence item not found" }, { status: 404 });
  }
  if (!item.agent_integrity_flag) {
    return NextResponse.json(
      { error: "Item is not flagged. Nothing to resolve." },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {
    agent_integrity_resolved_at: now,
    agent_integrity_resolved_by: auth.userId,
  };

  // For replace_url, we update the source_url in the same write so the next
  // regeneration (manual or scheduled) hits the corrected source. The
  // BEFORE trigger only fires on full_brief changes, so changing source_url
  // alone won't recompute the flag — that's intentional. The flag is a
  // statement about the brief content, not the URL.
  if (body.action === "replace_url" && body.newSourceUrl) {
    updates.source_url = body.newSourceUrl;
  }

  const { error: updateErr } = await supabase
    .from("intelligence_items")
    .update(updates)
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json(
      { error: `Failed to resolve flag: ${updateErr.message}` },
      { status: 500 }
    );
  }

  // Console-log audit entry. Keep the format greppable so the eventual
  // audit_log migration can backfill from log archives if needed.
  console.log(
    `[integrity-flag/resolve] item=${id} action=${body.action} ` +
      `admin=${auth.userId} prior_url=${item.source_url || "(null)"} ` +
      `phrase="${item.agent_integrity_phrase || ""}" ` +
      `new_url=${body.newSourceUrl || "(unchanged)"} ` +
      `note=${JSON.stringify(body.note || "")}`
  );

  return NextResponse.json(
    {
      success: true,
      itemId: id,
      action: body.action,
      resolvedAt: now,
    },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
