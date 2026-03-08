import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "../_lib/supabase-admin";

/**
 * GET /api/staged
 * List staged updates. Query param: status (default 'pending')
 */
export async function GET(request: NextRequest) {
  const supabase = getAdminClient();
  const status = request.nextUrl.searchParams.get("status") || "pending";

  const { data, error } = await supabase
    .from("staged_updates")
    .select("*")
    .eq("status", status)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data || [] });
}
