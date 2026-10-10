// Pure logic behind PATCH /api/admin/sources/[id]/bias-tags, split out of
// route.ts per the BUILDGATE 2026-09-02 convention (route.ts exports only
// route handlers; testable decision logic lives in a sibling module, e.g.
// src/app/api/admin/recompute-trust/logic.ts, src/app/api/admin/sources/
// bulk-import/logic.ts, src/app/api/worker/check-sources/logic.ts).
//
// No DB access here. The route wires this against the real supabase client;
// tests wire it against nothing at all, since none of it touches a network.

// LEGACY pending value: no writer produces it since lane S1-B (2026-10-04); rows written earlier may carry it.
export const PENDING_ASSIGNMENT_SOURCE = "haiku_proposed_low_confidence";
// The value machine promotion now stores for every tag at or above 0.65, confidence kept in its own column.
const ADOPTED_ASSIGNMENT_SOURCE = "haiku_auto_high_confidence";
export const CONFIRMED_ASSIGNMENT_SOURCE = "operator_confirmed";

type BiasTagDecision = "confirm" | "reject";

export interface BiasTagPatchBody {
  biasTagId?: unknown;
  decision?: unknown;
}

interface ValidatedPatch {
  biasTagId: string;
  decision: BiasTagDecision;
}

type ValidationResult =
  | { ok: true; value: ValidatedPatch }
  | { ok: false; error: string };

/** Validates the PATCH body shape. Never throws. */
export function validatePatchBody(body: BiasTagPatchBody): ValidationResult {
  if (typeof body.biasTagId !== "string" || body.biasTagId.length === 0) {
    return { ok: false, error: "biasTagId is required" };
  }
  if (body.decision !== "confirm" && body.decision !== "reject") {
    return { ok: false, error: 'decision must be "confirm" or "reject"' };
  }
  return { ok: true, value: { biasTagId: body.biasTagId, decision: body.decision } };
}

interface BiasTagRow {
  id: string;
  source_id: string;
  dimension: string;
  tag: string;
  confidence: number | null;
  assignment_source: string;
}

type ActionableResult = { ok: true } | { ok: false; error: string; status: number };

/** The admin PATCH is an OPTIONAL override (lane S1-B): a machine-adopted row (haiku_auto_high_confidence)
 *  or a legacy pending row can be confirmed or removed. A row already carrying a human decision
 *  (operator_confirmed / operator_set) has nothing left to confirm or reject. */
export function checkActionable(row: Pick<BiasTagRow, "assignment_source">): ActionableResult {
  if (row.assignment_source !== PENDING_ASSIGNMENT_SOURCE && row.assignment_source !== ADOPTED_ASSIGNMENT_SOURCE) {
    return {
      ok: false,
      status: 409,
      error: `bias tag already carries an operator decision (assignment_source is "${row.assignment_source}")`,
    };
  }
  return { ok: true };
}

interface AuditEventInput {
  sourceId: string;
  biasTagId: string;
  decision: BiasTagDecision;
  row: Pick<BiasTagRow, "dimension" | "tag" | "confidence" | "assignment_source">;
  reviewerId: string;
}

/** Builds the source_trust_events insert payload. Reuses the existing
 *  'manual_review' event_type (migration 093's CHECK already admits it, per
 *  promote/route.ts's own approve/reject audit rows) rather than adding a
 *  new event_type value, which would need a schema migration this lane does
 *  not own (R14). */
export function buildAuditEvent({ sourceId, biasTagId, decision, row, reviewerId }: AuditEventInput) {
  return {
    source_id: sourceId,
    event_type: "manual_review" as const,
    details: {
      decision: decision === "confirm" ? "bias_tag_confirm" : "bias_tag_reject",
      biasTagId,
      dimension: row.dimension,
      tag: row.tag,
      confidence: row.confidence,
      previous_assignment_source: row.assignment_source,
    },
    created_by: "human" as const,
    reviewer_id: reviewerId,
  };
}
