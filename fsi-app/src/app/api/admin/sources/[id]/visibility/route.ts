// POST /api/admin/sources/[id]/visibility { admin_only: boolean }
//
// Toggles a source's admin_only flag. When admin_only=true, the source
// is hidden from workspace-facing reads (fetchSources default in
// supabase-server.ts) and remains visible only via /api/admin/sources/all.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

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

  const supabase = getServiceClient();

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
