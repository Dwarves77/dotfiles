import { NextResponse } from "next/server";
import { getAdminClient, isSupabaseConfigured } from "@/lib/supabase-admin";

// GET /api/briefings — list all briefings
export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const db = getAdminClient();

  const { data, error } = await db
    .from("briefings")
    .select("id, week_date, title, summary, created_at")
    .order("week_date", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
