// POST /api/admin/sources/commit-tier-change — Sprint 4 task 1.15 (UNVERIFIED-PENDING-RUNTIME)
//
// Commits an operator-decided tier (gated on the operator tick — the authority,
// not the Haiku recommendation). For SEEDED sources it updates sources.base_tier
// directly. For PROVISIONAL sources, promotion-to-sources owns tier assignment,
// so this endpoint defers to /api/admin/sources/promote (the ProvisionalReviewCard
// approve flow) rather than writing a provisional row's tier in place.
//
// Body: { source_id: string, tier: number, kind: "seeded" | "provisional" }
//
// A source carrying a tier_override is refused with 409 (G7-TIER): revert via sources/[id]/tier-override.
//
// ADDITIVE-ONLY note: a base_tier UPDATE on a sources row is an operator-driven
// curation write (Phase 1.5), not a Block-1 corpus mutation — it does not flip
// any intelligence_items provenance_status. Not run in Block 1.

import { NextRequest, NextResponse } from "next/server";
import { isRefusal, requireAdminRoute } from "@/lib/api/route-guard";
import { d3AuditEvent } from "@/lib/d3/hooks.mjs";
import { rateLimitHeaders } from "@/lib/api/rate-limit";
import { commitSeededTierChange, type CommitTierChangeClient } from "./logic";



export async function POST(request: NextRequest) {
  const auth = await requireAdminRoute(request);
  if (isRefusal(auth)) return auth;
  const { supabase } = auth;

  let body: { source_id?: string; tier?: number; kind?: "seeded" | "provisional" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { source_id, tier, kind } = body;
  if (!source_id || typeof tier !== "number" || !kind) {
    return NextResponse.json({ error: "source_id, tier (number), and kind are required" }, { status: 400 });
  }
  if (tier < 1 || tier > 7) {
    return NextResponse.json({ error: "tier must be 1-7" }, { status: 400 });
  }

  if (kind === "provisional") {
    // Promotion owns provisional -> sources tier assignment (with the full
    // classification). Direct caller to the existing promote flow.
    return NextResponse.json(
      { error: "Provisional sources set their tier via /api/admin/sources/promote (the approve flow)." },
      { status: 409 }
    );
  }

  // Seeded: operator-decided base_tier update. Refused (409) under an admin tier_override (logic.ts).
  const result = await commitSeededTierChange(supabase as unknown as CommitTierChangeClient, source_id, tier);
  if (result.status !== 200) return NextResponse.json(result.body, { status: result.status });

  console.log(
    `[commit-tier-change] source=${source_id} base_tier ${result.body.prior_tier ?? "null"} -> ${tier} ` +
      `by admin=${auth.userId}`
  );

  await d3AuditEvent(supabase, { scope: "data", event: "ingest:classification" });

  return NextResponse.json(
    result.body,
    { headers: rateLimitHeaders(auth.userId) }
  );
}
