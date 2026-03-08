import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "../../_lib/supabase-admin";

interface RouteContext {
  params: Promise<{ resourceId: string }>;
}

/**
 * GET /api/changelog/:resourceId
 * Changelog entries for a specific resource.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const { resourceId } = await context.params;
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from("changelog")
    .select("*")
    .eq("resource_id", resourceId)
    .order("date", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data || [] });
}
