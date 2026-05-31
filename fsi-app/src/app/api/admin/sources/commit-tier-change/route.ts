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
// ADDITIVE-ONLY note: a base_tier UPDATE on a sources row is an operator-driven
// curation write (Phase 1.5), not a Block-1 corpus mutation — it does not flip
// any intelligence_items provenance_status. Not run in Block 1.

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

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const supabase = getServiceClient();
  const admin = await isPlatformAdmin(auth.userId, supabase);
  if (!admin) {
    return NextResponse.json({ error: "Platform admin access required" }, { status: 403 });
  }

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

  // Seeded: operator-decided base_tier update.
  const { data: prior } = await supabase
    .from("sources")
    .select("id, base_tier")
    .eq("id", source_id)
    .maybeSingle();
  if (!prior) {
    return NextResponse.json({ error: "source not found" }, { status: 404 });
  }

  const { error: updErr } = await supabase
    .from("sources")
    .update({ base_tier: tier })
    .eq("id", source_id);
  if (updErr) {
    return NextResponse.json({ error: `tier update failed: ${updErr.message}` }, { status: 500 });
  }

  console.log(
    `[commit-tier-change] source=${source_id} base_tier ${prior.base_tier ?? "null"} -> ${tier} ` +
      `by admin=${auth.userId}`
  );

  return NextResponse.json(
    { success: true, source_id, prior_tier: prior.base_tier ?? null, tier },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
