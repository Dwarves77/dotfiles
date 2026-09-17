// POST /api/admin/sources/[id]/pause { paused: boolean }
//
// Toggles processing_paused on a single source. When paused: worker
// scans skip this source, /api/agent/run returns 409 for it, trust
// recomputes skip it (preserving its last score). Manual fetch and
// regenerate actions still work.

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

  let body: { paused?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body.paused !== "boolean") {
    return NextResponse.json({ error: "paused (boolean) is required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("sources")
    .update({ processing_paused: body.paused })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { success: true, sourceId: id, paused: body.paused },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
