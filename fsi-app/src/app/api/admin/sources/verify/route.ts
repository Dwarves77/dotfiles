// POST /api/admin/sources/verify
//
// Runs the W2.F auto-verification pipeline over a batch of candidate URLs.
// Each candidate is independently classified into tier H / M / L and (unless
// dryRun=true) acted on:
//   H → INSERT INTO sources (status='active', admin_only=false)
//   M → INSERT INTO provisional_sources (status='pending_review')
//   L → audit log only
//
// Auth: requireAuth + isPlatformAdmin. The discovery agent is the primary
// caller and runs as a service account that's enrolled as a platform admin
// in org_memberships.
//
// Rate limiting: each candidate counts as 1 request against the per-user
// 60/min limiter. A batch of 20 candidates consumes 20 from the budget.
// This is intentional — the rate limit caps Haiku cost per user, and
// hiding 20 Haiku calls behind a single rate-limit slot would defeat
// that. Callers running large batches should chunk and back off.
//
// Function timeout: 60s (Vercel default). At ~3s per candidate end-to-end
// (HEAD + GET + Haiku), we can comfortably handle batches of 15. Larger
// batches will partial-complete and 200 with whatever finished — the
// pipeline is idempotent so the caller can retry the unfinished tail.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { isPlatformAdmin } from "@/lib/auth/admin";
import { verifyCandidate, type VerificationCandidate, type VerificationResult } from "@/lib/sources/verification";

export const maxDuration = 60;

const MAX_BATCH = 25;

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface RequestBody {
  candidates: VerificationCandidate[];
  dryRun?: boolean;
  skipDuplicateCheck?: boolean;
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  // Parse first so we can charge per-candidate against the rate limiter.
  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.candidates) || body.candidates.length === 0) {
    return NextResponse.json(
      { error: "candidates (non-empty array) is required" },
      { status: 400 }
    );
  }
  if (body.candidates.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `batch too large: ${body.candidates.length} > max ${MAX_BATCH}` },
      { status: 400 }
    );
  }
  for (const c of body.candidates) {
    if (!c || typeof c.url !== "string" || !c.url.startsWith("http")) {
      return NextResponse.json(
        { error: "each candidate must have a string `url` starting with http" },
        { status: 400 }
      );
    }
  }

  // Charge the rate limiter once per candidate. If the budget is exhausted
  // mid-batch we 429 and the caller can resume on the next window.
  for (let i = 0; i < body.candidates.length; i++) {
    const limited = checkRateLimit(auth.userId);
    if (limited) {
      const retryHeader = limited.headers.get("Retry-After") ?? "60";
      return NextResponse.json(
        {
          error: "Rate limit exceeded mid-batch",
          completed: i,
          remaining: body.candidates.length - i,
          retry_after_seconds: parseInt(retryHeader, 10),
        },
        { status: 429, headers: limited.headers }
      );
    }
  }

  const supabase = getServiceClient();

  // Platform admin gate. Service-role client bypasses RLS so the role
  // lookup works regardless of the caller's session scoping.
  const admin = await isPlatformAdmin(auth.userId, supabase);
  if (!admin) {
    return NextResponse.json(
      { error: "Platform admin access required" },
      { status: 403, headers: rateLimitHeaders(auth.userId) }
    );
  }

  // Run candidates sequentially. We could parallelize with Promise.allSettled
  // but that would multi-fire Haiku and trip Anthropic's per-key concurrency
  // limit on the larger batches. Sequential keeps the cost predictable and
  // gives us deterministic logs.
  const results: VerificationResult[] = [];
  for (const candidate of body.candidates) {
    try {
      const r = await verifyCandidate(candidate, {
        dryRun: body.dryRun,
        skipDuplicateCheck: body.skipDuplicateCheck,
        supabase,
      });
      results.push(r);
    } catch (e: unknown) {
      // Defensive — verifyCandidate is supposed to never throw, but we
      // don't want a single bad candidate to corrupt the batch response.
      const msg = e instanceof Error ? e.message : String(e);
      results.push({
        tier: "L",
        action: "rejected",
        ai_relevance_score: null,
        ai_freight_score: null,
        ai_trust_tier: null,
        language: null,
        rejection_reason: `pipeline_error: ${msg}`,
        log: {
          candidate_url: candidate.url,
          candidate_name: candidate.name,
          discoveredFor: candidate.discoveredFor,
          reachability: { attempts: 0, finalStatus: null, finalUrl: null, redirects: [] },
          content: { fetched: false },
          domain: { pattern: null, confidence: "low", matchedHost: null },
          duplicate: { skipped: false, matched: false },
          language: { detected: null, method: "skipped" },
          ai: { called: false, error: msg },
          aggregation: { triggers: ["pipeline_error"], decision: "L" },
          action: { taken: "rejected", error: msg },
          timing: { totalMs: 0 },
        },
      });
    }
  }

  const summary = {
    H: results.filter((r) => r.tier === "H").length,
    M: results.filter((r) => r.tier === "M").length,
    L: results.filter((r) => r.tier === "L").length,
    total: results.length,
  };

  return NextResponse.json(
    { results, summary, dryRun: !!body.dryRun },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
