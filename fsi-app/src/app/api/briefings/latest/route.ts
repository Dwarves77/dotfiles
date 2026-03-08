import { NextResponse } from "next/server";
import { getAdminClient } from "../../_lib/supabase-admin";

/**
 * GET /api/briefings/latest
 * Most recent briefing with full content.
 */
export async function GET() {
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from("briefings")
    .select("*")
    .order("week_date", { ascending: false })
    .limit(1)
    .single();

  if (error) {
    return NextResponse.json({ error: "No briefings found" }, { status: 404 });
  }

  return NextResponse.json({ data });
}
