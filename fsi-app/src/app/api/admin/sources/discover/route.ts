// POST /api/admin/sources/discover
//
// W2.B — sub-national-aware discovery agent. Given a jurisdiction code
// (ISO 3166-1, ISO 3166-2, or a supported supranational/IGO free-text
// code), calls Claude Sonnet 4.6 with web_search to surface candidate
// canonical sources. Each candidate is then handed to the W2.F
// verification pipeline (auto-approve / queue-provisional / reject).
//
// Auth: requireAuth + isPlatformAdmin. The discovery agent is expected
// to be triggered manually via /admin or by a service-account caller
// enrolled as a platform admin in org_memberships.
//
// Rate limiting: each call counts as 1 request against the per-user
// 60/min limiter. Cost-rate-limiting is implicit — one Sonnet call with
// web_search runs $0.05-$0.15 plus Haiku per candidate, so a careless
// caller is cost-bounded long before the request limiter fires.
//
// Function timeout: 60s (Vercel default for our admin routes). The
// Sonnet call itself can take 30-50s with web_search, and verification
// is sequential per candidate (~3s each). Deep mode with 20 candidates
// will land near the limit; shallow runs ~10s end-to-end.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { isPlatformAdmin } from "@/lib/auth/admin";
import {
  discoverForJurisdiction,
  DiscoveryError,
  type DiscoveryDepth,
  type DiscoveryRequest,
} from "@/lib/sources/discovery";

export const maxDuration = 60;

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const ALLOWED_DEPTHS: ReadonlySet<DiscoveryDepth> = new Set([
  "shallow",
  "normal",
  "deep",
]);

interface RawBody {
  jurisdiction_iso?: unknown;
  depth?: unknown;
  language?: unknown;
  dryRun?: unknown;
}

export async function POST(request: NextRequest) {
  // ── Auth ──
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  // ── Rate limit (single charge per call) ──
  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  // ── Parse body ──
  let body: RawBody;
  try {
    body = (await request.json()) as RawBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const jurisdictionIso =
    typeof body.jurisdiction_iso === "string"
      ? body.jurisdiction_iso.trim()
      : "";
  if (!jurisdictionIso) {
    return NextResponse.json(
      { error: "jurisdiction_iso (string) is required" },
      { status: 400 }
    );
  }

  let depth: DiscoveryDepth = "normal";
  if (typeof body.depth === "string") {
    const cand = body.depth.trim() as DiscoveryDepth;
    if (!ALLOWED_DEPTHS.has(cand)) {
      return NextResponse.json(
        {
          error: `Invalid depth "${body.depth}". Allowed: shallow | normal | deep.`,
        },
        { status: 400 }
      );
    }
    depth = cand;
  }

  const language =
    typeof body.language === "string" && body.language.trim().length > 0
      ? body.language.trim().toLowerCase()
      : undefined;

  const dryRun = body.dryRun === true;

  // ── Platform admin gate ──
  const supabase = getServiceClient();
  const admin = await isPlatformAdmin(auth.userId, supabase);
  if (!admin) {
    return NextResponse.json(
      { error: "Platform admin access required" },
      { status: 403, headers: rateLimitHeaders(auth.userId) }
    );
  }

  // ── Discover ──
  const req: DiscoveryRequest = {
    jurisdiction_iso: jurisdictionIso,
    depth,
    language,
    dryRun,
  };

  try {
    const result = await discoverForJurisdiction(req, { supabase });

    // Trim the heavy fields from the response — raw assistant text and
    // verification log are useful for forensics but bulk inflates the
    // response. Callers that need the full payload can re-run with the
    // helper module directly. We surface the per-candidate outcome with
    // its tier and rejection reason.
    const candidate_outcomes_summary = result.candidate_outcomes.map((o) => ({
      candidate: o.candidate,
      action: o.verification?.action ?? (o.fallback_provisional_id ? "queued-provisional" : "rejected"),
      tier: o.verification?.tier ?? null,
      rejection_reason: o.verification?.rejection_reason ?? null,
      ai_relevance_score: o.verification?.ai_relevance_score ?? null,
      ai_freight_score: o.verification?.ai_freight_score ?? null,
      ai_trust_tier: o.verification?.ai_trust_tier ?? null,
      resulting_source_id: o.verification?.resulting_source_id ?? null,
      resulting_provisional_id:
        o.verification?.resulting_provisional_id ??
        o.fallback_provisional_id ??
        null,
      error: o.error ?? null,
    }));

    return NextResponse.json(
      {
        jurisdiction_iso: result.jurisdiction_iso,
        jurisdiction_label: result.jurisdiction_label,
        depth,
        dryRun,
        candidates: result.candidates,
        candidate_outcomes: candidate_outcomes_summary,
        applied: result.applied,
        used_verification_pipeline: result.used_verification_pipeline,
      },
      { headers: rateLimitHeaders(auth.userId) }
    );
  } catch (e: unknown) {
    if (e instanceof DiscoveryError) {
      switch (e.code) {
        case "invalid_jurisdiction":
          return NextResponse.json(
            { error: e.message, code: e.code },
            { status: 400, headers: rateLimitHeaders(auth.userId) }
          );
        case "missing_api_key":
          return NextResponse.json(
            { error: e.message, code: e.code },
            { status: 500, headers: rateLimitHeaders(auth.userId) }
          );
        case "sonnet_api_error":
          return NextResponse.json(
            {
              error: e.message,
              code: e.code,
              upstreamStatus: e.upstreamStatus,
              upstreamBody: e.upstreamBody,
            },
            { status: 502, headers: rateLimitHeaders(auth.userId) }
          );
        case "parse_error":
          return NextResponse.json(
            {
              error: e.message,
              code: e.code,
              raw_assistant_text: e.rawAssistantText,
            },
            { status: 502, headers: rateLimitHeaders(auth.userId) }
          );
      }
    }
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[/api/admin/sources/discover] unexpected error:", msg);
    return NextResponse.json(
      { error: `Discovery failed: ${msg}` },
      { status: 500, headers: rateLimitHeaders(auth.userId) }
    );
  }
}
