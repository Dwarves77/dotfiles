// POST /api/admin/sources/pause-global { paused: boolean }
//
// Toggles the singleton system_state.global_processing_paused flag.
// When paused: worker scans, agent runs, and trust recomputes all
// short-circuit. Manual admin actions (fetch-now, regenerate-brief)
// bypass.

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

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  let body: { paused?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body.paused !== "boolean") {
    return NextResponse.json({ error: "paused (boolean) is required" }, { status: 400 });
  }

  const supabase = getServiceClient();

  const { error } = await supabase
    .from("system_state")
    .update({ global_processing_paused: body.paused, updated_at: new Date().toISOString() })
    .eq("id", true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { success: true, paused: body.paused },
    { headers: rateLimitHeaders(auth.userId) }
  );
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("system_state")
    .select("global_processing_paused, updated_at")
    .eq("id", true)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { paused: !!data?.global_processing_paused, updated_at: data?.updated_at ?? null },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
