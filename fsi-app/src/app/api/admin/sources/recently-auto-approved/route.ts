// GET /api/admin/sources/recently-auto-approved?days=N
//
// W2.F surface for the W2.E "auto-approved awaiting spot-check" admin
// notification category. Returns sources that:
//   - were auto-approved by the verification pipeline within the last N days
//   - have not yet been spot-checked (sources.spotchecked = FALSE — column
//     added in migration 036)
//
// Each row is joined with the source_verifications row that produced it
// (resulting_source_id) so the operator can see the AI scores, rationale,
// rejection-reason history, and full pipeline log inline.
//
// Auth: requireAuth + isPlatformAdmin. 403 for non-admins.
//
// Default days = 7, mirrors the W2.E queue window.
// Max days = 90 (defensive cap; UI lets the operator pick 7/30/90).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { isPlatformAdmin } from "@/lib/auth/admin";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const DEFAULT_DAYS = 7;
const MAX_DAYS = 90;

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const url = new URL(request.url);
  const daysParam = url.searchParams.get("days");
  let days = DEFAULT_DAYS;
  if (daysParam) {
    const parsed = parseInt(daysParam, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      days = Math.min(parsed, MAX_DAYS);
    }
  }

  const supabase = getServiceClient();

  const admin = await isPlatformAdmin(auth.userId, supabase);
  if (!admin) {
    return NextResponse.json(
      { error: "Platform admin access required" },
      { status: 403, headers: rateLimitHeaders(auth.userId) }
    );
  }

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // Pull the unspotchecked sources first (small, indexed). We do the
  // verification join client-side so we can be defensive about rows
  // that don't have a verification record (legacy rows imported by
  // hand pre-W2.F).
  const { data: sources, error: srcErr } = await supabase
    .from("sources")
    .select(
      "id, name, url, description, tier, jurisdictions, transport_modes, " +
        "domains, intelligence_types, status, admin_only, spotchecked, " +
        "created_at, notes"
    )
    .eq("spotchecked", false)
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  if (srcErr) {
    return NextResponse.json(
      { error: `sources query failed: ${srcErr.message}` },
      { status: 500, headers: rateLimitHeaders(auth.userId) }
    );
  }

  type SourceRow = { id: string; [k: string]: unknown };
  type VerificationRow = {
    id: string;
    candidate_url: string;
    ai_relevance_score: number | null;
    ai_freight_score: number | null;
    ai_trust_tier: string | null;
    verification_tier: string;
    rejection_reason: string | null;
    verification_log: Record<string, unknown>;
    resulting_source_id: string | null;
    created_at: string;
  };

  const sourceRows = (sources ?? []) as unknown as SourceRow[];
  const ids = sourceRows.map((s) => s.id);

  const verificationByResultingId: Record<string, Omit<VerificationRow, "resulting_source_id">> = {};

  if (ids.length > 0) {
    const { data: verifs, error: verErr } = await supabase
      .from("source_verifications")
      .select(
        "id, candidate_url, ai_relevance_score, ai_freight_score, " +
          "ai_trust_tier, verification_tier, rejection_reason, " +
          "verification_log, resulting_source_id, created_at"
      )
      .in("resulting_source_id", ids)
      .eq("verification_tier", "H");

    if (verErr) {
      console.warn(`[recently-auto-approved] verification join failed: ${verErr.message}`);
    } else if (verifs) {
      for (const v of verifs as unknown as VerificationRow[]) {
        if (v.resulting_source_id) {
          verificationByResultingId[v.resulting_source_id] = {
            id: v.id,
            candidate_url: v.candidate_url,
            ai_relevance_score: v.ai_relevance_score,
            ai_freight_score: v.ai_freight_score,
            ai_trust_tier: v.ai_trust_tier,
            verification_tier: v.verification_tier,
            rejection_reason: v.rejection_reason,
            verification_log: v.verification_log,
            created_at: v.created_at,
          };
        }
      }
    }
  }

  const rows = sourceRows.map((s) => ({
    source: s,
    verification: verificationByResultingId[s.id] ?? null,
  }));

  return NextResponse.json(
    {
      days,
      count: rows.length,
      rows,
    },
    {
      headers: {
        ...rateLimitHeaders(auth.userId),
        "Cache-Control": "no-store",
      },
    }
  );
}
