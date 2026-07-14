import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase-service";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { isPlatformAdmin } from "@/lib/auth/admin";

// GET /api/staged-updates — list pending updates (VISIBILITY only; the admin surface renders staged /
// minted / rejected + why, never a human approve/reject — RD-20, Unit 0c).
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  try {
    const supabase = getServiceSupabase();
    // Platform-admin gate (DEEP-AUDIT S1-2 / P0-2). This route lives OUTSIDE
    // /api/admin/* and previously checked only requireAuth, so any authenticated
    // customer could list staged intelligence. Gate on profiles.is_platform_admin.
    const admin = await isPlatformAdmin(auth.userId, supabase);
    if (!admin) {
      return NextResponse.json(
        { error: "Platform admin access required" },
        { status: 403, headers: rateLimitHeaders(auth.userId) }
      );
    }
    const { data, error } = await supabase
      .from("staged_updates")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { updates: data },
      { headers: rateLimitHeaders(auth.userId) }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/staged-updates — RETIRED (Unit 0c, RD-20 residual closing). The human-approval path is CLOSED:
// the machine gates ARE the approval. A staged_update resolves through the machine-gated intake cycle
// (runIntakeCycle / applyStagedUpdate — source↔claim-type congruence + subject dedup + the mint chokepoint +
// the grounding judge) to materialized / rejected-with-reason / routed-to-the-flag-resolver — never a human
// approve/reject. The admin surface is visibility-only (staged / minted / rejected + why). Returns 410 Gone.
export async function POST() {
  return NextResponse.json(
    {
      error:
        "gone: the staged-updates human-approval path is retired (Unit 0c / RD-20). The machine gates ARE the approval — staged updates resolve through the machine-gated intake cycle (materialized / rejected-with-reason / routed-to-flag). This surface is visibility-only.",
      retired: true,
    },
    { status: 410 }
  );
}
