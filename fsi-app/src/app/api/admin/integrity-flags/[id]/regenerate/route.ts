// POST /api/admin/integrity-flags/[id]/regenerate
//
// Regenerate the brief for a flagged intelligence_items row by calling
// /api/agent/run for its source_url. On success, automatically resolves
// the flag (sets agent_integrity_resolved_at + agent_integrity_resolved_by).
// On failure, leaves the flag in place and surfaces the agent error so
// the operator can decide whether to replace_url or mark_resolved.
//
// Note: each regenerate is one explicit admin action — there's no batch
// auto-regenerate, by spec. The /admin/integrity-flags sub-tab calls this
// endpoint per-row.
//
// Re-flagging behavior: the agent /run handler updates intelligence_items.
// full_brief, which fires the BEFORE trigger from migration 035. If the
// fresh brief still contains an integrity phrase, agent_integrity_flag
// flips back to TRUE, agent_integrity_phrase is updated, and
// agent_integrity_flagged_at is overwritten with the new detection time
// (only on the FALSE→TRUE edge — see the trigger function). Auto-resolve
// then writes resolved_at, but the flag is TRUE, so the row is paradoxically
// "resolved but flagged". To prevent that, we re-read the row after agent
// completion and skip resolve when the flag is still true.
//
// Auth: requireAuth + admin role check. Rate-limited.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";

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

  // Confirm this row is actually flagged before spending an agent call.
  const { data: item, error: loadErr } = await supabase
    .from("intelligence_items")
    .select("id, title, source_url, agent_integrity_flag")
    .eq("id", id)
    .maybeSingle();

  if (loadErr || !item) {
    return NextResponse.json({ error: "Intelligence item not found" }, { status: 404 });
  }
  if (!item.agent_integrity_flag) {
    return NextResponse.json(
      { error: "Item is not flagged. Nothing to regenerate." },
      { status: 409 }
    );
  }
  if (!item.source_url) {
    return NextResponse.json(
      { error: "Item has no source_url. Use replace_url first, then regenerate." },
      { status: 422 }
    );
  }

  // Forward the caller's auth token so /api/agent/run sees the same admin
  // user. Same-origin server-to-server fetch — APP_URL fallback to derive
  // the base URL from the incoming request when not set. Mirror of the
  // pattern used by /api/admin/sources/[id]/regenerate-brief.
  const baseUrl = process.env.APP_URL || new URL(request.url).origin;
  const authHeader = request.headers.get("authorization") || "";
  const startedAt = Date.now();

  let agentResp: Response;
  try {
    agentResp = await fetch(`${baseUrl}/api/agent/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify({ sourceUrl: item.source_url, bypassPause: true }),
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        success: false,
        error: `Agent fetch failed: ${e.message}`,
        flagPreserved: true,
      },
      { status: 502, headers: rateLimitHeaders(auth.userId) }
    );
  }

  const agentPayload = await agentResp.json().catch(() => ({}));
  if (!agentResp.ok) {
    return NextResponse.json(
      {
        success: false,
        error: agentPayload?.error || `Agent returned ${agentResp.status}`,
        agentStatus: agentResp.status,
        flagPreserved: true,
      },
      { status: 502, headers: rateLimitHeaders(auth.userId) }
    );
  }

  // Agent succeeded — re-read the row to see whether the new brief tripped
  // the integrity trigger again. If it did, we leave the flag in place and
  // hand back a partial-success payload so the operator can intervene.
  const { data: refreshed } = await supabase
    .from("intelligence_items")
    .select("agent_integrity_flag, agent_integrity_phrase")
    .eq("id", id)
    .maybeSingle();

  const stillFlagged = !!refreshed?.agent_integrity_flag;

  if (stillFlagged) {
    console.log(
      `[integrity-flag/regenerate] item=${id} regen=ok still_flagged=true ` +
        `phrase="${refreshed?.agent_integrity_phrase || ""}" admin=${auth.userId}`
    );
    return NextResponse.json(
      {
        success: true,
        regenerated: true,
        autoResolved: false,
        stillFlagged: true,
        phrase: refreshed?.agent_integrity_phrase || null,
        durationMs: Date.now() - startedAt,
      },
      { headers: rateLimitHeaders(auth.userId) }
    );
  }

  // Brief no longer contains an integrity phrase — auto-resolve.
  const now = new Date().toISOString();
  const { error: resolveErr } = await supabase
    .from("intelligence_items")
    .update({
      agent_integrity_resolved_at: now,
      agent_integrity_resolved_by: auth.userId,
    })
    .eq("id", id);

  if (resolveErr) {
    // Brief was rewritten cleanly but resolution write failed. Surface so
    // the operator can mark_resolved manually.
    console.warn(
      `[integrity-flag/regenerate] item=${id} regen=ok resolve_failed: ${resolveErr.message}`
    );
    return NextResponse.json(
      {
        success: true,
        regenerated: true,
        autoResolved: false,
        stillFlagged: false,
        resolveError: resolveErr.message,
        durationMs: Date.now() - startedAt,
      },
      { headers: rateLimitHeaders(auth.userId) }
    );
  }

  console.log(
    `[integrity-flag/regenerate] item=${id} regen=ok auto_resolved=true admin=${auth.userId}`
  );

  return NextResponse.json(
    {
      success: true,
      regenerated: true,
      autoResolved: true,
      resolvedAt: now,
      durationMs: Date.now() - startedAt,
    },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
