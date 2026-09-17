// POST /api/admin/sources/[id]/visibility { admin_only: boolean }
//
// Toggles a source's admin_only flag. When admin_only=true, the source
// is hidden from workspace-facing reads (fetchSources default in
// supabase-server.ts) and remains visible only via /api/admin/sources/all.

import { NextRequest, NextResponse } from "next/server";

import { isRefusal, requireAdminRoute } from "@/lib/api/route-guard";
import { rateLimitHeaders } from "@/lib/api/rate-limit";


export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminRoute(request);
  if (isRefusal(auth)) return auth;
  const { supabase } = auth;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "source id required" }, { status: 400 });
  }

  let body: { admin_only?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body.admin_only !== "boolean") {
    return NextResponse.json({ error: "admin_only (boolean) is required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("sources")
    .update({ admin_only: body.admin_only })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { success: true, sourceId: id, admin_only: body.admin_only },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
