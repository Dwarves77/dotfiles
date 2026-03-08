import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "../../../_lib/supabase-admin";
import { requireAdmin } from "../../../_lib/auth";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/resources/:id/archive
 * Archive a resource (admin only)
 * Body: { reason: string, note?: string, replacedBy?: string }
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await context.params;
  const { reason, note, replacedBy } = await request.json();

  if (!reason) {
    return NextResponse.json({ error: "reason is required" }, { status: 400 });
  }

  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from("resources")
    .update({
      is_archived: true,
      archived_date: new Date().toISOString().slice(0, 10),
      archive_reason: reason,
      archive_note: note || null,
      archive_replacement: replacedBy || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data });
}
