// POST /api/admin/sources/recommend-tier — Sprint 4 task 1.15 (UNVERIFIED-PENDING-RUNTIME)
//
// Returns a Haiku source-tier RECOMMENDATION (kind:'recommendation', not fact)
// for the Phase 1.5 source-tier audit. Invoking this spends a small amount of
// Haiku budget per source; it is NOT run as a batch in Block 1 — the operator
// triggers it per source from the tier-audit card during Phase 1.5.
//
// Body: { source_id: string }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { isPlatformAdmin } from "@/lib/auth/admin";
import { recommendSourceTier } from "@/lib/sources/recommend-source-tier";

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

  let body: { source_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.source_id) {
    return NextResponse.json({ error: "source_id is required" }, { status: 400 });
  }

  try {
    const recommendation = await recommendSourceTier(body.source_id);
    return NextResponse.json({ recommendation }, { headers: rateLimitHeaders(auth.userId) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
