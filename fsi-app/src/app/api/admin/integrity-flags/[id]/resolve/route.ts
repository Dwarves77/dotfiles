// POST /api/admin/integrity-flags/[id]/resolve
//
// Resolve a single agent-integrity flag on an intelligence_items row.
// Marks agent_integrity_resolved_at = NOW() and records the resolving
// admin via agent_integrity_resolved_by. The trigger from migration 035
// only manages the flag/phrase/flagged_at columns; the resolution columns
// are owned exclusively by this endpoint, so the trigger doesn't fight us.
//
// Body:
//   {
//     action: "replace_url" | "regenerate" | "mark_resolved",
//     note?: string,
//     newSourceUrl?: string  // required only for action=replace_url
//   }
//
// Audit: per-task spec, the note + action are written to console.log. We
// chose console-log over a new staged_updates row for two reasons:
//   1. staged_updates is shaped for content proposals (proposed_changes
//      JSONB, status approval flow). A flag-resolution event doesn't fit
//      that schema cleanly, so reusing it would require a freshly-typed
//      update_type and shoehorned columns.
//   2. The platform doesn't yet have a generic admin_audit_log table. A
//      proper audit row should land with the W4 audit_log surface, at
//      which point this handler can be promoted from console.log to a
//      typed insert. For now console.log preserves the trail in Vercel
//      function logs.
//
// Auth: requireAuth + admin role check. Rate-limited.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";

type ResolveAction = "replace_url" | "regenerate" | "mark_resolved";

interface ResolveBody {
  action: ResolveAction;
  note?: string;
  newSourceUrl?: string;
}

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function requireAdminRole(
  supabase: ReturnType<typeof getServiceClient>,
  userId: string
): Promise<NextResponse | null> {
  const { data: membership } = await supabase
    .from("org_memberships")
    .select("role")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const role = membership?.role;
  if (role !== "owner" && role !== "admin") {
    return NextResponse.json(
      { error: "Admin role required" },
      { status: 403 }
    );
  }
  return null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const supabase = getServiceClient();
  const denied = await requireAdminRole(supabase, auth.userId);
  if (denied) return denied;

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
