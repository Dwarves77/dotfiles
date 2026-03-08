import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, isSupabaseConfigured } from "@/lib/supabase-admin";

// GET /api/changelog/:resourceId — changes for a specific resource
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ resourceId: string }> }
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const { resourceId } = await params;
  const db = getAdminClient();

  const { data, error } = await db
    .from("changelog")
    .select("*")
    .eq("resource_id", resourceId)
    .order("date", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
