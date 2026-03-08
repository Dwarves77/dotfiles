import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "../../_lib/supabase-admin";
import { requireAdmin } from "../../_lib/auth";
import { mapResourceRow } from "../../_lib/map-resource";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/resources/:id
 * Single resource with timelines, disputes, changelog, cross-references
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const supabase = getAdminClient();

  const [
    { data: row, error },
    { data: timelines },
    { data: disputes },
    { data: changelog },
    { data: xrefs },
  ] = await Promise.all([
    supabase.from("resources").select("*").eq("id", id).single(),
    supabase.from("timelines").select("*").eq("resource_id", id).order("sort_order"),
    supabase.from("disputes").select("*").eq("resource_id", id).eq("active", true),
    supabase.from("changelog").select("*").eq("resource_id", id).order("date", { ascending: false }),
    supabase.from("cross_references").select("*").or(`source_id.eq.${id},target_id.eq.${id}`),
  ]);

  if (error || !row) {
    return NextResponse.json({ error: "Resource not found" }, { status: 404 });
  }

  const resource = mapResourceRow(row, timelines || []);

  return NextResponse.json({
    data: {
      ...resource,
      disputes: disputes || [],
      changelog: changelog || [],
      cross_references: (xrefs || []).map((x: Record<string, unknown>) => ({
        source_id: x.source_id,
        target_id: x.target_id,
        relationship: x.relationship,
      })),
    },
  });
}

/**
 * PATCH /api/resources/:id
 * Update a resource (admin only)
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await context.params;
  const body = await request.json();
  const { changelog_fields, changelog_prev, changelog_now, changelog_impact, ...updates } = body;

  const supabase = getAdminClient();

  // Apply update
  updates.modified_date = new Date().toISOString().slice(0, 10);
  updates.updated_at = new Date().toISOString();

  const { data: resource, error } = await supabase
    .from("resources")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Record changelog if field info provided
  if (changelog_fields) {
    await supabase.from("changelog").insert({
      resource_id: id,
      type: "UPDATED",
      fields: Array.isArray(changelog_fields) ? changelog_fields : [changelog_fields],
      prev_value: changelog_prev || null,
      now_value: changelog_now || null,
      impact: changelog_impact || null,
      date: new Date().toISOString().slice(0, 10),
    });
  }

  return NextResponse.json({ data: resource });
}
