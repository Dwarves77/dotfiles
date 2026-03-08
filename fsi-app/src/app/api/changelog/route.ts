import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "../_lib/supabase-admin";

/**
 * GET /api/changelog
 * Recent changes across all resources.
 * Query params: limit (default 50)
 */
export async function GET(request: NextRequest) {
  const supabase = getAdminClient();
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") || "50"), 200);

  const { data, error } = await supabase
    .from("changelog")
    .select("*")
    .order("date", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data || [] });
}
