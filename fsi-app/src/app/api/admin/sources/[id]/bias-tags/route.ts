// PATCH /api/admin/sources/[id]/bias-tags
//
// Optional override (lane S1-B, 2026-10-04; originally lane W2-A, 2026-09-29).
// bias-tag-pipeline.mjs now stores every tag at 0.65 or above as adopted
// (assignment_source = 'haiku_auto_high_confidence', confidence kept) at
// promotion time, from promote/route.ts and from the machine resolver; no tag
// waits for a click. This route lets an admin confirm (operator_confirmed) or
// remove a tag afterwards, on an adopted row or on a legacy
// 'haiku_proposed_low_confidence' row written before that change.
//
// Body: { biasTagId: string, decision: "confirm" | "reject" }
//   confirm -> UPDATE source_bias_tags SET assignment_source =
//              'operator_confirmed' WHERE id = biasTagId.
//   reject  -> DELETE FROM source_bias_tags WHERE id = biasTagId.
//
// Only a row not yet carrying an operator decision is actionable
// (adopted or legacy pending; 409 for operator_confirmed / operator_set). See logic.ts for the validation/decision rules (route.ts
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
