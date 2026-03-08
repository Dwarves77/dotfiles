import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "../_lib/supabase-admin";
import { requireAdmin } from "../_lib/auth";
import { mapResourceRow } from "../_lib/map-resource";

/**
 * GET /api/resources
 * List resources with optional filters: mode, topic, jurisdiction, priority, search, archived
 */
export async function GET(request: NextRequest) {
  const supabase = getAdminClient();
  const params = request.nextUrl.searchParams;

  const showArchived = params.get("archived") === "true";
  const mode = params.get("mode");
  const topic = params.get("topic");
  const jurisdiction = params.get("jurisdiction");
  const priority = params.get("priority");
  const search = params.get("search");
  const limit = Math.min(parseInt(params.get("limit") || "500"), 500);

  let query = supabase
    .from("resources")
    .select("*")
    .eq("is_archived", showArchived)
    .limit(limit);

  if (topic) query = query.eq("topic", topic);
  if (jurisdiction) query = query.eq("jurisdiction", jurisdiction);
  if (priority) query = query.eq("priority", priority);
  if (mode) query = query.contains("modes", [mode]);
  if (search) query = query.or(`title.ilike.%${search}%,note.ilike.%${search}%`);

  const [{ data: rows, error }, { data: timelineRows }] = await Promise.all([
    query,
    supabase.from("timelines").select("*").order("sort_order"),
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const timelineMap = new Map<string, Record<string, unknown>[]>();
  (timelineRows || []).forEach((t: Record<string, unknown>) => {
    const rid = t.resource_id as string;
    const arr = timelineMap.get(rid) || [];
    arr.push(t);
    timelineMap.set(rid, arr);
  });

  const resources = (rows || []).map((row: Record<string, unknown>) =>
    mapResourceRow(row, timelineMap.get(row.id as string))
  );

  return NextResponse.json({ data: resources, count: resources.length });
}

/**
 * POST /api/resources
 * Create a new resource (admin only)
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const { timelines, ...resourceData } = body;

  const supabase = getAdminClient();

  // Insert resource
  const { data: resource, error } = await supabase
    .from("resources")
    .insert(resourceData)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Insert timelines if provided
  if (timelines?.length) {
    const timelineRows = timelines.map((t: { date: string; label: string; status?: string }, i: number) => ({
      resource_id: resource.id,
      date: t.date,
      label: t.label,
      status: t.status || null,
      sort_order: i,
    }));
    await supabase.from("timelines").insert(timelineRows);
  }

  // Record changelog
  await supabase.from("changelog").insert({
    resource_id: resource.id,
    type: "NEW",
    date: new Date().toISOString().slice(0, 10),
  });

  return NextResponse.json({ data: resource }, { status: 201 });
}
