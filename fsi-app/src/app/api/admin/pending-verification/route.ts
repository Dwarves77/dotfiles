// GET /api/admin/pending-verification — Sprint 4 Block 1 task 1.12 (UNVERIFIED-PENDING-RUNTIME)
//
// Feeds the admin verification queue: items at provenance_status =
// 'pending_human_verify' (CRITICAL/HIGH that passed criteria 1-5) plus their
// FACT claims with the source_span PRE-DISPLAYED so the reviewer isn't hunting,
// and the verified_by/verified_at audit fields (task 1.13).

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

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const supabase = getServiceClient();
  const admin = await isPlatformAdmin(auth.userId, supabase);
  if (!admin) {
    return NextResponse.json({ error: "Platform admin access required" }, { status: 403 });
  }

  const { data: items, error } = await supabase
    .from("intelligence_items")
    .select("id, legacy_id, title, priority")
    .eq("provenance_status", "pending_human_verify")
    .order("priority", { ascending: true })
    .limit(200);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const itemIds = (items ?? []).map((i: { id: string }) => i.id);
  const claimsByItem: Record<string, unknown[]> = {};
  if (itemIds.length > 0) {
    const { data: claims } = await supabase
      .from("section_claim_provenance")
      .select(
        "id, intelligence_item_id, section_row_id, claim_text, claim_kind, source_span, source_id, verified_by, verified_at"
      )
      .in("intelligence_item_id", itemIds)
      .eq("claim_kind", "FACT")
      .order("extracted_at", { ascending: true });
    for (const c of (claims ?? []) as Array<{ intelligence_item_id: string }>) {
      (claimsByItem[c.intelligence_item_id] ??= []).push(c);
    }
  }

  const result = (items ?? []).map((i: { id: string }) => ({ ...i, claims: claimsByItem[i.id] ?? [] }));
  return NextResponse.json({ items: result }, { headers: rateLimitHeaders(auth.userId) });
}
