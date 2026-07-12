// POST /api/admin/sources/[id]/regenerate-brief
//
// Manual on-demand brief regeneration for a single source, delegated to
// the durable generate-brief workflow via /api/agent/run.
//
// Wave-α A4 (2026-07-11, CODE-3 F-02): /api/agent/run is ASYNC — it
// start()s the workflow and returns 202 {runId} immediately. This caller
// previously assumed the pre-Sprint-4 synchronous contract: it read
// items_found/citations_written/etc. off the 202 body (always zeros) and
// read full_brief BEFORE the workflow ran, reporting the pre-regeneration
// length as the result. It also sent a dead `bypassPause` parameter the
// agent route never read. Now it defers honestly: it returns the runId
// and the operator polls agent_runs (or re-opens the source) after the
// workflow completes.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase-service";

import { requireAuth, isAuthError } from "@/lib/api/auth";
import { isPlatformAdmin } from "@/lib/auth/admin";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";


export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "source id required" }, { status: 400 });
  }

  const supabase = getServiceSupabase();

  const admin = await isPlatformAdmin(auth.userId, supabase);
  if (!admin) {
    return NextResponse.json(
      { error: "Platform admin access required" },
      { status: 403, headers: rateLimitHeaders(auth.userId) }
    );
  }

  const { data: source, error: srcErr } = await supabase
    .from("sources")
    .select("id, url, name")
    .eq("id", id)
    .single();

  if (srcErr || !source) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  // Forward the caller's auth token to the agent route. Same-origin
  // server-to-server fetch — APP_URL fallback to derive the base URL
  // from the incoming request when not set.
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
      body: JSON.stringify({ sourceUrl: source.url }),
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: `Agent fetch failed: ${e.message}` },
      { status: 502, headers: rateLimitHeaders(auth.userId) }
    );
  }

  const payload = await agentResp.json().catch(() => ({}));

  // Per-item cooldown from the agent route — pass through honestly.
  if (agentResp.status === 429) {
    return NextResponse.json(
      {
        success: false,
        error: payload?.hint || "An agent run for this item ran within the last hour.",
      },
      { status: 429, headers: rateLimitHeaders(auth.userId) }
    );
  }

  if (!agentResp.ok) {
    return NextResponse.json(
      {
        success: false,
        error: payload?.error || `Agent returned ${agentResp.status}`,
        agentStatus: agentResp.status,
        details: payload,
      },
      { status: 502, headers: rateLimitHeaders(auth.userId) }
    );
  }

  // 200 {skipped: "already_verified"} — the item is certified; the agent
  // route refuses to regenerate without an explicit refresh. Report that,
  // don't claim a regeneration happened.
  if (payload?.skipped === "already_verified") {
    return NextResponse.json(
      {
        success: true,
        queued: false,
        skipped: "already_verified",
        source: source.name,
        url: source.url,
        itemId: payload.item_id ?? null,
        message:
          "Item is already verified — regeneration skipped. Force a re-pull via the agent route's refresh flag.",
      },
      { headers: rateLimitHeaders(auth.userId) }
    );
  }

  // 202 {runId} — the durable workflow is queued. Defer honestly: the new
  // brief does not exist yet, so no length/section/citation counts are
  // reported here.
  return NextResponse.json(
    {
      success: true,
      queued: true,
      runId: payload?.runId ?? null,
      itemId: payload?.item_id ?? null,
      source: source.name,
      url: source.url,
      message:
        "Regeneration queued as a durable workflow. Poll agent_runs (or reload this source) after it completes.",
    },
    { status: 202, headers: rateLimitHeaders(auth.userId) }
  );
}
