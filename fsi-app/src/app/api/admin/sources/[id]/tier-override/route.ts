import { NextRequest, NextResponse } from "next/server";
import { isRefusal, requireAdminRoute } from "@/lib/api/route-guard";
import { rateLimitHeaders } from "@/lib/api/rate-limit";

interface TierOverrideRequest {
  tier_override: number | null;
  override_reason: string | null;
}


// GET /api/admin/sources/[id]/tier-override
//
// Returns the source's current override state plus a recent slice of the
// override audit trail from source_trust_events. Used by SourceAdminControls
// to render the inline tier-override surface (Phase 7 admin chrome).
//
// Response:
//   {
//     base_tier: number,
//     tier_override: number | null,
//     effective_tier: number | null,
//     override_reason: string | null,
//     override_date: string | null,
//     audit: Array<{
//       event_type: 'tier_override' | 'tier_override_revert',
//       reviewer_id: string | null,
//       created_at: string,
//       details: Record<string, unknown>,
//     }>,
//   }
//
// Auth: requireAuth + isPlatformAdmin per the POST handler in this file.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminRoute(request);
  if (isRefusal(auth)) return auth;
  const { supabase } = auth;

  const { id } = await params;
  if (!id) {
    return NextResponse.json(
      { error: "source id required" },
      { status: 400, headers: rateLimitHeaders(auth.userId) }
    );
  }

  const { data: source, error: srcError } = await supabase
    .from("sources")
    .select("id, base_tier, tier_override, effective_tier, override_reason, override_date")
    .eq("id", id)
    .maybeSingle();

  if (srcError) {
    return NextResponse.json(
      { error: srcError.message },
      { status: 500, headers: rateLimitHeaders(auth.userId) }
    );
  }
  if (!source) {
    return NextResponse.json(
      { error: "source not found" },
      { status: 404, headers: rateLimitHeaders(auth.userId) }
    );
  }

  const { data: events } = await supabase
    .from("source_trust_events")
    .select("event_type, reviewer_id, created_at, details")
    .eq("source_id", id)
    .in("event_type", ["tier_override", "tier_override_revert"])
    .order("created_at", { ascending: false })
    .limit(20);

  return NextResponse.json(
    {
      base_tier: source.base_tier ?? null,
      tier_override: source.tier_override ?? null,
      effective_tier: source.effective_tier ?? null,
      override_reason: source.override_reason ?? null,
      override_date: source.override_date ?? null,
      audit: events || [],
    },
    { headers: rateLimitHeaders(auth.userId) }
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminRoute(request);
  if (isRefusal(auth)) return auth;
  const { supabase } = auth;

  const { id } = await params;
  if (!id) {
    return NextResponse.json(
      { error: "source id required" },
      { status: 400, headers: rateLimitHeaders(auth.userId) }
    );
  }

  let body: TierOverrideRequest;
  try {
    body = (await request.json()) as TierOverrideRequest;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: rateLimitHeaders(auth.userId) }
    );
  }

  // tier_override: must be null OR an integer in [1, 7].
  const tierOverride = body.tier_override;
  const overrideReasonRaw = body.override_reason;
  const overrideReason =
    typeof overrideReasonRaw === "string" ? overrideReasonRaw.trim() : null;

  if (tierOverride !== null && tierOverride !== undefined) {
    if (
      typeof tierOverride !== "number" ||
      !Number.isInteger(tierOverride) ||
      tierOverride < 1 ||
      tierOverride > 7
    ) {
      return NextResponse.json(
        { error: "tier_override must be an integer between 1 and 7, or null" },
        { status: 400, headers: rateLimitHeaders(auth.userId) }
      );
    }
    if (!overrideReason || overrideReason.length === 0) {
      return NextResponse.json(
        {
          error:
            "override_reason is required when tier_override is non-null (operator domain knowledge MUST be captured for audit)",
        },
        { status: 400, headers: rateLimitHeaders(auth.userId) }
      );
    }
  }

  // Read current row for audit baseline.
  const { data: existing, error: readError } = await supabase
    .from("sources")
    .select("id, base_tier, tier_override")
    .eq("id", id)
    .maybeSingle();

  if (readError) {
    return NextResponse.json(
      { error: readError.message },
      { status: 500, headers: rateLimitHeaders(auth.userId) }
    );
  }
  if (!existing) {
    return NextResponse.json(
      { error: "source not found" },
      { status: 404, headers: rateLimitHeaders(auth.userId) }
    );
  }

  const previousOverride: number | null =
    existing.tier_override == null ? null : Number(existing.tier_override);
  const baseTier: number | null =
    existing.base_tier == null ? null : Number(existing.base_tier);
  const isRevert = tierOverride === null || tierOverride === undefined;

  // Effective-tier-before for the audit payload uses COALESCE(prev, base)
  // since computed_dynamic_tier is not yet wired (Q2 future work).
  const beforeTier: number | null =
    previousOverride !== null ? previousOverride : baseTier;
  const afterTier: number | null = isRevert ? baseTier : tierOverride;

  const nowIso = new Date().toISOString();

  const updatePayload = isRevert
    ? {
        tier_override: null,
        override_reason: null,
        override_date: nowIso,
      }
    : {
        tier_override: tierOverride,
        override_reason: overrideReason,
        override_date: nowIso,
      };

  const { error: updateError } = await supabase
    .from("sources")
    .update(updatePayload)
    .eq("id", id);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 500, headers: rateLimitHeaders(auth.userId) }
    );
  }

  // Audit: source_trust_events row. event_type and details payload per
  // dispatch brief.
  const eventType = isRevert ? "tier_override_revert" : "tier_override";
  const details = isRevert
    ? {
        previous_override: previousOverride,
        reason: overrideReason,
      }
    : {
        before_tier: beforeTier,
        after_tier: afterTier,
        reason: overrideReason,
        reviewer_id: auth.userId,
      };

  const { error: eventError } = await supabase
    .from("source_trust_events")
    .insert({
      source_id: id,
      event_type: eventType,
      details,
      created_by: "human",
      reviewer_id: auth.userId,
    });

  if (eventError) {
    // Audit failure is reported but does not roll back the column write.
    // Surface to the operator so the audit gap is visible.
    return NextResponse.json(
      {
        success: true,
        sourceId: id,
        action: isRevert ? "revert" : "set",
        tier_override: isRevert ? null : tierOverride,
        warning: `Override applied but audit event insert failed: ${eventError.message}`,
      },
      { status: 200, headers: rateLimitHeaders(auth.userId) }
    );
  }

  return NextResponse.json(
    {
      success: true,
      sourceId: id,
      action: isRevert ? "revert" : "set",
      tier_override: isRevert ? null : tierOverride,
      override_reason: isRevert ? null : overrideReason,
      override_date: nowIso,
      before_tier: beforeTier,
      after_tier: afterTier,
    },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
