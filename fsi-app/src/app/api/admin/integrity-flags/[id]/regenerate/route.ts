// POST /api/admin/integrity-flags/[id]/regenerate
//
// Queue a brief regeneration for a flagged intelligence_items row by
// calling /api/agent/run for its source_url.
//
// Wave-α A4 (2026-07-11, CODE-3 F-02 + F-04): /api/agent/run is ASYNC —
// it start()s the durable workflow and returns 202 {runId} immediately.
// The previous implementation treated the 202 as "agent finished",
// immediately re-read the flag (still true — the workflow hadn't run) and
// reported regenerated:true/stillFlagged:true on every call; worse, the
// re-read dropped `error`, so a transient read failure made
// stillFlagged=false and AUTO-RESOLVED a flag whose brief may still be
// flagged (the error-swallow-with-write class, F-04). The auto-resolve
// path is REMOVED: this route now defers honestly — it queues the
// workflow and returns the runId with the flag explicitly preserved.
// Resolution stays with the operator (mark_resolved / replace_url on the
// /resolve endpoint) after the regenerated brief is inspected; the
// migration-035 trigger only ever flips the flag TRUE, never resolves it.
//
// Note: each regenerate is one explicit admin action — there's no batch
// auto-regenerate, by spec. The /admin/integrity-flags sub-tab calls this
// endpoint per-row.
//
// Auth: requireAuth + admin role check. Rate-limited.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase-service";

import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { isPlatformAdmin } from "@/lib/auth/admin";


// Platform-admin gate via profiles.is_platform_admin (OBS-17, Sprint 2 Build 6).
async function requireAdminRole(
  supabase: ReturnType<typeof getServiceSupabase>,
  userId: string
): Promise<NextResponse | null> {
  const admin = await isPlatformAdmin(userId, supabase);
  if (!admin) {
    return NextResponse.json(
      { error: "Platform admin access required" },
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

  const supabase = getServiceSupabase();
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

  let agentResp: Response;
  try {
    agentResp = await fetch(`${baseUrl}/api/agent/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify({ sourceUrl: item.source_url }),
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

  // Per-item cooldown from the agent route — pass through honestly.
  if (agentResp.status === 429) {
    return NextResponse.json(
      {
        success: false,
        error:
          agentPayload?.hint ||
          "An agent run for this item ran within the last hour.",
        flagPreserved: true,
      },
      { status: 429, headers: rateLimitHeaders(auth.userId) }
    );
  }

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

  // 200 {skipped: "already_verified"} — the agent route refuses to
  // regenerate a verified item without an explicit refresh. Nothing was
  // regenerated; the flag stays for operator triage.
  if (agentPayload?.skipped === "already_verified") {
    return NextResponse.json(
      {
        success: true,
        queued: false,
        skipped: "already_verified",
        flagPreserved: true,
        message:
          "Item is already verified — nothing regenerated. Resolve or replace_url via the resolve endpoint.",
      },
      { headers: rateLimitHeaders(auth.userId) }
    );
  }

  // 202 {runId} — regeneration queued as a durable workflow. The flag is
  // deliberately PRESERVED: whether the fresh brief clears the migration-035
  // trigger is unknowable until the workflow completes, and resolving now
  // would fabricate an outcome. The operator re-checks the queue (or the
  // item) after completion and resolves via the /resolve endpoint.
  console.log(
    `[integrity-flag/regenerate] item=${id} queued run=${agentPayload?.runId ?? "?"} admin=${auth.userId}`
  );
  return NextResponse.json(
    {
      success: true,
      queued: true,
      runId: agentPayload?.runId ?? null,
      flagPreserved: true,
      message:
        "Regeneration queued as a durable workflow. Re-check this flag after the run completes; resolution stays manual.",
    },
    { status: 202, headers: rateLimitHeaders(auth.userId) }
  );
}
