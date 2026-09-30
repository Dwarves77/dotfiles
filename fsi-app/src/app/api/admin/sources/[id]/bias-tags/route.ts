// PATCH /api/admin/sources/[id]/bias-tags
//
// Coordinator ruling 2026-09-29 (lane W2-A): the 0.65-0.79 confidence band is
// only "surfaced for operator confirm" (per the recommend-classification
// system prompt and migration 092's own comment on `operator_confirmed`) if a
// confirm action actually exists. bias-tag-pipeline.mjs writes low-confidence
// rows into `source_bias_tags` with assignment_source =
// 'haiku_proposed_low_confidence' at candidate-approval time
// (promote/route.ts); this route is the missing confirm/reject step on those
// rows once the source is live.
//
// Body: { biasTagId: string, decision: "confirm" | "reject" }
//   confirm -> UPDATE source_bias_tags SET assignment_source =
//              'operator_confirmed' WHERE id = biasTagId.
//   reject  -> DELETE FROM source_bias_tags WHERE id = biasTagId.
//
// Only a row currently in 'haiku_proposed_low_confidence' is actionable
// (409 otherwise). See logic.ts for the validation/decision rules (route.ts
// exports only route handlers per the BUILDGATE 2026-09-02 convention).
//
// Auth: requireAdminRoute (requireAuth + isPlatformAdmin), matching every
// other route under src/app/api/admin/sources/**; F2 accepts this gate for
// src/app/api/admin/**.

import { NextRequest, NextResponse } from "next/server";
import { isRefusal, requireAdminRoute } from "@/lib/api/route-guard";
import { rateLimitHeaders } from "@/lib/api/rate-limit";
import {
  buildAuditEvent,
  checkActionable,
  CONFIRMED_ASSIGNMENT_SOURCE,
  validatePatchBody,
  type BiasTagPatchBody,
} from "./logic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminRoute(request);
  if (isRefusal(auth)) return auth;
  const { supabase } = auth;

  const { id: sourceId } = await params;
  if (!sourceId) {
    return NextResponse.json(
      { error: "source id required" },
      { status: 400, headers: rateLimitHeaders(auth.userId) }
    );
  }

  let rawBody: BiasTagPatchBody;
  try {
    rawBody = (await request.json()) as BiasTagPatchBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: rateLimitHeaders(auth.userId) }
    );
  }

  const validated = validatePatchBody(rawBody);
  if (!validated.ok) {
    return NextResponse.json(
      { error: validated.error },
      { status: 400, headers: rateLimitHeaders(auth.userId) }
    );
  }
  const { biasTagId, decision } = validated.value;

  const { data: row, error: readError } = await supabase
    .from("source_bias_tags")
    .select("id, source_id, dimension, tag, confidence, assignment_source")
    .eq("id", biasTagId)
    .eq("source_id", sourceId)
    .maybeSingle();

  if (readError) {
    return NextResponse.json(
      { error: readError.message },
      { status: 500, headers: rateLimitHeaders(auth.userId) }
    );
  }
  if (!row) {
    return NextResponse.json(
      { error: "bias tag not found for this source" },
      { status: 404, headers: rateLimitHeaders(auth.userId) }
    );
  }

  const actionable = checkActionable(row);
  if (!actionable.ok) {
    return NextResponse.json(
      { error: actionable.error },
      { status: actionable.status, headers: rateLimitHeaders(auth.userId) }
    );
  }

  if (decision === "confirm") {
    const { error: updateError } = await supabase
      .from("source_bias_tags")
      .update({ assignment_source: CONFIRMED_ASSIGNMENT_SOURCE })
      .eq("id", biasTagId);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500, headers: rateLimitHeaders(auth.userId) }
      );
    }
  } else {
    const { error: deleteError } = await supabase
      .from("source_bias_tags")
      .delete()
      .eq("id", biasTagId);

    if (deleteError) {
      return NextResponse.json(
        { error: deleteError.message },
        { status: 500, headers: rateLimitHeaders(auth.userId) }
      );
    }
  }

  // Audit trail. Best-effort: an audit insert failure is reported but does
  // not roll back the row write, same posture as tier-override/route.ts.
  const { error: eventError } = await supabase
    .from("source_trust_events")
    .insert(buildAuditEvent({ sourceId, biasTagId, decision, row, reviewerId: auth.userId }));

  if (eventError) {
    return NextResponse.json(
      {
        success: true,
        sourceId,
        biasTagId,
        decision,
        warning: `Action applied but audit event insert failed: ${eventError.message}`,
      },
      { status: 200, headers: rateLimitHeaders(auth.userId) }
    );
  }

  return NextResponse.json(
    { success: true, sourceId, biasTagId, decision },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
