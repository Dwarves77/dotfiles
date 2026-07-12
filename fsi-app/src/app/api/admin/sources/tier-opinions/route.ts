// Phase 7 admin chrome: tier-opinion disagreement review surface.
//
// GET  /api/admin/sources/tier-opinions
//   Returns the disagreement rows from get_tier_opinion_disagreements()
//   joined with source identity (name, url), the source's effective_tier
//   for the operator to compare against, and the suggested analyst tier
//   (the modal opined_tier from the array). Empty result means no
//   un-dismissed disagreements in the 90-day window.
//
// POST /api/admin/sources/tier-opinions
//   Body: { source_id: string, action: 'dismiss', reason?: string }
//   Marks every non-dismissed opinion for the source as dismissed. Used
//   when the operator decides the disagreement is not actionable.
//
//   The 'accept' action is NOT implemented here. To accept, the UI calls
//   POST /api/admin/sources/[id]/tier-override with the analyst tier and
//   a reason like "Disagreement review: 8 analyst opinions favor T3";
//   then POSTs here with action='dismiss' to clear the opinions. This
//   keeps each route surface narrow and re-uses the existing audit
//   pipeline (source_trust_events) for the override write.
//
// Auth: requireAuth + isPlatformAdmin per the existing pattern in
// /api/admin/sources/[id]/tier-override/route.ts.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase-service";

import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { isPlatformAdmin } from "@/lib/auth/admin";


interface DisagreementRow {
  target_source_id: string;
  current_base_tier: number | null;
  opined_tiers: number[] | null;
  opinion_count: number;
  distinct_disagreeing_tiers: number;
}

function modal(values: number[]): number | null {
  if (!values || values.length === 0) return null;
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let bestTier = values[0];
  let bestCount = -1;
  for (const [tier, count] of counts.entries()) {
    if (count > bestCount) {
      bestCount = count;
      bestTier = tier;
    }
  }
  return bestTier;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const supabase = getServiceSupabase();

  const admin = await isPlatformAdmin(auth.userId, supabase);
  if (!admin) {
    return NextResponse.json(
      { error: "Platform admin access required" },
      { status: 403, headers: rateLimitHeaders(auth.userId) }
    );
  }

  // The aggregator returns one row per source with current_base_tier from
  // sources.base_tier. We separately fetch effective_tier + name + url so
  // the UI can show every column the disagreement triage needs.
  const { data: rows, error: rpcError } = await supabase.rpc(
    "get_tier_opinion_disagreements",
    { window_days: 90 }
  );

  if (rpcError) {
    return NextResponse.json(
      { error: rpcError.message },
      { status: 500, headers: rateLimitHeaders(auth.userId) }
    );
  }

  const disagreements = (rows || []) as DisagreementRow[];
  if (disagreements.length === 0) {
    return NextResponse.json(
      { items: [] },
      { headers: rateLimitHeaders(auth.userId) }
    );
  }

  const ids = disagreements.map((r) => r.target_source_id);
  const { data: sources } = await supabase
    .from("sources")
    .select("id, name, url, base_tier, effective_tier, tier_override, override_reason")
    .in("id", ids);

  const byId = new Map<string, {
    id: string;
    name: string;
    url: string | null;
    base_tier: number;
    effective_tier: number | null;
    tier_override: number | null;
    override_reason: string | null;
  }>();
  for (const s of sources || []) byId.set(s.id, s as never);

  const items = disagreements.map((d) => {
    const src = byId.get(d.target_source_id);
    const analystTier = modal(d.opined_tiers ?? []);
    const effective = src?.effective_tier ?? src?.base_tier ?? d.current_base_tier;
    const delta =
      analystTier !== null && effective !== null ? analystTier - effective : null;
    return {
      source_id: d.target_source_id,
      source_name: src?.name ?? "(unknown source)",
      source_url: src?.url ?? null,
      base_tier: src?.base_tier ?? d.current_base_tier,
      effective_tier: effective,
      tier_override: src?.tier_override ?? null,
      override_reason: src?.override_reason ?? null,
      analyst_tier: analystTier,
      opined_tiers: d.opined_tiers ?? [],
      opinion_count: Number(d.opinion_count),
      distinct_disagreeing_tiers: d.distinct_disagreeing_tiers,
      delta,
    };
  });

  return NextResponse.json(
    { items },
    { headers: rateLimitHeaders(auth.userId) }
  );
}

interface DismissBody {
  source_id?: string;
  action?: string;
  reason?: string | null;
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const supabase = getServiceSupabase();

  const admin = await isPlatformAdmin(auth.userId, supabase);
  if (!admin) {
    return NextResponse.json(
      { error: "Platform admin access required" },
      { status: 403, headers: rateLimitHeaders(auth.userId) }
    );
  }

  let body: DismissBody;
  try {
    body = (await request.json()) as DismissBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: rateLimitHeaders(auth.userId) }
    );
  }

  const sourceId = typeof body.source_id === "string" ? body.source_id : null;
  const action = typeof body.action === "string" ? body.action : null;
  const reason = typeof body.reason === "string" ? body.reason.trim() : null;

  if (!sourceId) {
    return NextResponse.json(
      { error: "source_id is required" },
      { status: 400, headers: rateLimitHeaders(auth.userId) }
    );
  }
  if (action !== "dismiss") {
    return NextResponse.json(
      { error: "action must be 'dismiss' (accept uses /api/admin/sources/[id]/tier-override directly)" },
      { status: 400, headers: rateLimitHeaders(auth.userId) }
    );
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("source_tier_opinions")
    .update({
      dismissed_at: nowIso,
      dismissed_by: auth.userId,
      dismissed_reason: reason,
    })
    .eq("target_source_id", sourceId)
    .is("dismissed_at", null)
    .select("id");

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: rateLimitHeaders(auth.userId) }
    );
  }

  return NextResponse.json(
    {
      success: true,
      source_id: sourceId,
      dismissed_count: (data || []).length,
      dismissed_at: nowIso,
    },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
