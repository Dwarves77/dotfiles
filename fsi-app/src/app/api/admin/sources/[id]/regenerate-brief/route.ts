// POST /api/admin/sources/[id]/regenerate-brief
//
// Manual on-demand brief regeneration for a single source. Bypasses
// pause state (sets bypassPause: true on the agent route) and uses the
// existing /api/agent/run pipeline so brief content, citation
// extraction, and intelligence_summaries all populate the same way as
// scheduled runs would.

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

  const supabase = getServiceClient();
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

  const startTime = Date.now();
  let agentResp: Response;
  try {
    agentResp = await fetch(`${baseUrl}/api/agent/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify({ sourceUrl: source.url, bypassPause: true }),
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: `Agent fetch failed: ${e.message}` },
      { status: 502, headers: rateLimitHeaders(auth.userId) }
    );
  }

  const payload = await agentResp.json().catch(() => ({}));
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

  // Pull the most recent intelligence_items row for this source so we can
  // surface a brief length / section count to the operator.
  const { data: latestItem } = await supabase
    .from("intelligence_items")
    .select("id, full_brief, updated_at")
    .eq("source_url", source.url)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const briefLength = latestItem?.full_brief?.length ?? 0;
  const sectionsPopulated = (latestItem?.full_brief?.match(/^#{1,3}\s/gm) || []).length;

  return NextResponse.json(
    {
      success: true,
      source: source.name,
      url: source.url,
      itemsFound: payload.items_found ?? 0,
      itemsSignal: payload.items_signal ?? 0,
      synopsesWritten: payload.synopses_written ?? 0,
      citationsExtracted: payload.citations_extracted ?? 0,
      citationsWritten: payload.citations_written ?? 0,
      provisionalsCreated: payload.provisionals_created ?? 0,
      briefLength,
      sectionsPopulated,
      durationMs: Date.now() - startTime,
    },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
