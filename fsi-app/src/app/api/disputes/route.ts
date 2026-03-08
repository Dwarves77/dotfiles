import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "../_lib/supabase-admin";
import { requireAdmin } from "../_lib/auth";

/**
 * GET /api/disputes
 * All active disputes.
 */
export async function GET() {
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from("disputes")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data || [] });
}

/**
 * POST /api/disputes
 * Create a new dispute (admin only).
 * Body: { resource_id: string, note: string, sources: { name: string, url: string }[] }
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const { resource_id, note, sources } = await request.json();

  if (!resource_id || !note) {
    return NextResponse.json(
      { error: "resource_id and note are required" },
      { status: 400 }
    );
  }

  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from("disputes")
    .insert({
      resource_id,
      note,
      sources: sources || [],
      active: true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
