import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "../_lib/supabase-admin";
import { requireAdmin } from "../_lib/auth";

/**
 * GET /api/sources
 * List all active sources from the source registry.
 */
export async function GET() {
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from("source_registry")
    .select("*")
    .eq("is_active", true)
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data || [] });
}

/**
 * POST /api/sources
 * Add a new source to the registry (admin only).
 * Body: { name, url, region?, type?, check_frequency?, notes? }
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();

  if (!body.name || !body.url) {
    return NextResponse.json(
      { error: "name and url are required" },
      { status: 400 }
    );
  }

  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from("source_registry")
    .insert({
      name: body.name,
      url: body.url,
      region: body.region || null,
      type: body.type || null,
      check_frequency: body.check_frequency || "weekly",
      notes: body.notes || null,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
