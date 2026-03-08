import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "../../_lib/supabase-admin";
import { requireAdmin } from "../../_lib/auth";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/disputes/:id
 * Resolve a dispute (admin only).
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await context.params;
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from("disputes")
    .update({
      active: false,
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
