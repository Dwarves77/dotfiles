import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "../../../_lib/supabase-admin";
import { requireAdmin } from "../../../_lib/auth";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/staged/:id/reject
 * Reject a staged update (admin only).
 * Body: { reason?: string }
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await context.params;
  const adminId = auth.userId;
  const body = await request.json().catch(() => ({}));

  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from("staged_updates")
    .update({
      status: "rejected",
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
      reason: (body as Record<string, unknown>).reason || null,
    })
    .eq("id", id)
    .eq("status", "pending")
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Staged update not found or already processed" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    data: { id, status: "rejected" },
  });
}
