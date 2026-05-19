// POST /api/admin/sources/[id]/tier-override
//
// Q5 tier override endpoint per source-credibility-model skill Section 7.
// Body:
//   { tier_override: number | null, override_reason: string | null }
//
// Set semantic (tier_override is a number 1-7):
//   - Validates tier_override BETWEEN 1 AND 7
//   - Requires non-empty override_reason
//   - Reads current tier_override + base_tier for audit before/after
//   - UPDATEs sources.tier_override, override_reason, override_date = NOW()
//   - INSERTs source_trust_events row with event_type='tier_override',
//     created_by='human', reviewer_id=auth.userId, details={ before_tier,
//     after_tier, reason }
//
// Revert semantic (tier_override is null):
//   - Reads current tier_override for audit (previous_override)
//   - UPDATEs sources.tier_override = NULL, override_reason = NULL,
//     override_date = NOW() (the revert action is itself an event;
//     override_date carries the revert timestamp per Q5)
//   - INSERTs source_trust_events row with event_type='tier_override_revert',
//     created_by='human', reviewer_id=auth.userId, details={
//     previous_override, reason: provided_or_null }
//
// Audit trail lives in source_trust_events (migration 004 + migration 093
// CHECK extension to admit the two new event_type values). Override does
// NOT modify base_tier; base preserves the classifier's original judgment.
//
// Auth: requireAuth + isPlatformAdmin per sweep-discipline rule and
// Track B-code admin-gating precedent (commit 4c7b546). Matches the
// canonical pattern from src/app/api/admin/sources/bulk-import/route.ts:
// 323-338. Rate-limited per the same pattern.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { isPlatformAdmin } from "@/lib/auth/admin";

interface TierOverrideRequest {
  tier_override: number | null;
  override_reason: string | null;
}

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

  const supabase = getServiceClient();

  const admin = await isPlatformAdmin(auth.userId, supabase);
  if (!admin) {
    return NextResponse.json(
      { error: "Platform admin access required" },
      { status: 403, headers: rateLimitHeaders(auth.userId) }
    );
  }

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
