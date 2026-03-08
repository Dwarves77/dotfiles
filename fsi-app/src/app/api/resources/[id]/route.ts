import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, isSupabaseConfigured } from "@/lib/supabase-admin";
import { requireAuth } from "@/lib/api-auth";

// GET /api/resources/:id — single resource with related data
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const { id } = await params;
  const db = getAdminClient();

  const [
    { data: resource, error },
    { data: timelines },
    { data: changelogRows },
    { data: disputes },
    { data: xrefs },
  ] = await Promise.all([
    db.from("resources").select("*").eq("id", id).single(),
    db.from("timelines").select("*").eq("resource_id", id).order("sort_order"),
    db.from("changelog").select("*").eq("resource_id", id).order("date", { ascending: false }),
    db.from("disputes").select("*").eq("resource_id", id).eq("active", true),
    db.from("cross_references").select("*").or(`source_id.eq.${id},target_id.eq.${id}`),
  ]);

  if (error || !resource) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    ...resource,
    timelines: timelines || [],
    changelog: changelogRows || [],
    disputes: disputes || [],
    cross_references: xrefs || [],
  });
}

// PATCH /api/resources/:id — update resource (admin only)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req, "admin");
  if (!auth.ok) return auth.response;

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const { id } = await params;
  const db = getAdminClient();
  const body = await req.json();

  const { data, error } = await db
    .from("resources")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}
