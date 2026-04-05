import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";

// GET /api/sources — list all sources with trust metrics
export async function GET(request: NextRequest) {
  // Auth required
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  // Rate limit
  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 500 }
    );
  }

  try {
    const supabase = createClient(url, key);
    const { data, error } = await supabase
      .from("sources")
      .select("*")
      .order("tier", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { sources: data, count: data?.length || 0 },
      { headers: rateLimitHeaders(auth.userId) }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
