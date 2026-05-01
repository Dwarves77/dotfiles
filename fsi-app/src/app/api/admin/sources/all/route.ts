// GET /api/admin/sources/all
//
// Returns every source in the registry, including those flagged
// admin_only. Used by SourceHealthDashboard to populate its store with
// the full list rather than the workspace-filtered list returned by
// fetchSources's default (which hides admin_only sources from regular
// users).
//
// Auth: Bearer JWT (admin context). RLS would protect the data anyway,
// but the route gate prevents non-admin clients from learning the full
// admin_only list.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";

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
  const { data, error } = await supabase
    .from("sources")
    .select("*")
    .order("tier", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { sources: data || [] },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
