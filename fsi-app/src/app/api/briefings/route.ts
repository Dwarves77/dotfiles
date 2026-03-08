import { NextResponse } from "next/server";
import { getAdminClient } from "../_lib/supabase-admin";

/**
 * GET /api/briefings
 * List all briefings, sorted by date desc.
 */
export async function GET() {
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from("briefings")
    .select("id, week_date, title, summary, format, created_at")
    .order("week_date", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data || [] });
}
