import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, isSupabaseConfigured } from "@/lib/supabase-admin";
import { requireAuth } from "@/lib/api-auth";

// GET /api/sources — list source registry
export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const db = getAdminClient();

  const { data, error } = await db
    .from("source_registry")
    .select("*")
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST /api/sources — add a source (admin)
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, "admin");
  if (!auth.ok) return auth.response;

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const db = getAdminClient();
  const body = await req.json();

  const { data, error } = await db
    .from("source_registry")
    .insert({
      name: body.name,
      url: body.url,
      region: body.region,
      type: body.type,
      check_frequency: body.check_frequency || "weekly",
      is_active: true,
      notes: body.notes,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data, { status: 201 });
}
