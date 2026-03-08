import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, isSupabaseConfigured } from "@/lib/supabase-admin";
import { requireAuth } from "@/lib/api-auth";

// POST /api/resources/:id/archive
export async function POST(
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
  const { reason, note, replacement } = await req.json();

  const { data, error } = await db
    .from("resources")
    .update({
      is_archived: true,
      archived_date: new Date().toISOString().slice(0, 10),
      archive_reason: reason || "Manual",
      archive_note: note || null,
      archive_replacement: replacement || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}
