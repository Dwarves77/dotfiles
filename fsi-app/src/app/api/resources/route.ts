import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, isSupabaseConfigured } from "@/lib/supabase-admin";
import { requireAuth } from "@/lib/api-auth";

// GET /api/resources — list all active resources (with optional filters)
export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const db = getAdminClient();
  const params = req.nextUrl.searchParams;

  let query = db.from("resources").select("*, timelines(*)");

  // Filter by archived status (default: active only)
  const showArchived = params.get("archived") === "true";
  query = query.eq("is_archived", showArchived);

  // Optional filters
  const mode = params.get("mode");
  if (mode) query = query.contains("modes", [mode]);

  const topic = params.get("topic");
  if (topic) query = query.eq("topic", topic);

  const jurisdiction = params.get("jurisdiction");
  if (jurisdiction) query = query.eq("jurisdiction", jurisdiction);

  const priority = params.get("priority");
  if (priority) query = query.eq("priority", priority);

  const search = params.get("search");
  if (search) {
    query = query.or(`title.ilike.%${search}%,note.ilike.%${search}%,what_is_it.ilike.%${search}%`);
  }

  const { data, error } = await query.order("added_date", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST /api/resources — create a new resource (admin only)
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, "admin");
  if (!auth.ok) return auth.response;

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const db = getAdminClient();
  const body = await req.json();

  const { timelines, ...resourceData } = body;

  const { data: resource, error } = await db
    .from("resources")
    .insert(resourceData)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Insert timelines if provided
  if (timelines?.length) {
    await db.from("timelines").insert(
      timelines.map((t: { date: string; label: string; sort_order?: number }, i: number) => ({
        resource_id: resource.id,
        date: t.date,
        label: t.label,
        sort_order: t.sort_order ?? i,
      }))
    );
  }

  return NextResponse.json(resource, { status: 201 });
}
