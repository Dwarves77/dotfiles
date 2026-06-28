// POST /api/admin/sources/[id]/fetch-now
//
// Manual on-demand fetch for a single source. Bypasses the cooldown logic in
// /api/data/fetch-source (explicit admin action) but, as of Phase 0.1 (2026-06-28),
// HONORS the global processing hold: a fetch while paused returns 503; the operator
// lifts system_state.global_processing_paused to proceed. (Was "bypasses pause state"
// — superseded; see src/lib/api/pause.ts. Operator override = lift the hold first.)
// Returns a content preview and a hash so the operator can sanity-check
// what was retrieved without paging through the full body.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { d3AuditEvent } from "@/lib/d3/hooks.mjs";
import { createHash } from "crypto";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { isPlatformAdmin } from "@/lib/auth/admin";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { browserlessRender } from "@/lib/sources/browserless";
import { decideFetchOutcome } from "@/lib/sources/fetch-now-decision.mjs";
import { pausedResponse } from "@/lib/api/pause";

const EIA_API_KEY = process.env.EIA_API_KEY;
const NREL_API_KEY = process.env.NREL_API_KEY;
const DATA_GOV_API_KEY = process.env.DATA_GOV_API_KEY;
const REGULATIONS_GOV_API_KEY = process.env.REGULATIONS_GOV_API_KEY;

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Mirror of /api/data/fetch-source's two helpers, kept inline so the
// manual fetch can run independently and bypass cooldown logic.
async function fetchViaApi(endpoint: string, keyEnv?: string, acceptHeader?: string): Promise<string> {
  let url = endpoint;
  const headers: Record<string, string> = { "User-Agent": "CarosLedge/1.0" };
  if (acceptHeader) headers["Accept"] = acceptHeader;
  if (keyEnv === "EIA_API_KEY" && EIA_API_KEY) url += (url.includes("?") ? "&" : "?") + `api_key=${EIA_API_KEY}`;
  else if (keyEnv === "NREL_API_KEY" && NREL_API_KEY) url += (url.includes("?") ? "&" : "?") + `api_key=${NREL_API_KEY}`;
  else if (keyEnv === "DATA_GOV_API_KEY" && DATA_GOV_API_KEY) url += (url.includes("?") ? "&" : "?") + `api_key=${DATA_GOV_API_KEY}`;
  else if (keyEnv === "REGULATIONS_GOV_API_KEY" && REGULATIONS_GOV_API_KEY) headers["X-Api-Key"] = REGULATIONS_GOV_API_KEY;

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  const data = await res.text();
  return data.slice(0, 100000);
}

async function fetchViaBrowserless(sourceUrl: string): Promise<string> {
  const r = await browserlessRender(sourceUrl);
  return r.text;
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

  const admin = await isPlatformAdmin(auth.userId, supabase);
  if (!admin) {
    return NextResponse.json(
      { error: "Platform admin access required" },
      { status: 403, headers: rateLimitHeaders(auth.userId) }
    );
  }

  // Phase 0.1 global-pause gate: honor the global hold even on this explicit manual fetch (was
  // documented as "bypasses pause state"; superseded). Operator override = lift the hold first.
  const paused = await pausedResponse(supabase);
  if (paused) return paused;

  const { data: source, error: srcErr } = await supabase
    .from("sources")
    .select("id, name, url, access_method, api_endpoint, notes")
    .eq("id", id)
    .single();

  if (srcErr || !source) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  const startTime = Date.now();
  let content: string | undefined;
  let method: "api" | "browserless" =
    source.access_method === "api" && source.api_endpoint ? "api" : "browserless";
  let fetchError: any;

  try {
    if (method === "api" && source.api_endpoint) {
      const keyEnv = source.notes?.match(/Key:\s*(\w+)/)?.[1] || undefined;
      const acceptHeader = source.notes?.match(/Accept:\s*([^\n]+)/)?.[1]?.trim() || undefined;
      content = await fetchViaApi(source.api_endpoint, keyEnv, acceptHeader);
    } else {
      content = await fetchViaBrowserless(source.url);
      method = "browserless";
    }
  } catch (e: any) {
    fetchError = e;
  }

  // FORM 1 + FORM 3, delegated to a pure, fixture-tested decision: a non-answer (429/5xx/timeout)
  // is INCONCLUSIVE (503), only a definitive-dead (404/410) stamps last_inaccessible; an error/
  // bot-block BODY is INCONCLUSIVE too (no last_accessible). last_checked is always recorded.
  const decision = decideFetchOutcome({ content, error: fetchError });
  const now = new Date().toISOString();
  const sourceUpdate: Record<string, string> = { last_checked: now };
  if (decision.stamp.inaccessible) sourceUpdate.last_inaccessible = now;
  if (decision.stamp.accessible) sourceUpdate.last_accessible = now;
  await supabase.from("sources").update(sourceUpdate).eq("id", source.id);

  if (decision.kind === "dead") {
    return NextResponse.json(
      { success: false, dead: true, error: fetchError?.message, source: source.name, method: source.access_method },
      { status: decision.httpStatus, headers: rateLimitHeaders(auth.userId) }
    );
  }
  if (decision.kind === "inconclusive") {
    return NextResponse.json(
      { success: false, inconclusive: true, reason: decision.reason, error: fetchError?.message,
        source: source.name, method, contentPreview: content ? content.slice(0, 300) : undefined },
      { status: decision.httpStatus, headers: rateLimitHeaders(auth.userId) }
    );
  }

  // kind === "ok" — content is genuine
  const okContent = content as string;
  const contentHash = createHash("sha256").update(okContent).digest("hex").slice(0, 16);

  await d3AuditEvent(supabase, { scope: "data", event: "ingest:fetch" });

  return NextResponse.json(
    {
      success: true,
      source: source.name,
      url: source.url,
      method,
      contentLength: okContent.length,
      contentHash,
      contentPreview: okContent.slice(0, 800),
      durationMs: Date.now() - startTime,
    },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
